# Backend Cleanup & Deduplication — Findings Report

Scope: `backend/` (Go, gin). ~8,750 non-test LOC across `internal/`. Analysis is
against `main` and is read-only — no code changed yet. Findings are ordered by
impact-to-effort; each lists concrete locations so they can be turned into tasks.

## Summary

The backend is reasonably structured (clean `services` / `handlers` / `middleware`
split, a DI container, a real structured-error package). The main issues are
**inconsistency and duplication that already have a "right answer" in the codebase**
— a good error system that only one handler uses, repeated inline boilerplate, a
1,100-line god-service, test-only dead code, and a couple of redundant abstractions.
Most fixes are mechanical and low-risk.

| # | Finding | Severity | Effort | Files |
|---|---------|----------|--------|-------|
| 1 | Structured error system bypassed by ~174 ad-hoc `gin.H{"error": ...}` responses | High | Med | all handlers |
| 2 | `document_service.go` is a 1,144-line god service (5 responsibilities) | High | Med-High | services |
| 3 | Test-only dead code: `ReadDocument`, `UpdateDocument`, `CreateDocumentInFolder`, `buildFilePath` | Med | Low | document_service.go |
| 4 | Repeated `authenticated_user` extraction block (7×) | Med | Low | handlers |
| 5 | Repeated "secret store locked" guard (5×) | Med | Low | secrets_handler.go |
| 6 | Duplicated GitHub combined-status struct (3×) + oauth2 client setup (3×) | Med | Low | github_*.go |
| 7 | Repeated JSON-file store pattern (load/mutate/save+mutex) across 4 services | Med | Med | services/config |
| 8 | Duplicate `User` types + manual field-copy mapping; `AuthService` mostly a pass-through | Low-Med | Low | auth_service.go |
| 9 | Inconsistent path-building helpers (`buildFilePath` vs `buildFilePathFromPath`) | Med | Low | document_service.go |
| 10 | Fragile `strings.Contains(err.Error(), "not found")` error classification | Med | Med | handlers/services |
| 11 | Odd filenames `api._handler.go`, `document_versions._handler.go` | Low | Low | handlers |

---

## 1. The structured error system is bypassed almost everywhere (High)

There is a well-built error package — `internal/errors/errors.go` (typed
`APIError` with codes, HTTP status, details, cause) plus `handlers/errors.go`
(`HandleError`, `ValidateJSONBody`, `ValidatePathParameter`, structured logging,
panic recovery). It's genuinely good.

**Only `documents_handler.go` uses it.** Every other handler hand-rolls
`c.JSON(http.StatusXxx, gin.H{"error": err.Error()})`. Count of ad-hoc error
responses by file:

```
api._handler.go            41   github_handler.go     31
document_versions._handler 16   passkey_handler.go    22
secrets_handler.go         16   shares_handler.go     16
folders_handler.go         14   documents_handler.go   8 (mixed)
assets_handler.go           7   export_handler.go      3
```

~174 occurrences total. Consequences: inconsistent response shape
(`{"error": "..."}` vs `{"error","code","details"}`), inconsistent status codes,
leaked internal error strings to clients, and no structured logging on those paths.

**Action:** migrate handlers to `HandleError` + the `errors.New*` constructors and
`ValidateJSONBody`/`ValidatePathParameter`. Mechanical, high-consistency payoff.

## 2. `document_service.go` is a god service (High)

1,144 lines / ~42 methods spanning **five** responsibilities: documents (CRUD),
folders (tree/create/rename/move/delete), search + tags, version history (git),
and import/export (zip). This is the single biggest file and the hardest to test
in isolation.

**Action:** split along seams that already exist in the method names:
`FolderService`, `SearchService` (search + `GetAllTags`), `VersionService`
(`GetDocumentVersions`/`AtVersion`/`Compare`/`Restore`), `ImportExportService`.
The core `DocumentService` then keeps just CRUD + save/read. Can be done
incrementally (one extraction per PR).

## 3. Test-only dead code (Med, Low effort)

These production methods are referenced **only by tests**:

- `DocumentService.ReadDocument(slug)` — `document_service.go:168`. Superseded by
  `GetDocumentByPath`; duplicates the read+deserialize logic.
- `DocumentService.UpdateDocument(doc)` — `:183`. Thin wrapper over
  `UpdateDocumentWithSaveType(doc, "manual")`; handlers call the latter directly.
- `DocumentService.CreateDocumentInFolder(...)` — `:319`. Overlaps `CreateDocument`
  (slug gen + timestamps + save); no production caller.
- `buildFilePath(slug)` — `:264`. Naive `dataDir + "/" + slug` builder used only by
  the two above + `DeleteDocument` (see #9).

**Action:** delete the unused methods (and update/relocate the tests that exercise
behavior still covered elsewhere). Removes ~60 LOC and a duplicate read path.

## 4. Repeated `authenticated_user` extraction (Med, Low effort)

The block

```go
username, exists := c.Get("authenticated_user")
if !exists { /* 401 */ }
// ... username.(string)
```

is copy-pasted 7× across `api._handler.go`, `passkey_handler.go`,
`shares_handler.go`, with subtle variations (some 401, some fall back to
`"anonymous"`). **Action:** one helper, e.g.
`func currentUser(c *gin.Context) (string, bool)` (or a small middleware that
requires auth on protected groups), used everywhere.

## 5. Repeated "secret store locked" guard (Med, Low effort)

`secrets_handler.go` repeats this 5×, once per handler:

```go
if !services.SecretManager.IsUnlocked() {
    c.JSON(http.StatusUnauthorized, gin.H{"error": "Secret store is locked"})
    return
}
```

**Action:** a `requireUnlocked` gin middleware on the `/secrets` group (except
`/status` and `/lock`), removing the guard from each handler.

## 6. Duplicated GitHub status struct + oauth2 setup (Med, Low effort)

- The anonymous combined-status struct
  `struct { *services.GitHubSettings; *services.GitHubConnectionStatus }` is built
  identically in 3 handlers (`setupGitHub`, `updateGitHubConfig`, `disconnectGitHub`)
  in `github_handler.go`. Extract a named type + constructor.
- `oauth2.StaticTokenSource(...)` + authenticated client construction is repeated 3×
  in `github_service.go` (`:136`, `:158`, `:467`). Extract a `newGitHubClient(token)`
  helper.

## 7. Repeated JSON-file store pattern (Med)

`user_service.go` (`loadUsers`/`saveUsers`, 8 read/write/marshal sites + mutex),
`share_service.go`, `config/settings.go`, and the secret store all implement the
same "read JSON file → unmarshal → mutate → marshal → write, guarded by a mutex"
shape. **Action:** a small generic helper (`jsonstore[T]` with `Load`/`Save` and
locking) would remove the repetition and centralize error handling and file perms.
Medium effort — touches persistence, so do it after the low-risk items.

## 8. Duplicate `User` types + pass-through service (Low-Med)

`services.User` (`auth_service.go:17`) and `models.User` (`models/user.go`) coexist;
`LoginWithPasskey` and `GetUser` manually copy fields between them. `AuthService`
also forwards a string of calls verbatim to `UserService`
(`IsFirstSetup`, `CreateFirstUser`, `GenerateInviteToken`, `CreateUserFromInvite`).
**Action:** collapse to one user DTO (or a documented mapping), and decide whether
the `AuthService` facade earns its keep or should expose `UserService` directly for
the pass-throughs.

## 9. Inconsistent file-path building (Med, Low effort)

Two helpers exist: `buildFilePath` (`:264`, raw `dataDir + "/" + slug` — ignores
nested folders and uses a hardcoded `/`) and `buildFilePathFromPath` (`:268`, the
correct one using `utils.BuildFilePath` + `filepath.Join`). The naive one is still
used by `DeleteDocument` (`:202`), so permanent deletes compute paths differently
from reads/writes. **Action:** standardize on `buildFilePathFromPath` and delete
`buildFilePath` (ties in with #3).

## 10. Fragile error classification via string matching (Med)

Handlers/services branch on `strings.Contains(err.Error(), "not found")` /
`"already exists"` / `"no such file or directory"` (e.g. `documents_handler.go`,
4 sites; `shares_handler.go` compares full error strings like
`"document not found: document not found"`). This breaks if wording changes and is
already showing double-wrapping. **Action:** return typed/sentinel errors from
services (`errors.Is`/`errors.As`) and map them in one place. Pairs naturally with #1.

## 11. Odd filenames (Low, Low effort)

`handlers/api._handler.go` and `handlers/document_versions._handler.go` have a stray
`._` (likely a rename slip). Harmless to Go, but inconsistent with every other
`*_handler.go`. **Action:** `git mv` to `api_handler.go` / `document_versions_handler.go`.

---

## Suggested sequencing

1. **Quick wins (one PR):** #3 dead code, #9 path helper, #11 filenames, #6 GitHub
   helpers, #5 secrets middleware, #4 auth-user helper. Low risk, immediately
   reduces noise.
2. **Consistency pass (one PR):** #1 error handling + #10 typed errors together.
3. **Structural (incremental PRs):** #2 split the god service; #7 JSON store; #8
   user-type consolidation.

Nothing here changes external API behavior (except #1/#10, which *intentionally*
standardize error response shape — worth confirming the frontend tolerates the
`{error, code, details}` envelope first).
