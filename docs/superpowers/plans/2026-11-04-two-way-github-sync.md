# Two-way GitHub sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull pages edited outside Schist (Obsidian through a clone of the
backup repository) back into the wiki. Different pages merge automatically, the
same page changed on both sides pauses the sync until a side is picked, and an
editor never silently overwrites a page that changed underneath it.

**Architecture:**
- **A pure planner** (`internal/syncplan`) classifies every file from three
  trees (merge base, local, remote) into "apply the remote version" or
  "conflict".
- **`GitHubService`** fetches with go-git, runs the planner, and applies the
  plan to the working tree. A fast-forward, or a merge commit with both parents,
  then gets a normal push.
- **A content hash (`version`)** on every page read, checked against the
  `baseVersion` sent with each save, guards against stale editors.

**Tech Stack:** Go 1.26, Gin, go-git v5, testify; SvelteKit / Svelte 5 (runes),
Vitest browser mode; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-04-two-way-github-sync-design.md`

## Global Constraints

- **Delivery** is three PRs, in order, each merged on green CI before the next
  starts:
  - **PR 1:** the stale-editor guard (Tasks 1–3).
  - **PR 2:** the sync engine on the backend (Tasks 4–9).
  - **PR 3:** the UI and docs (Tasks 10–13).
- **`mode`** is `backup` (the default; empty means backup) or `two-way`.
  Backup-mode behavior must not change.
- **Error codes:**
  - `DOCUMENT_CHANGED` (HTTP 409), with `details.document` holding the
    current page.
  - `SYNC_CONFLICT` (HTTP 409), with `details.conflicts` (paths) and
    `details.remote_head`.
- **`version`** is the hex sha256 of the page file's bytes.
- **A save without `baseVersion` is never refused.** That keeps MCP, the API and
  old clients working.
- **Classification is exactly the spec's table:**
  - A conflict happens only for pages.
  - Files that aren't pages, changed on both sides, take the remote version.
  - No shared history means the base is the empty tree.
- **No partial merges.** Any unresolved conflict means nothing is applied and
  nothing is pushed.
- **Push retries:** at most 3 attempts when the remote moves during a sync.
- **Two-way default interval:** 5 minutes, unless
  `SCHIST_GITHUB_AUTO_SYNC_MINUTES` is set.
- **The repo is public.** No hostnames, domains or deploy details in code,
  commits or PR text.
- **Commits:** conventional commits, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Local test quirks (Windows):** `TestBuildFilePathConsistency`,
  `TestBuildFilePath` and `TestAssetService_ErrorCases` also fail on main, so
  ignore them. CI runs on Linux.

### Deviation from the spec (decided while planning)

- **"The sync's remote is injectable"** is already true. The test harness
  installs a local bare repository as the `https` transport for
  `github.com/<owner>/<repo>` (`installLocalRemote` in
  `internal/services/github_service_internal_test.go`), and `fakeGitHub`
  answers the API. No production change is needed for it.
- **The write lock** is `GitService.writeMu`. It is held by the checked save
  (`DocumentService.UpdateDocumentChecked`, which every `PUT /documents/*`
  goes through) and by the sync's apply step. Writers that don't go through
  that save (MCP edits, imports, moves) are covered by a check in the apply
  step instead: right before writing a file, it compares the file on disk
  with the local blob. On a mismatch it aborts and plans again. This avoids
  putting a lock into every write path.

---

## File map

**PR 1: stale-editor guard**
- Modify `backend/internal/models/models.go`: add `Document.Version`.
- Modify `backend/internal/errors/errors.go`: add `ErrCodeDocumentChanged` and
  `NewDocumentChangedError`.
- Modify `backend/internal/services/git_service.go`: add `writeMu` and
  `LockWrites()`.
- Modify `backend/internal/services/document_service.go`: add
  `contentVersion`; set the version in `GetDocumentByPath`; add
  `UpdateDocumentChecked`.
- Create `backend/internal/services/document_service_version_test.go`.
- Modify `backend/internal/handlers/documents_handler.go`: send `baseVersion`
  through `UpdateDocumentChecked` and answer with the stored page.
- Modify `backend/internal/handlers/content_handlers_test.go`: add the 409
  tests.
- Modify `frontend/src/lib/api/types.ts`: add `Document.version` and
  `UpdateDocumentRequest.baseVersion`.
- Modify `frontend/src/lib/composables/useDocumentDraft.svelte.ts`: send
  `baseVersion`; add the `conflict` state, `loadCurrent()` and `keepMine()`.
- Modify `frontend/src/lib/composables/useDocumentDraft.test.ts`.
- Create `frontend/src/lib/components/editor/StaleDocumentDialog.svelte` and
  `StaleDocumentDialog.test.ts`.
- Modify `frontend/src/lib/components/editor/DocumentInlineEditor.svelte`:
  render the dialog.
- Create `e2e/tests/stale-editor.test.ts`.
- Modify `docs/reference/error-codes.md` and `docs/reference/rest-api.md`.

**PR 2: sync engine**
- Create `backend/internal/syncplan/plan.go` and `plan_test.go`: the pure
  planner and the resolution rules.
- Modify `backend/internal/config/settings.go`: add `Mode` and the pause
  fields to `GitHubSettings`.
- Modify `backend/internal/errors/errors.go`: add `ErrCodeSyncConflict` and
  `NewSyncConflictError`.
- Create `backend/internal/services/github_pull.go`: fetch, trees, merge base,
  `pullOnce` and apply.
- Create `backend/internal/services/github_pull_test.go`: integration tests on
  real repositories.
- Modify `backend/internal/services/github_service.go`: branch the sync on
  mode, add the retry loop, resolutions, preview, conflict versions, and mode
  in config.
- Modify `backend/internal/services/github_service_scheduler.go`: the interval
  becomes a function.
- Modify `backend/internal/services/container.go`: wire the pulled-paths hook
  to `LinkService`.
- Modify `backend/internal/services/ignore_service.go`: add `.obsidian/`.
- Modify `backend/internal/handlers/github_handler.go` and `api_handler.go`:
  the sync body, `/github/sync/preview` and `/github/sync/conflict`.

**PR 3: UI and docs**
- Modify `frontend/src/lib/api/types.ts`, `frontend/src/lib/api/client.ts` and
  `frontend/src/lib/stores/github.svelte.ts`.
- Create `frontend/src/lib/components/github/SyncModeSetting.svelte` and its
  test.
- Create `frontend/src/lib/components/github/SyncConflicts.svelte` and its
  test.
- Create `frontend/src/lib/components/github/SyncConflictBanner.svelte` and its
  test.
- Modify `frontend/src/lib/components/GitHubSettingsSection.svelte` and
  `frontend/src/lib/components/document/DocumentView.svelte`.
- Modify `docs/guides/github-backup.md`, `docs/reference/configuration.md`,
  `docs/reference/rest-api.md` and `docs/reference/error-codes.md`.

---

# PR 1: stale-editor guard

### Task 1: The backend version and the checked save

**Files:**
- Modify: `backend/internal/models/models.go:5-8`
- Modify: `backend/internal/errors/errors.go` (codes block around line 46;
  constructors after `NewSyncRemoteDivergedError`)
- Modify: `backend/internal/services/git_service.go:43-52` (the `GitService`
  struct)
- Modify: `backend/internal/services/document_service.go:312-333`
  (`GetDocumentByPath`), and add `UpdateDocumentChecked` after
  `UpdateDocumentWithSaveType` (line 156)
- Test: `backend/internal/services/document_service_version_test.go`

**Interfaces:**
- Produces:
  - `models.Document.Version string` (JSON `version,omitempty`)
  - `errors.NewDocumentChangedError(current *models.Document) *APIError`
  - `(*GitService).LockWrites() func()`
  - `contentVersion([]byte) string`
  - `(*DocumentService).UpdateDocumentChecked(oldPath string, doc *models.Document, saveType, baseVersion string) error`

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/services/document_service_version_test.go`:

```go
package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	apierrors "github.com/MorrisMorrison/schist/internal/errors"
	"github.com/MorrisMorrison/schist/internal/models"
)

func newVersionTestService(t *testing.T) *DocumentService {
	t.Helper()
	dataDir := t.TempDir()
	gitService, err := NewGitService(dataDir)
	require.NoError(t, err)
	return NewDocumentService(dataDir, gitService, NewIgnoreService(dataDir))
}

func seedPage(t *testing.T, d *DocumentService, path, content string) *models.Document {
	t.Helper()
	require.NoError(t, d.CreateDocument(&models.Document{
		MetaData: &models.DocumentMetaData{Title: "Plan", Path: path},
		Content:  content,
	}))
	doc, err := d.GetDocumentByPath(path)
	require.NoError(t, err)
	return doc
}

func TestGetDocumentByPath_ReturnsContentVersion(t *testing.T) {
	d := newVersionTestService(t)
	doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
	assert.Len(t, doc.Version, 64, "hex sha256")

	again, err := d.GetDocumentByPath("/plan")
	require.NoError(t, err)
	assert.Equal(t, doc.Version, again.Version, "same bytes, same version")
}

func TestUpdateDocumentChecked(t *testing.T) {
	edit := func(doc *models.Document, content string) *models.Document {
		meta := *doc.MetaData
		return &models.Document{MetaData: &meta, Content: content}
	}

	t.Run("matching baseVersion saves", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nv2"), "manual", doc.Version))
		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nv2", saved.Content)
	})

	t.Run("stale baseVersion is refused with the current page", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentWithSaveType(edit(doc, "# Plan\n\nfrom elsewhere"), "manual"))

		err := d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nmine"), "auto", doc.Version)
		var apiErr *apierrors.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, apierrors.ErrCodeDocumentChanged, apiErr.Code)
		current := apiErr.Details["document"].(*models.Document)
		assert.Equal(t, "# Plan\n\nfrom elsewhere", current.Content)

		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nfrom elsewhere", saved.Content, "nothing overwritten")
	})

	t.Run("no baseVersion saves as before", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		require.NoError(t, d.UpdateDocumentWithSaveType(edit(doc, "# Plan\n\nother"), "manual"))
		require.NoError(t, d.UpdateDocumentChecked("/plan", edit(doc, "# Plan\n\nmine"), "manual", ""))
		saved, _ := d.GetDocumentByPath("/plan")
		assert.Equal(t, "# Plan\n\nmine", saved.Content)
	})

	t.Run("a rename is checked against the old path", func(t *testing.T) {
		d := newVersionTestService(t)
		doc := seedPage(t, d, "/plan", "# Plan\n\nv1")
		renamed := edit(doc, "# Roadmap\n\nv1")
		renamed.MetaData.Path = "/roadmap"
		require.NoError(t, d.UpdateDocumentChecked("/plan", renamed, "manual", doc.Version))
		_, err := d.GetDocumentByPath("/roadmap")
		assert.NoError(t, err)
	})
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && go test ./internal/services/ -run 'TestGetDocumentByPath_ReturnsContentVersion|TestUpdateDocumentChecked' -v`
Expected: a compile error (`doc.Version undefined`, `UpdateDocumentChecked undefined`, `ErrCodeDocumentChanged undefined`).

- [ ] **Step 3: Implement**

In `backend/internal/models/models.go`, extend `Document`:

```go
type Document struct {
	MetaData *DocumentMetaData `json:"metaData"`
	Content  string            `json:"content"`
	// Version is a hash of the page file as stored (set on read, never
	// written). A save that sends it back as baseVersion is refused when the
	// file changed since, so an editor can't overwrite a newer page.
	Version string `json:"version,omitempty"`
}
```

In `backend/internal/errors/errors.go`, add to the codes block after
`ErrCodeSyncRemoteDiverged`:

```go
	// ErrCodeDocumentChanged: a save carried a baseVersion that no longer
	// matches the page (it changed through a sync or another user).
	ErrCodeDocumentChanged ErrorCode = "DOCUMENT_CHANGED"
```

Then add after `NewSyncRemoteDivergedError`:

```go
// NewDocumentChangedError refuses a save made from an older version of the
// page. current is the page as it is now, for the client to offer.
func NewDocumentChangedError(current any) *APIError {
	return NewAPIError(ErrCodeDocumentChanged,
		"This page changed since you opened it (on GitHub or by someone else).", http.StatusConflict).
		WithDetails("document", current)
}
```

(The parameter is typed `any` so `errors` doesn't import `models`. The test
asserts on the concrete `*models.Document`.)

In `backend/internal/services/git_service.go`, add a field to `GitService`
after `commitMu`, and a method below the struct:

```go
	// writeMu keeps a checked page save and a sync applying pulled files
	// from interleaving. Take it before commitMu, never the other way round.
	writeMu sync.Mutex
```

```go
// LockWrites holds the wiki's write lock until the returned func is called.
// A nil GitService (tests without git) locks nothing.
func (gs *GitService) LockWrites() func() {
	if gs == nil {
		return func() {}
	}
	gs.writeMu.Lock()
	return gs.writeMu.Unlock
}
```

In `backend/internal/services/document_service.go`, add `"crypto/sha256"` and
`"encoding/hex"` to the imports. Then add the helper:

```go
// contentVersion is a page's version: the hex sha256 of its file.
func contentVersion(fileContent []byte) string {
	sum := sha256.Sum256(fileContent)
	return hex.EncodeToString(sum[:])
}
```

In `GetDocumentByPath`, set the version before returning:

```go
	document, err := serializer.DeserializeDocument(fileContent)
	if err != nil {
		return nil, fmt.Errorf("could not deserialize document at path %s: %w", path, err)
	}
	document.Version = contentVersion(fileContent)

	return document, nil
```

Add after `UpdateDocumentWithSaveType`:

```go
// UpdateDocumentChecked saves document, which was read from oldPath (it may
// move to document.MetaData.Path). With a baseVersion it first checks the page
// at oldPath is still that version, and refuses the save with
// DOCUMENT_CHANGED otherwise. The check and the save hold the write lock, so a
// sync can't change the file in between.
func (d *DocumentService) UpdateDocumentChecked(oldPath string, document *models.Document, saveType, baseVersion string) error {
	if document == nil || document.MetaData == nil {
		return errors.NewMissingRequiredFieldError("metaData")
	}
	unlock := d.gitService.LockWrites()
	defer unlock()

	if baseVersion != "" {
		current, err := d.GetDocumentByPath(oldPath)
		if err == nil && current.Version != baseVersion {
			return errors.NewDocumentChangedError(current)
		}
	}
	if err := d.MoveDocument(oldPath, document.MetaData.Path); err != nil {
		return err
	}
	return d.UpdateDocumentWithSaveType(document, saveType)
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && go test ./internal/services/ -run 'TestGetDocumentByPath_ReturnsContentVersion|TestUpdateDocumentChecked' -v`
Expected: PASS for all 5 subtests.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/models/models.go backend/internal/errors/errors.go backend/internal/services/git_service.go backend/internal/services/document_service.go backend/internal/services/document_service_version_test.go && git commit -m "feat(documents): page version and a save checked against it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The handler, the API docs and the editor dialog

**Files:**
- Modify: `backend/internal/handlers/documents_handler.go:105-140`
  (`updateDocumentByPath`)
- Test: `backend/internal/handlers/content_handlers_test.go`. Add a test next
  to the existing document tests, using its `env.do` helper.
- Modify: `frontend/src/lib/api/types.ts:17-20` and `:46-49`
- Modify: `frontend/src/lib/composables/useDocumentDraft.svelte.ts`
- Test: `frontend/src/lib/composables/useDocumentDraft.test.ts`
- Create: `frontend/src/lib/components/editor/StaleDocumentDialog.svelte`
- Test: `frontend/src/lib/components/editor/StaleDocumentDialog.test.ts`
- Modify: `frontend/src/lib/components/editor/DocumentInlineEditor.svelte`
- Modify: `docs/reference/error-codes.md` and `docs/reference/rest-api.md`

**Interfaces:**
- Consumes: `UpdateDocumentChecked`, `Document.Version`, and
  `DOCUMENT_CHANGED` with `details.document` (Task 1).
- Produces:
  - `PUT /api/documents/*path` accepts `baseVersion` and answers with the
    stored page, including its new `version`.
  - Draft API: `draft.conflict: Document | null`,
    `draft.loadCurrent(): Promise<void>`, `draft.keepMine(): Promise<boolean>`.
  - `<StaleDocumentDialog open onLoadCurrent onKeepMine />`.

- [ ] **Step 1: Write the failing handler test**

Use the file's existing helpers: `newAPIEnv(t, apiEnvOptions{})`,
`env.do(t, method, path, body, token)` and `decode(t, w)`:

```go
func TestUpdateDocument_StaleBaseVersionIs409(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	w := env.do(t, http.MethodPost, "/api/documents", map[string]any{
		"metaData": map[string]any{"title": "Plan", "path": "/plan"},
		"content":  "# Plan\n\nv1",
	}, "")
	require.Equal(t, http.StatusCreated, w.Code)

	w = env.do(t, http.MethodGet, "/api/documents/plan", nil, "")
	v1 := decode(t, w)["version"].(string)
	require.NotEmpty(t, v1)

	body := func(content, base string) map[string]any {
		return map[string]any{
			"metaData": map[string]any{"title": "Plan", "path": "/plan"},
			"content":  content, "baseVersion": base, "saveType": "manual",
		}
	}
	w = env.do(t, http.MethodPut, "/api/documents/plan", body("# Plan\n\nv2", v1), "")
	require.Equal(t, http.StatusOK, w.Code)
	v2 := decode(t, w)["version"].(string)
	assert.NotEqual(t, v1, v2, "the response carries the new version")

	w = env.do(t, http.MethodPut, "/api/documents/plan", body("# Plan\n\nstale", v1), "")
	assert.Equal(t, http.StatusConflict, w.Code)
	resp := decode(t, w)
	assert.Equal(t, "DOCUMENT_CHANGED", resp["code"])
	current := resp["details"].(map[string]any)["document"].(map[string]any)
	assert.Equal(t, "# Plan\n\nv2", current["content"])
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && go test ./internal/handlers/ -run TestUpdateDocument_StaleBaseVersionIs409 -v`
Expected: FAIL. The stale PUT returns 200, and the first PUT response has no
`version`.

- [ ] **Step 3: Implement the handler**

Replace the body of `updateDocumentByPath` in
`backend/internal/handlers/documents_handler.go`:

```go
func (h *APIHandler) updateDocumentByPath(c *gin.Context) {
	path := pathParam(c)

	type UpdateDocumentRequest struct {
		*models.Document
		SaveType string `json:"saveType,omitempty"` // "manual" or "auto", defaults to "manual"
		// BaseVersion is the version the editor started from; the save is
		// refused with DOCUMENT_CHANGED when the page changed since.
		BaseVersion string `json:"baseVersion,omitempty"`
	}

	var req UpdateDocumentRequest
	if !bindJSON(c, &req) {
		return
	}

	saveType := req.SaveType
	if saveType == "" {
		saveType = "manual"
	}

	updatedDocument := req.Document
	if updatedDocument == nil || updatedDocument.MetaData == nil {
		HandleError(c, errors.NewMissingRequiredFieldError("metaData"))
		return
	}

	if err := h.DocumentService.UpdateDocumentChecked(path, updatedDocument, saveType, req.BaseVersion); err != nil {
		HandleError(c, err)
		return
	}

	if err := h.LinkService.UpdateBacklinks(updatedDocument.MetaData.Path); err != nil {
		log.Printf("Warning: failed to update backlinks for updated document %s: %v", updatedDocument.MetaData.Path, err)
	}

	// Answer with the page as stored, so the client gets its new version.
	if saved, err := h.DocumentService.GetDocumentByPath(updatedDocument.MetaData.Path); err == nil {
		c.JSON(http.StatusOK, saved)
		return
	}
	c.JSON(http.StatusOK, updatedDocument)
}
```

Run: `cd backend && go test ./internal/handlers/ ./internal/services/ 2>&1 | tail -5`
Expected: `ok` for both packages, apart from the known Windows-only failures
listed in Global Constraints.

- [ ] **Step 4: Write the failing draft tests**

In `frontend/src/lib/api/types.ts`, add `version?: string;` to `Document`
(after `content`) and `baseVersion?: string;` to `UpdateDocumentRequest`.

Append to `frontend/src/lib/composables/useDocumentDraft.test.ts`, inside
`describe('useDocumentDraft', ...)`:

```ts
	it('sends the version it started from as baseVersion, then the saved one', async () => {
		update.mockImplementationOnce(async (_p, request) => ({
			metaData: { ...request.metaData, updated: '2024-02-01T00:00:00Z' },
			content: request.content,
			version: 'v2'
		}));
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nOne');
		await draft.save('manual');
		expect(update.mock.calls[0][1].baseVersion).toBe('v1');

		draft.setContent('# Plan\n\nTwo');
		await draft.save('manual');
		expect(update.mock.calls[1][1].baseVersion).toBe('v2');
	});

	it('on DOCUMENT_CHANGED keeps the text, stops autosave and offers both ways out', async () => {
		vi.useFakeTimers();
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({ error: 'changed', code: 'DOCUMENT_CHANGED', details: { document: current } })
			)
		);
		const draft = useDocumentDraft({
			document: { ...makeDoc(), version: 'v1' },
			autoSaveDelayMs: 100
		});

		draft.setContent('# Plan\n\nMine');
		await vi.advanceTimersByTimeAsync(100);
		expect(draft.conflict?.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.content).toBe('# Plan\n\nMine');

		draft.setContent('# Plan\n\nMine, more');
		await vi.advanceTimersByTimeAsync(1000);
		expect(update).toHaveBeenCalledTimes(1); // no autosave while the conflict is open

		await draft.keepMine();
		expect(update).toHaveBeenCalledTimes(2);
		expect(update.mock.calls[1][1].baseVersion).toBe('v9');
		expect(draft.conflict).toBeNull();
	});

	it('loadCurrent copies my text to the clipboard and loads the current page', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		const current = { ...makeDoc('# Plan\n\nFrom GitHub'), version: 'v9' };
		update.mockRejectedValueOnce(
			new Error(
				JSON.stringify({ error: 'changed', code: 'DOCUMENT_CHANGED', details: { document: current } })
			)
		);
		const draft = useDocumentDraft({ document: { ...makeDoc(), version: 'v1' } });

		draft.setContent('# Plan\n\nMine');
		await draft.save('manual');
		await draft.loadCurrent();

		expect(writeText).toHaveBeenCalledWith('# Plan\n\nMine');
		expect(draft.content).toBe('# Plan\n\nFrom GitHub');
		expect(draft.isDirty).toBe(false);
		expect(draft.conflict).toBeNull();
	});
```

- [ ] **Step 5: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/lib/composables/useDocumentDraft.test.ts`
Expected: the 3 new tests FAIL (no `baseVersion` is sent, and `draft.conflict`
is undefined).

- [ ] **Step 6: Implement the draft changes**

In `frontend/src/lib/composables/useDocumentDraft.svelte.ts`:

Add the import:

```ts
import { parseError } from '#lib/utils/error.ts';
```

Add state next to `error`:

```ts
	/** The page as it is now, when a save was refused because it changed. */
	let conflict = $state<Document | null>(null);
```

In `setContent`, schedule autosave only while there is no conflict:

```ts
	function setContent(next: string) {
		content = next;
		clearAutoSave();
		if (content !== savedContent && !conflict) {
			timer = setTimeout(() => {
				timer = null;
				void save('auto');
			}, delay);
		}
	}
```

In `doSave`, send the base version in the request (the second argument of
`documentActions.updateDocumentByPath`):

```ts
				{
					...document,
					metaData: { /* unchanged */ },
					content: snapshot.trim(),
					baseVersion: document.version
				},
```

In the `catch` of `doSave`, catch the conflict before the generic message:

```ts
		} catch (err) {
			const parsed = parseError(err);
			const current = parsed.details?.document as Document | undefined;
			if (parsed.code === 'DOCUMENT_CHANGED' && current) {
				clearAutoSave();
				conflict = current;
				return false;
			}
			error = getErrorMessage(
				err,
				kind === 'auto' ? 'Failed to auto-save page' : 'Failed to save document'
			);
			return false;
		}
```

If `parseError` maps the code through a union, add `'DOCUMENT_CHANGED'` to the
`ErrorCode` union in `frontend/src/lib/utils/error.ts`.

Add the two ways out above `discard()`:

```ts
	/** Takes the page as it is now; my text goes to the clipboard first. */
	async function loadCurrent() {
		if (!conflict) return;
		try {
			await navigator.clipboard?.writeText(content);
		} catch {
			// No clipboard (permissions): the text is still in version history
			// only if it was saved before, so this is best effort.
		}
		document = conflict;
		path = routePath(conflict.metaData.path);
		content = conflict.content;
		savedContent = conflict.content;
		conflict = null;
	}

	/** Saves my text over the newer page; the other version stays in history. */
	async function keepMine(): Promise<boolean> {
		if (!conflict) return true;
		document = { ...document, version: conflict.version };
		conflict = null;
		return save('manual');
	}
```

Return them from the composable:

```ts
		get conflict() {
			return conflict;
		},
		loadCurrent,
		keepMine,
```

Run: `cd frontend && npx vitest run src/lib/composables/useDocumentDraft.test.ts`
Expected: all tests PASS.

- [ ] **Step 7: Write the dialog test**

Create `frontend/src/lib/components/editor/StaleDocumentDialog.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import StaleDocumentDialog from './StaleDocumentDialog.svelte';

describe('StaleDocumentDialog', () => {
	it('explains the conflict and offers both choices', async () => {
		const onLoadCurrent = vi.fn();
		const onKeepMine = vi.fn();
		render(StaleDocumentDialog, { open: true, onLoadCurrent, onKeepMine });

		await expect
			.element(page.getByText('This page changed since you opened it'))
			.toBeVisible();
		await page.getByRole('button', { name: 'Load the new version' }).click();
		expect(onLoadCurrent).toHaveBeenCalledOnce();
		await page.getByRole('button', { name: 'Keep mine' }).click();
		expect(onKeepMine).toHaveBeenCalledOnce();
	});
});
```

Use the imports the neighboring tests use. Check
`frontend/src/lib/components/editor/UploadStatus.test.ts`, and copy its
`render`/`page` imports if they differ from the ones above.

- [ ] **Step 8: Implement the dialog and mount it**

Create `frontend/src/lib/components/editor/StaleDocumentDialog.svelte`:

```svelte
<script lang="ts">
	// Shown when a save was refused because the page changed since the editor
	// opened it (a GitHub sync or another user). Autosave is paused meanwhile.
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

	interface Props {
		open: boolean;
		onLoadCurrent: () => void;
		onKeepMine: () => void;
	}

	let { open, onLoadCurrent, onKeepMine }: Props = $props();
</script>

<Dialog.Root {open}>
	<Dialog.Content class="sm:max-w-md" data-testid="stale-document-dialog">
		<Dialog.Header>
			<Dialog.Title>This page changed since you opened it</Dialog.Title>
			<Dialog.Description>
				It was changed on GitHub or by someone else. Load the new version (your text is copied to
				the clipboard first), or keep yours (the other version stays in the page's history).
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={onKeepMine}>Keep mine</Button>
			<Button onclick={onLoadCurrent}>Load the new version</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
```

Check the dialog's export names in `frontend/src/lib/components/ui/dialog/index.ts`
first (`Root`, `Content`, `Header`, `Title`, `Description`, `Footer`), and
follow `UnsavedChangesModal.svelte` if they differ.

In `frontend/src/lib/components/editor/DocumentInlineEditor.svelte`, import
it and render it after `<UnsavedChangesModal ... />`:

```svelte
	import StaleDocumentDialog from './StaleDocumentDialog.svelte';
```

```svelte
<StaleDocumentDialog
	open={draft.conflict !== null}
	onLoadCurrent={() => void draft.loadCurrent()}
	onKeepMine={() => void draft.keepMine()}
/>
```

The editor's `content` prop is `draft.content`, so `loadCurrent` updates the
text shown. If `LazyProseEditor` only reads `content` on mount, call
`editor?.setContent?.(draft.content)` after `loadCurrent`. Check
`LazyProseEditor.svelte` for the method name it exposes.

Run: `cd frontend && npx vitest run src/lib/components/editor src/lib/composables`
Expected: PASS.

- [ ] **Step 9: Update the API docs**

In `docs/reference/error-codes.md`, add a row in the same format as
`SYNC_REMOTE_DIVERGED`:
`DOCUMENT_CHANGED` | 409 | A save sent a `baseVersion` and the page changed since; `details.document` is the current page.

In `docs/reference/rest-api.md`, under the update-document endpoint, document:
- Every page read returns `version`.
- `PUT` accepts an optional `baseVersion`. A mismatch gives 409
  `DOCUMENT_CHANGED`, and without it the save works as before.
- The response is the stored page, including its new `version`.

- [ ] **Step 10: Commit**

```bash
git add backend/internal/handlers frontend/src/lib docs/reference && git commit -m "feat(editor): refuse a save from a stale editor and let the user choose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: e2e for the stale editor, then PR 1

**Files:**
- Create: `e2e/tests/stale-editor.test.ts`

**Interfaces:**
- Consumes: `data-testid="stale-document-dialog"` (Task 2), and the
  `apiHelper.request` and `apiHelper.getDocument` fixtures.

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '../fixtures';

test.describe('Stale editor', () => {
	test('a save after the page changed elsewhere asks before overwriting', async ({
		apiHelper,
		documentViewPage,
		editorPage,
		page,
		testId
	}) => {
		const doc = await apiHelper.seedDocument({
			title: `Stale ${testId}`,
			path: `/stale-${testId}`,
			content: `# Stale ${testId}\n\nOriginal.`
		});
		await documentViewPage.openDocument(doc);
		await documentViewPage.editDocument();

		// Someone else saves the page meanwhile (no baseVersion: always accepted).
		const changed = await apiHelper.request('PUT', `/documents${doc.path}`, {
			metaData: { title: doc.title, path: doc.path },
			content: `# Stale ${testId}\n\nChanged elsewhere.`,
			saveType: 'manual'
		});
		expect(changed.status).toBe(200);

		await editorPage.typeContent('\n\nMy edit.');
		await page.keyboard.press('Control+s');

		const dialog = page.getByTestId('stale-document-dialog');
		await expect(dialog).toBeVisible();
		const stored = await apiHelper.getDocument(doc.path!);
		expect(stored.data?.content).toContain('Changed elsewhere.');
		expect(stored.data?.content).not.toContain('My edit.');

		await dialog.getByRole('button', { name: 'Keep mine' }).click();
		await expect(dialog).toBeHidden();
		await expect
			.poll(async () => (await apiHelper.getDocument(doc.path!)).data?.content)
			.toContain('My edit.');
	});
});
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd e2e && npx tsc --noEmit && npx eslint tests/stale-editor.test.ts && npx prettier --write tests/stale-editor.test.ts`
Expected: no errors. Docker isn't available locally, so CI runs the e2e.

- [ ] **Step 3: Commit, push, open PR 1, and merge on green**

```bash
git add e2e/tests/stale-editor.test.ts && git commit -m "test(e2e): stale editor asks before overwriting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin <branch>
gh pr create --title "feat: refuse saves from a stale editor (#303, part 1)" --body "<summary + Closes nothing; refs #303>"
```

Watch CI in a background `gh pr checks <n> --watch`. Squash-merge only when
fully green, and confirm the state is MERGED before deleting the branch.

---

# PR 2: sync engine (backend)

### Task 4: The pure planner

**Files:**
- Create: `backend/internal/syncplan/plan.go`
- Test: `backend/internal/syncplan/plan_test.go`

**Interfaces:**
- Produces (package `syncplan`):

```go
type Tree map[string]string // repo-relative slash path -> git blob hash (hex)
type Change struct {
	Path   string
	Delete bool   // remove the file
	Blob   string // remote blob to write when !Delete
}
type Result struct {
	Apply     []Change // sorted by Path
	Conflicts []string // sorted page paths changed differently on both sides
}
type Side string
const (SideLocal Side = "local"; SideRemote Side = "remote")
type Resolution struct { Side Side; RemoteBlob string }
func Plan(base, local, remote Tree, isPage func(path string) bool) Result
func Resolve(r Result, remote Tree, resolutions map[string]Resolution) (Result, []string)
```

- [ ] **Step 1: Write the failing tests**

```go
package syncplan

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func isMD(p string) bool { return len(p) > 3 && p[len(p)-3:] == ".md" }

func TestPlan(t *testing.T) {
	tests := []struct {
		name                string
		base, local, remote Tree
		apply               []Change
		conflicts           []string
	}{
		{"unchanged everywhere",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{"a.md": "1"}, nil, nil},
		{"changed remotely only: take remote",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{"a.md": "2"},
			[]Change{{Path: "a.md", Blob: "2"}}, nil},
		{"added remotely",
			Tree{}, Tree{}, Tree{"n.md": "9"},
			[]Change{{Path: "n.md", Blob: "9"}}, nil},
		{"deleted remotely, untouched locally: delete",
			Tree{"a.md": "1"}, Tree{"a.md": "1"}, Tree{},
			[]Change{{Path: "a.md", Delete: true}}, nil},
		{"changed locally only: keep",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "1"}, nil, nil},
		{"same change on both sides",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "2"}, nil, nil},
		{"page changed differently on both sides: conflict",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{"a.md": "3"}, nil, []string{"a.md"}},
		{"edited locally, deleted remotely: conflict",
			Tree{"a.md": "1"}, Tree{"a.md": "2"}, Tree{}, nil, []string{"a.md"}},
		{"deleted locally, edited remotely: conflict",
			Tree{"a.md": "1"}, Tree{}, Tree{"a.md": "3"}, nil, []string{"a.md"}},
		{"other file changed on both sides: remote wins",
			Tree{".obsidian/w.json": "1"}, Tree{".obsidian/w.json": "2"}, Tree{".obsidian/w.json": "3"},
			[]Change{{Path: ".obsidian/w.json", Blob: "3"}}, nil},
		{"no shared history: union, same path differs = conflict",
			Tree{}, Tree{"a.md": "1", "l.md": "5"}, Tree{"a.md": "2", "r.md": "6"},
			[]Change{{Path: "r.md", Blob: "6"}}, []string{"a.md"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Plan(tt.base, tt.local, tt.remote, isMD)
			assert.Equal(t, tt.apply, got.Apply)
			assert.Equal(t, tt.conflicts, got.Conflicts)
		})
	}
}

func TestResolve(t *testing.T) {
	r := Result{Conflicts: []string{"a.md", "b.md", "c.md"}}
	remote := Tree{"a.md": "ra", "b.md": "rb"} // c.md deleted remotely
	got, unresolved := Resolve(r, remote, map[string]Resolution{
		"a.md": {Side: SideRemote, RemoteBlob: "ra"},
		"b.md": {Side: SideLocal, RemoteBlob: "old"}, // remote moved on: ask again
		"c.md": {Side: SideRemote, RemoteBlob: ""},   // take the deletion
	})
	assert.Equal(t, []Change{{Path: "a.md", Blob: "ra"}, {Path: "c.md", Delete: true}}, got.Apply)
	assert.Equal(t, []string{"b.md"}, unresolved)
	assert.Equal(t, []string{"b.md"}, got.Conflicts)
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && go test ./internal/syncplan/ -v`
Expected: a compile error (the package is empty).

- [ ] **Step 3: Implement**

```go
// Package syncplan decides what a two-way sync does with each file, from the
// last shared commit (base) and the two sides. It is pure: no git, no disk.
package syncplan

import "sort"

// Tree maps a repository path (slash separated) to its git blob hash.
type Tree map[string]string

// Change is one file to bring in from the remote side.
type Change struct {
	Path   string
	Delete bool
	Blob   string
}

// Result is what to apply locally, or the pages that need a decision first.
type Result struct {
	Apply     []Change
	Conflicts []string
}

// Side is whose version a resolved conflict keeps.
type Side string

const (
	SideLocal  Side = "local"
	SideRemote Side = "remote"
)

// Resolution is a decision for one conflicting page, made while the remote
// version was RemoteBlob ("" for deleted). It only counts while it still is.
type Resolution struct {
	Side       Side
	RemoteBlob string
}

// Plan classifies every path in the three trees. A page changed differently on
// both sides (edits, or an edit against a deletion) is a conflict; any other
// file changed on both sides takes the remote version.
func Plan(base, local, remote Tree, isPage func(path string) bool) Result {
	paths := map[string]bool{}
	for _, t := range []Tree{base, local, remote} {
		for p := range t {
			paths[p] = true
		}
	}
	var res Result
	for p := range paths {
		b, l, r := base[p], local[p], remote[p]
		switch {
		case l == r, r == b:
			// nothing to bring in
		case l == b:
			res.Apply = append(res.Apply, change(p, r))
		case isPage(p):
			res.Conflicts = append(res.Conflicts, p)
		default:
			res.Apply = append(res.Apply, change(p, r))
		}
	}
	sortResult(&res)
	return res
}

// Resolve applies decisions to a plan's conflicts. A decision made against an
// older remote version is dropped; those pages come back as unresolved.
func Resolve(r Result, remote Tree, resolutions map[string]Resolution) (Result, []string) {
	out := Result{Apply: append([]Change(nil), r.Apply...)}
	for _, p := range r.Conflicts {
		res, ok := resolutions[p]
		if !ok || res.RemoteBlob != remote[p] {
			out.Conflicts = append(out.Conflicts, p)
			continue
		}
		if res.Side == SideRemote {
			out.Apply = append(out.Apply, change(p, remote[p]))
		}
	}
	sortResult(&out)
	return out, out.Conflicts
}

func change(path, blob string) Change {
	if blob == "" {
		return Change{Path: path, Delete: true}
	}
	return Change{Path: path, Blob: blob}
}

func sortResult(r *Result) {
	sort.Slice(r.Apply, func(i, j int) bool { return r.Apply[i].Path < r.Apply[j].Path })
	sort.Strings(r.Conflicts)
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && go test ./internal/syncplan/ -v`
Expected: PASS (11 Plan cases and the Resolve case).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/syncplan && git commit -m "feat(sync): pure planner for two-way sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Settings, the error code and the ignore rule

**Files:**
- Modify: `backend/internal/config/settings.go:34-57` (`GitHubSettings`)
- Modify: `backend/internal/errors/errors.go`
- Modify: `backend/internal/services/ignore_service.go:22-29`
- Modify: `backend/internal/services/github_service.go:37-60` (the API
  `GitHubSettings` struct and `GetGitHubSettings` at line 424)
- Test: `backend/internal/services/github_service_internal_test.go` (a short
  settings test)

**Interfaces:**
- Produces:
  - `appconfig.GitHubSettings.Mode string` (`json:"mode,omitempty"`), plus
    `SyncConflicts []string` (`json:"sync_conflicts,omitempty"`),
    `PausedRemoteHead string` (`json:"paused_remote_head,omitempty"`) and
    `Unreadable []string` (`json:"unreadable,omitempty"`).
  - `const GitHubModeBackup = "backup"`, `const GitHubModeTwoWay = "two-way"`,
    and `func (s *GitHubSettings) TwoWay() bool` in `appconfig`.
  - `errors.ErrCodeSyncConflict = "SYNC_CONFLICT"` and
    `errors.NewSyncConflictError(conflicts []string, remoteHead string) *APIError`.
  - The services `GitHubSettings` (the API view) gains `Mode`,
    `SyncConflicts`, `PausedRemoteHead` and `Unreadable` with the same JSON
    names.
  - `IgnoreService.ShouldIgnore("/.obsidian/x")` is true.

- [ ] **Step 1: Write the failing test**

Append to `backend/internal/services/github_service_internal_test.go`:

```go
func TestGitHubSettings_ModeAndPauseRoundTrip(t *testing.T) {
	gh := enabledSettings()
	gh.Mode = appconfig.GitHubModeTwoWay
	gh.SyncConflicts = []string{"plan.md"}
	gh.PausedRemoteHead = "abc"
	f := newGitHubFixture(t, gh)

	view := f.gs.GetGitHubSettings()
	assert.Equal(t, "two-way", view.Mode)
	assert.Equal(t, []string{"plan.md"}, view.SyncConflicts)
	assert.Equal(t, "abc", view.PausedRemoteHead)
	assert.True(t, f.settings.GetGitHubSettings().TwoWay())
	assert.True(t, NewIgnoreService("").ShouldIgnore("/.obsidian/workspace.json"))
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && go test ./internal/services/ -run TestGitHubSettings_ModeAndPauseRoundTrip -v`
Expected: a compile error (`Mode` undefined).

- [ ] **Step 3: Implement**

In `backend/internal/config/settings.go`, add to `GitHubSettings` after
`LastSyncErrorCode`:

```go
	// Mode is "backup" (push only, the default when empty) or "two-way"
	// (every sync also pulls changes made outside Schist).
	Mode string `json:"mode,omitempty"`
	// SyncConflicts lists pages changed differently in the wiki and on GitHub;
	// while it is set, two-way sync is paused. PausedRemoteHead is the GitHub
	// commit they were found against.
	SyncConflicts    []string `json:"sync_conflicts,omitempty"`
	PausedRemoteHead string   `json:"paused_remote_head,omitempty"`
	// Unreadable lists .md files pulled from GitHub that Schist can't show as
	// pages (no front matter, or a file name that isn't a valid page path).
	Unreadable []string `json:"unreadable,omitempty"`
```

Below the struct:

```go
const (
	GitHubModeBackup = "backup"
	GitHubModeTwoWay = "two-way"
)

// TwoWay reports whether syncs pull as well as push.
func (s *GitHubSettings) TwoWay() bool { return s != nil && s.Mode == GitHubModeTwoWay }
```

In `backend/internal/errors/errors.go`, add the code after
`ErrCodeDocumentChanged`:

```go
	// ErrCodeSyncConflict: two-way sync found pages changed differently in the
	// wiki and on GitHub; it is paused until a side is picked for each.
	ErrCodeSyncConflict ErrorCode = "SYNC_CONFLICT"
```

and the constructor:

```go
// NewSyncConflictError pauses a two-way sync on pages changed on both sides.
func NewSyncConflictError(conflicts []string, remoteHead string) *APIError {
	message := fmt.Sprintf("Sync paused: %d page(s) changed both in Schist and on GitHub. "+
		"Pick a side for each in Settings → GitHub.", len(conflicts))
	return NewAPIError(ErrCodeSyncConflict, message, http.StatusConflict).
		WithDetails("conflicts", conflicts).
		WithDetails("remote_head", remoteHead)
}
```

In `backend/internal/services/ignore_service.go`, add `".obsidian/",` to
`patterns`.

In `backend/internal/services/github_service.go`, add to the services
`GitHubSettings` struct the same four fields, with the same JSON tags, and copy
them in `GetGitHubSettings()`:

```go
		Mode:             githubSettings.Mode,
		SyncConflicts:    githubSettings.SyncConflicts,
		PausedRemoteHead: githubSettings.PausedRemoteHead,
		Unreadable:       githubSettings.Unreadable,
```

An empty `Mode` is reported as is; the UI treats it as backup.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && go test ./internal/services/ ./internal/config/ 2>&1 | tail -3`
Expected: `ok` (ignore the known Windows failures).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/config backend/internal/errors backend/internal/services && git commit -m "feat(sync): two-way mode setting, pause state and SYNC_CONFLICT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Pull: fetch, trees, plan, apply

**Files:**
- Create: `backend/internal/services/github_pull.go`
- Test: `backend/internal/services/github_pull_test.go`

**Interfaces:**
- Consumes: `syncplan.Plan` and `Resolve` (Task 4), the settings fields
  (Task 5), `GitService.LockWrites`, `commitMu` and `CommitPendingChanges`,
  plus `remoteBranchHead`, `isAncestorCommit`, `gitTransportError`,
  `githubPushTimeout` and `syncAuthor`, all in `github_service.go` and
  `git_service.go`.
- Produces:

```go
type pullOutcome struct {
	RemoteHead plumbing.Hash
	Applied    []string // paths written or deleted
	Conflicts  []string
	Unreadable []string
}
var errHeadMoved = stderrors.New("local history moved during the sync")
func (gs *GitHubService) pullOnce(resolutions map[string]syncplan.Resolution, dryRun bool) (*pullOutcome, *syncplan.Result, error)
func isPagePath(p string) bool
```

**Test helpers** (add to `github_pull_test.go`; they mimic Obsidian committing
to the bare remote through a second clone):

```go
// obsidianClone clones the bare remote into a temp dir (via the installed
// https transport) and returns a func that writes files and pushes them.
func obsidianClone(t *testing.T) (dir string, commitAndPush func(files map[string]string, deletes ...string)) {
	t.Helper()
	dir = t.TempDir()
	repo, err := git.PlainClone(dir, false, &git.CloneOptions{
		URL: "https://github.com/" + testOwner + "/" + testRepo + ".git", ReferenceName: "refs/heads/main",
	})
	require.NoError(t, err)
	wt, err := repo.Worktree()
	require.NoError(t, err)
	return dir, func(files map[string]string, deletes ...string) {
		require.NoError(t, wt.Pull(&git.PullOptions{RemoteName: "origin"}))  // may be NoErrAlreadyUpToDate; ignore that
		for name, content := range files {
			require.NoError(t, os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o755))
			require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644))
			_, err := wt.Add(name)
			require.NoError(t, err)
		}
		for _, name := range deletes {
			_, err := wt.Remove(name)
			require.NoError(t, err)
		}
		_, err := wt.Commit("obsidian", &git.CommitOptions{Author: &object.Signature{Name: "o", Email: "o@x", When: time.Now()}})
		require.NoError(t, err)
		require.NoError(t, repo.Push(&git.PushOptions{}))
	}
}
```

(When writing the helper, swallow `git.NoErrAlreadyUpToDate` from `Pull`
instead of requiring no error.)

```go
// twoWayFixture: a wiki with one synced page, the remote at the same commit,
// and two-way mode on.
func twoWayFixture(t *testing.T) (*githubFixture, string) {
	t.Helper()
	gh := enabledSettings()
	gh.Mode = appconfig.GitHubModeTwoWay
	f := newGitHubFixture(t, gh)
	unlockForTest(t, f.secrets)
	remoteDir := installLocalRemote(t, testOwner, testRepo)
	writeNote(t, f.dataDir, "plan.md", page("Plan", "v1"))
	writeNote(t, f.dataDir, "notes.md", page("Notes", "n1"))
	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	return f, remoteDir
}

func page(title, body string) string {
	return "---\ntitle: " + title + "\npath: /" + strings.ToLower(title) + "\n---\n# " + title + "\n\n" + body + "\n"
}
```

- [ ] **Step 1: Write the failing tests**

```go
func TestPull_FastForwardBringsObsidianEdits(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "from obsidian"), "new.md": page("New", "x")})

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"plan.md", "new.md"}, out.Applied)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "from obsidian")
	head, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, out.RemoteHead, head.Hash(), "fast-forward: HEAD is the remote commit")
}

func TestPull_DifferentPagesMergeWithBothParents(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "from obsidian")})
	writeNote(t, f.dataDir, "notes.md", page("Notes", "from schist"))
	_, err := f.gs.gitService.CommitPendingChanges("local edit")
	require.NoError(t, err)

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"plan.md"}, out.Applied)
	head, _ := f.gs.gitService.repository.Head()
	commit, _ := f.gs.gitService.repository.CommitObject(head.Hash())
	assert.Len(t, commit.ParentHashes, 2, "a merge commit")
	notes, _ := os.ReadFile(filepath.Join(f.dataDir, "notes.md"))
	assert.Contains(t, string(notes), "from schist", "local edit kept")
}

func TestPull_SamePageBothSidesIsAConflictAndAppliesNothing(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "other.md": page("Other", "o")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, err := f.gs.gitService.CommitPendingChanges("local edit")
	require.NoError(t, err)
	before, _ := f.gs.gitService.repository.Head()

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"plan.md"}, out.Conflicts)
	assert.Empty(t, out.Applied, "no partial merge")
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash())
	_, statErr := os.Stat(filepath.Join(f.dataDir, "other.md"))
	assert.True(t, os.IsNotExist(statErr))
}

func TestPull_ResolutionsApply(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, _ = f.gs.gitService.CommitPendingChanges("local edit")
	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	require.Equal(t, []string{"plan.md"}, out.Conflicts)

	blob := remoteBlob(t, f, out.RemoteHead, "plan.md")
	out, _, err = f.gs.pullOnce(map[string]syncplan.Resolution{
		"plan.md": {Side: syncplan.SideRemote, RemoteBlob: blob},
	}, false)
	require.NoError(t, err)
	assert.Empty(t, out.Conflicts)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "obsidian")
}

func TestPull_FileChangedOnDiskSinceThePlanAborts(t *testing.T) {
	// The on-disk check: a write that bypassed the lock (MCP) is never overwritten.
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	f.gs.beforeApply = func() { writeNote(t, f.dataDir, "plan.md", page("Plan", "mcp edit")) }

	_, _, err := f.gs.pullOnce(nil, false)
	assert.ErrorIs(t, err, errHeadMoved)
	got, _ := os.ReadFile(filepath.Join(f.dataDir, "plan.md"))
	assert.Contains(t, string(got), "mcp edit")
}

func TestPull_UnreadableNotesAreListed(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"My Note.md": "just text, no front matter\n"})

	out, _, err := f.gs.pullOnce(nil, false)
	require.NoError(t, err)
	assert.Equal(t, []string{"My Note.md"}, out.Unreadable)
	_, statErr := os.Stat(filepath.Join(f.dataDir, "My Note.md"))
	assert.NoError(t, statErr, "carried along on disk")
}

func remoteBlob(t *testing.T, f *githubFixture, head plumbing.Hash, path string) string {
	t.Helper()
	tree, err := commitTree(f.gs.gitService.repository, head)
	require.NoError(t, err)
	return tree[path]
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && go test ./internal/services/ -run TestPull_ -v`
Expected: a compile error (`pullOnce` and `beforeApply` undefined).

- [ ] **Step 3: Implement `github_pull.go`**

```go
package services

import (
	"context"
	stderrors "errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"

	"github.com/MorrisMorrison/schist/internal/serializer"
	"github.com/MorrisMorrison/schist/internal/syncplan"
	"github.com/MorrisMorrison/schist/internal/utils"
)

// errHeadMoved means the wiki changed while a sync was applying; plan again.
var errHeadMoved = stderrors.New("local history moved during the sync")

// pullOutcome is what one pull did, or would do (dry run).
type pullOutcome struct {
	RemoteHead plumbing.Hash
	Applied    []string
	Conflicts  []string
	Unreadable []string
}

// pathIgnore applies the fixed ignore patterns (they don't depend on the data dir).
var pathIgnore = NewIgnoreService("")

// isPagePath reports whether a repository path is a wiki page: a .md file
// outside the folders Schist doesn't show (trash, assets, .obsidian...).
func isPagePath(p string) bool {
	return strings.HasSuffix(p, ".md") && !pathIgnore.ShouldIgnore("/"+p)
}

// remoteTrackingRef is where the fetched remote branch is kept.
func remoteTrackingRef(branch string) plumbing.ReferenceName {
	return plumbing.NewRemoteReferenceName("origin", branch)
}

// fetchRemote fetches the branch and returns its head, or the zero hash when
// the branch (or the repository) is empty.
func (gs *GitHubService) fetchRemote(repo *git.Repository) (plumbing.Hash, error) {
	s := gs.settings.GetGitHubSettings()
	token, err := gs.getToken()
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("failed to get GitHub token: %w", err)
	}
	auth := &githttp.BasicAuth{Username: s.Owner, Password: token}
	ctx, cancel := context.WithTimeout(gs.ctx, githubPushTimeout)
	defer cancel()

	remote, err := repo.Remote("origin")
	if err != nil {
		return plumbing.ZeroHash, err
	}
	head, err := remoteBranchHead(ctx, remote, auth, s.Branch)
	if err != nil || head.IsZero() {
		if err != nil {
			return plumbing.ZeroHash, gitTransportError(err, s)
		}
		return plumbing.ZeroHash, nil
	}
	spec := config.RefSpec(fmt.Sprintf("+refs/heads/%s:%s", s.Branch, remoteTrackingRef(s.Branch)))
	err = repo.FetchContext(ctx, &git.FetchOptions{RemoteName: "origin", RefSpecs: []config.RefSpec{spec}, Auth: auth})
	if err != nil && !stderrors.Is(err, git.NoErrAlreadyUpToDate) {
		return plumbing.ZeroHash, gitTransportError(err, s)
	}
	return head, nil
}

// commitTree lists a commit's files (path -> blob hash); the zero hash is the
// empty tree.
func commitTree(repo *git.Repository, h plumbing.Hash) (syncplan.Tree, error) {
	out := syncplan.Tree{}
	if h.IsZero() {
		return out, nil
	}
	commit, err := repo.CommitObject(h)
	if err != nil {
		return nil, err
	}
	tree, err := commit.Tree()
	if err != nil {
		return nil, err
	}
	err = tree.Files().ForEach(func(f *object.File) error {
		if !isAppStatePath(f.Name) {
			out[f.Name] = f.Hash.String()
		}
		return nil
	})
	return out, err
}

// mergeBase is the newest commit both histories share (zero when none).
func mergeBase(repo *git.Repository, a, b plumbing.Hash) (plumbing.Hash, error) {
	ca, err := repo.CommitObject(a)
	if err != nil {
		return plumbing.ZeroHash, err
	}
	cb, err := repo.CommitObject(b)
	if err != nil {
		return plumbing.ZeroHash, err
	}
	bases, err := ca.MergeBase(cb)
	if err != nil || len(bases) == 0 {
		return plumbing.ZeroHash, err
	}
	return bases[0].Hash, nil
}

// pullOnce brings the remote branch into the wiki: a fast-forward, a merge of
// changes on different pages, or (with conflicts) nothing. dryRun plans
// without touching the working tree. It returns errHeadMoved when the wiki
// changed meanwhile; the caller plans again.
func (gs *GitHubService) pullOnce(resolutions map[string]syncplan.Resolution, dryRun bool) (*pullOutcome, *syncplan.Result, error) {
	repo, err := gs.localRepository()
	if err != nil {
		return nil, nil, err
	}
	remoteHead, err := gs.fetchRemote(repo)
	if err != nil {
		return nil, nil, err
	}
	out := &pullOutcome{RemoteHead: remoteHead}
	head, err := repo.Head()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get HEAD: %w", err)
	}
	local := head.Hash()
	if remoteHead.IsZero() || remoteHead == local {
		return out, &syncplan.Result{}, nil
	}
	if behind, err := isAncestorCommit(repo, remoteHead, local); err != nil || behind {
		return out, &syncplan.Result{}, err // the remote is already in local history
	}

	fastForward, err := isAncestorCommit(repo, local, remoteHead)
	if err != nil {
		return nil, nil, err
	}
	base := local
	if !fastForward {
		if base, err = mergeBase(repo, local, remoteHead); err != nil {
			return nil, nil, err
		}
	}
	trees := make([]syncplan.Tree, 3)
	for i, h := range []plumbing.Hash{base, local, remoteHead} {
		if trees[i], err = commitTree(repo, h); err != nil {
			return nil, nil, err
		}
	}
	plan := syncplan.Plan(trees[0], trees[1], trees[2], isPagePath)
	if len(resolutions) > 0 {
		plan, _ = syncplan.Resolve(plan, trees[2], resolutions)
	}
	out.Conflicts = plan.Conflicts
	out.Unreadable = unreadablePages(repo, plan.Apply)
	if dryRun || len(plan.Conflicts) > 0 {
		return out, &plan, nil
	}
	if err := gs.applyPlan(repo, plan, local, remoteHead, fastForward, trees[1]); err != nil {
		return nil, nil, err
	}
	for _, c := range plan.Apply {
		out.Applied = append(out.Applied, c.Path)
	}
	gs.notifyPulled(out.Applied)
	return out, &plan, nil
}

// applyPlan writes the plan into the working tree and records it: the branch
// moves to the remote head (fast-forward) or gets a merge commit with both
// heads as parents. It runs under the wiki's write lock and refuses (with
// errHeadMoved) when the wiki changed since the plan was made.
func (gs *GitHubService) applyPlan(repo *git.Repository, plan syncplan.Result, local, remote plumbing.Hash,
	fastForward bool, localTree syncplan.Tree) error {
	unlock := gs.gitService.LockWrites()
	defer unlock()

	if committed, err := gs.gitService.CommitPendingChanges("Sync: commit changes before pulling from GitHub"); err != nil {
		return err
	} else if committed {
		return errHeadMoved
	}
	if gs.beforeApply != nil {
		gs.beforeApply()
	}
	if head, err := repo.Head(); err != nil || head.Hash() != local {
		return errHeadMoved
	}
	dataDir := gs.gitService.dataDir
	for _, c := range plan.Apply {
		if changedOnDisk(filepath.Join(dataDir, filepath.FromSlash(c.Path)), localTree[c.Path]) {
			return errHeadMoved
		}
	}

	gs.gitService.commitMu.Lock()
	defer gs.gitService.commitMu.Unlock()
	wt, err := repo.Worktree()
	if err != nil {
		return err
	}
	for _, c := range plan.Apply {
		full := filepath.Join(dataDir, filepath.FromSlash(c.Path))
		if c.Delete {
			// Remove deletes the file and stages the deletion.
			if _, err := wt.Remove(c.Path); err != nil {
				return fmt.Errorf("failed to stage deletion of %s: %w", c.Path, err)
			}
			continue
		}
		data, err := blobBytes(repo, c.Blob)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(full, data, 0o644); err != nil {
			return err
		}
		if _, err := wt.Add(c.Path); err != nil {
			return err
		}
	}
	if fastForward {
		return wt.Reset(&git.ResetOptions{Commit: remote, Mode: git.MixedReset})
	}
	author := syncAuthor
	author.When = time.Now()
	_, err = wt.Commit("Sync: merge changes from GitHub", &git.CommitOptions{
		Author: &author, Parents: []plumbing.Hash{local, remote},
	})
	return err
}

// changedOnDisk reports whether the file no longer matches the blob the plan
// assumed (want "" = absent).
func changedOnDisk(full, want string) bool {
	data, err := os.ReadFile(full)
	if os.IsNotExist(err) {
		return want != ""
	}
	if err != nil {
		return true
	}
	return plumbing.ComputeHash(plumbing.BlobObject, data).String() != want
}

func blobBytes(repo *git.Repository, hash string) ([]byte, error) {
	blob, err := repo.BlobObject(plumbing.NewHash(hash))
	if err != nil {
		return nil, err
	}
	r, err := blob.Reader()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// unreadablePages lists incoming .md files Schist can't show as pages.
func unreadablePages(repo *git.Repository, apply []syncplan.Change) []string {
	var out []string
	for _, c := range apply {
		if c.Delete || !isPagePath(c.Path) {
			continue
		}
		logical := "/" + strings.TrimSuffix(c.Path, ".md")
		data, err := blobBytes(repo, c.Blob)
		if err != nil || utils.ValidatePath(logical) != nil {
			out = append(out, c.Path)
			continue
		}
		if _, err := serializer.DeserializeDocument(data); err != nil {
			out = append(out, c.Path)
		}
	}
	sort.Strings(out)
	return out
}

// notifyPulled tells the link index which pages a pull changed.
func (gs *GitHubService) notifyPulled(paths []string) {
	if gs.onPulled == nil {
		return
	}
	var pages []string
	for _, p := range paths {
		if isPagePath(p) {
			pages = append(pages, "/"+strings.TrimSuffix(p, ".md"))
		}
	}
	gs.onPulled(pages)
}
```

Add two fields to `GitHubService` in `github_service.go`:

```go
	// onPulled, if set, gets the page paths a pull changed (wired to the link
	// index). beforeApply is a test hook that runs just before applying.
	onPulled    func(pages []string)
	beforeApply func()
```

and a setter:

```go
// SetPullHook registers fn to run with the pages a pull changed.
func (gs *GitHubService) SetPullHook(fn func(pages []string)) { gs.onPulled = fn }
```

- [ ] **Step 4: Run the tests and fix until green**

Run: `cd backend && go test ./internal/services/ -run TestPull_ -v`
Expected: all 6 PASS. In `TestPull_FileChangedOnDiskSinceThePlanAborts`, the
`beforeApply` hook writes after `CommitPendingChanges`, so the on-disk check
catches it. If `wt.Remove` of an already-deleted file errors differently, adapt
the ignore check. Don't loosen the assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/services/github_pull.go backend/internal/services/github_pull_test.go backend/internal/services/github_service.go && git commit -m "feat(sync): pull from GitHub (fast-forward, merge of different pages, pause on conflicts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Sync in two-way mode: retry, pause, resolutions

**Files:**
- Modify: `backend/internal/services/github_service.go` (`GitHubSyncOptions`
  at line 103; `sync()` at line 587; `recordSyncOutcome` at line 622)
- Test: `backend/internal/services/github_pull_test.go`

**Interfaces:**
- Consumes: `pullOnce` and `errHeadMoved` (Task 6), `NewSyncConflictError`
  (Task 5), and `pushToGitHub(replaceRemote bool) error`.
- Produces:
  - `GitHubSyncOptions.Resolutions map[string]string` (JSON `resolutions`:
    path → `"local"`/`"remote"`) and `GitHubSyncOptions.RemoteHead string`
    (JSON `remote_head`).
  - In two-way mode, `Sync` returns `SYNC_CONFLICT` and records the pause.
  - A successful two-way sync clears the pause and stores `Unreadable`.

- [ ] **Step 1: Write the failing tests**

```go
func TestSync_TwoWayPausesThenResumesWithResolutions(t *testing.T) {
	f, remoteDir := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))

	_, err := f.gs.SyncToGitHub()
	assert.Equal(t, apierrors.ErrCodeSyncConflict, errorCode(err))
	s := f.settings.GetGitHubSettings()
	assert.Equal(t, []string{"plan.md"}, s.SyncConflicts)
	require.NotEmpty(t, s.PausedRemoteHead)

	_, err = f.gs.Sync(GitHubSyncOptions{
		Resolutions: map[string]string{"plan.md": "local"}, RemoteHead: s.PausedRemoteHead,
	})
	require.NoError(t, err)
	s = f.settings.GetGitHubSettings()
	assert.Empty(t, s.SyncConflicts)
	assert.Empty(t, s.PausedRemoteHead)
	head, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, head.Hash(), remoteBranchHash(t, remoteDir, "main"), "pushed")
}

func TestSync_BackupModeUnchanged(t *testing.T) {
	f, _ := twoWayFixture(t)
	require.NoError(t, f.settings.Update(f.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.Mode = ""
		return nil
	}))
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "notes.md", page("Notes", "local"))

	_, err := f.gs.SyncToGitHub()
	assert.Equal(t, apierrors.ErrCodeSyncRemoteDiverged, errorCode(err))
}

func TestSync_TwoWayRetriesWhenTheRemoteMovesDuringPush(t *testing.T) {
	f, remoteDir := twoWayFixture(t)
	_, push := obsidianClone(t)
	moved := false
	f.gs.beforePush = func() {
		if !moved {
			moved = true
			push(map[string]string{"race.md": page("Race", "pushed meanwhile")})
		}
	}
	writeNote(t, f.dataDir, "notes.md", page("Notes", "local"))

	_, err := f.gs.SyncToGitHub()
	require.NoError(t, err)
	assert.Contains(t, remoteFiles(t, remoteDir, "main"), "race.md")
	_, statErr := os.Stat(filepath.Join(f.dataDir, "race.md"))
	assert.NoError(t, statErr)
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && go test ./internal/services/ -run 'TestSync_' -v`
Expected: a compile error (`Resolutions` and `beforePush` undefined).

- [ ] **Step 3: Implement**

Extend `GitHubSyncOptions`:

```go
	// Resolutions picks a side ("local" or "remote") for pages a paused
	// two-way sync found changed on both sides; RemoteHead is the GitHub
	// commit they were decided against.
	Resolutions map[string]string `json:"resolutions,omitempty"`
	RemoteHead  string            `json:"remote_head,omitempty"`
```

Add the test hook field to `GitHubService`: `beforePush func()`. Call it at the
top of `pushToGitHub`, after the nil check:
`if gs.beforePush != nil { gs.beforePush() }`.

In `sync()`, replace the final push block:

```go
	if githubSettings.TwoWay() && !opts.ReplaceRemote {
		return gs.syncTwoWay(opts)
	}
	if err := gs.pushToGitHub(opts.ReplaceRemote || githubSettings.ForcePush); err != nil {
		return nil, err
	}
```

Add:

```go
// maxTwoWayAttempts bounds how often a sync re-pulls when GitHub moves
// while it pushes (Obsidian pushing at the same moment).
const maxTwoWayAttempts = 3

// syncTwoWay pulls, then pushes. It pauses on pages changed on both sides
// unless opts resolves them, and starts over when the wiki or GitHub moved.
func (gs *GitHubService) syncTwoWay(opts GitHubSyncOptions) (*GitHubSyncResult, error) {
	resolutions, err := gs.resolutionsFor(opts)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < maxTwoWayAttempts; attempt++ {
		out, _, err := gs.pullOnce(resolutions, false)
		if stderrors.Is(err, errHeadMoved) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if len(out.Conflicts) > 0 {
			gs.recordPause(out.Conflicts, out.RemoteHead.String(), out.Unreadable)
			return nil, apierrors.NewSyncConflictError(out.Conflicts, out.RemoteHead.String())
		}
		err = gs.pushToGitHub(false)
		if errorCodeOf(err) == apierrors.ErrCodeSyncRemoteDiverged {
			continue // GitHub moved since the fetch: pull again
		}
		if err != nil {
			return nil, err
		}
		gs.recordPause(nil, "", out.Unreadable)
		return &GitHubSyncResult{Success: true, Message: "GitHub sync completed successfully",
			Timestamp: time.Now().Format(time.RFC3339)}, nil
	}
	return nil, apierrors.NewUnavailableError("GitHub (the branch kept changing during the sync; it retries on the next sync)")
}

// resolutionsFor turns the request's choices into planner resolutions, each
// tied to the page's blob at the GitHub commit the user decided against.
func (gs *GitHubService) resolutionsFor(opts GitHubSyncOptions) (map[string]syncplan.Resolution, error) {
	if len(opts.Resolutions) == 0 {
		return nil, nil
	}
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	decidedTree, err := commitTree(repo, plumbing.NewHash(opts.RemoteHead))
	if err != nil {
		return nil, apierrors.NewValidationError("remote_head is not a commit this wiki has fetched").WithCause(err)
	}
	out := map[string]syncplan.Resolution{}
	for path, side := range opts.Resolutions {
		if side != string(syncplan.SideLocal) && side != string(syncplan.SideRemote) {
			return nil, apierrors.NewValidationError(fmt.Sprintf("resolution for %s must be local or remote", path))
		}
		out[path] = syncplan.Resolution{Side: syncplan.Side(side), RemoteBlob: decidedTree[path]}
	}
	return out, nil
}

// recordPause stores (or, with no conflicts, clears) the paused state.
func (gs *GitHubService) recordPause(conflicts []string, remoteHead string, unreadable []string) {
	if err := gs.settings.Update(gs.dataDir, func(st *appconfig.Settings) error {
		st.GitHub.SyncConflicts = conflicts
		st.GitHub.PausedRemoteHead = remoteHead
		st.GitHub.Unreadable = unreadable
		return nil
	}); err != nil {
		log.Printf("[GitHubService] Warning: failed to record the sync pause: %v", err)
	}
}

func errorCodeOf(err error) apierrors.ErrorCode {
	var apiErr *apierrors.APIError
	if stderrors.As(err, &apiErr) {
		return apiErr.Code
	}
	return ""
}
```

Add `"github.com/MorrisMorrison/schist/internal/syncplan"` and
`"github.com/go-git/go-git/v5/plumbing"` to the imports if they're missing.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && go test ./internal/services/ -run 'TestSync_|TestPull_|TestGitHubService_|TestDecidePush' -v 2>&1 | tail -20`
Expected: all PASS, including the existing sync tests (backup mode is
unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/services && git commit -m "feat(sync): two-way sync with pause, resolutions and push retries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Preview, conflict versions, the mode in config, the interval and wiring

**Files:**
- Modify: `backend/internal/services/github_service.go` (`GitHubConfigRequest`
  at line 95, `UpdateConfiguration`, `autoSyncInterval` at line 463,
  `NewGitHubService` around line 162)
- Modify: `backend/internal/services/github_service_scheduler.go` (`interval`
  becomes `func() time.Duration`; the loop uses a timer)
- Modify: `backend/internal/services/container.go:66-71`
- Test: `backend/internal/services/github_pull_test.go` and
  `github_service_scheduler_test.go` (update the existing construction:
  `interval: func() time.Duration { return d }`)

**Interfaces:**
- Produces:

```go
type SyncPreview struct {
	Incoming   []string `json:"incoming"`   // pages/files that change in the wiki
	Outgoing   []string `json:"outgoing"`   // local changes that go to GitHub
	Conflicts  []string `json:"conflicts"`
	Unreadable []string `json:"unreadable"`
	RemoteHead string   `json:"remote_head"`
}
func (gs *GitHubService) PreviewSync() (*SyncPreview, error)
type ConflictVersions struct {
	Path   string      `json:"path"`
	Local  string      `json:"local"`
	Remote string      `json:"remote"`
	Diff   *DiffResult `json:"diff"`
}
func (gs *GitHubService) ConflictVersions(path string) (*ConflictVersions, error)
```

  - `GitHubConfigRequest.Mode *string` (JSON `mode`). Setting `"two-way"` also
    turns `AutoSync` on. Any other value except `"backup"` is a validation
    error.
  - `autoSyncInterval()`: the `SCHIST_GITHUB_AUTO_SYNC_MINUTES` value when
    it's set; otherwise 5 minutes in two-way mode and 15 in backup.

- [ ] **Step 1: Write the failing tests**

```go
func TestPreviewSync_ShowsWhatTheFirstSyncWouldDo(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian"), "new.md": page("New", "x")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	writeNote(t, f.dataDir, "mine.md", page("Mine", "m"))
	_, _ = f.gs.gitService.CommitPendingChanges("local")
	before, _ := f.gs.gitService.repository.Head()

	p, err := f.gs.PreviewSync()
	require.NoError(t, err)
	assert.Equal(t, []string{"new.md"}, p.Incoming)
	assert.Equal(t, []string{"mine.md"}, p.Outgoing)
	assert.Equal(t, []string{"plan.md"}, p.Conflicts)
	after, _ := f.gs.gitService.repository.Head()
	assert.Equal(t, before.Hash(), after.Hash(), "a preview changes nothing")
}

func TestConflictVersions_ReturnsBothSidesAndADiff(t *testing.T) {
	f, _ := twoWayFixture(t)
	_, push := obsidianClone(t)
	push(map[string]string{"plan.md": page("Plan", "obsidian")})
	writeNote(t, f.dataDir, "plan.md", page("Plan", "schist"))
	_, err := f.gs.SyncToGitHub()
	require.Error(t, err)

	v, err := f.gs.ConflictVersions("plan.md")
	require.NoError(t, err)
	assert.Contains(t, v.Local, "schist")
	assert.Contains(t, v.Remote, "obsidian")
	assert.NotNil(t, v.Diff)
}

func TestUpdateConfiguration_TwoWayTurnsOnAutoSync(t *testing.T) {
	f := newGitHubFixture(t, enabledSettings())
	mode := "two-way"
	require.NoError(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Mode: &mode}))
	s := f.settings.GetGitHubSettings()
	assert.True(t, s.TwoWay())
	assert.True(t, s.AutoSync)
	assert.Equal(t, 5*time.Minute, f.gs.autoSyncInterval())

	bad := "sideways"
	assert.Error(t, f.gs.UpdateConfiguration(&GitHubConfigRequest{Mode: &bad}))
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && go test ./internal/services/ -run 'TestPreviewSync_|TestConflictVersions_|TestUpdateConfiguration_TwoWay' -v`
Expected: a compile error.

- [ ] **Step 3: Implement**

`PreviewSync` and `ConflictVersions` go in `github_pull.go`:

```go
// PreviewSync reports what a two-way sync would do now, without doing it.
func (gs *GitHubService) PreviewSync() (*SyncPreview, error) {
	if !gs.IsEnabled() {
		return nil, errGitHubNotEnabled()
	}
	gs.syncMu.Lock()
	defer gs.syncMu.Unlock()
	if _, err := gs.ensureClient(); err != nil {
		return nil, err
	}
	if err := gs.setupGitRemote(); err != nil {
		return nil, err
	}
	if err := gs.commitUncommittedChanges(); err != nil {
		return nil, err
	}
	out, plan, err := gs.pullOnce(nil, true)
	if err != nil {
		return nil, err
	}
	p := &SyncPreview{Incoming: []string{}, Outgoing: []string{}, Conflicts: out.Conflicts,
		Unreadable: out.Unreadable, RemoteHead: out.RemoteHead.String()}
	if p.Conflicts == nil {
		p.Conflicts = []string{}
	}
	for _, c := range plan.Apply {
		p.Incoming = append(p.Incoming, c.Path)
	}
	outgoing, err := gs.outgoingPaths(out.RemoteHead, plan.Conflicts)
	if err != nil {
		return nil, err
	}
	p.Outgoing = outgoing
	return p, nil
}

// outgoingPaths lists files the wiki changed since the last commit it shares
// with GitHub (all of them when it shares none), minus the conflicts.
func (gs *GitHubService) outgoingPaths(remoteHead plumbing.Hash, conflicts []string) ([]string, error) {
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	base := plumbing.ZeroHash
	if !remoteHead.IsZero() {
		if base, err = mergeBase(repo, head.Hash(), remoteHead); err != nil {
			return nil, err
		}
	}
	baseTree, err := commitTree(repo, base)
	if err != nil {
		return nil, err
	}
	localTree, err := commitTree(repo, head.Hash())
	if err != nil {
		return nil, err
	}
	skip := map[string]bool{}
	for _, c := range conflicts {
		skip[c] = true
	}
	out := []string{}
	seen := map[string]bool{}
	for _, t := range []syncplan.Tree{baseTree, localTree} {
		for p := range t {
			if seen[p] || skip[p] {
				continue
			}
			seen[p] = true
			if baseTree[p] != localTree[p] {
				out = append(out, p)
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

// ConflictVersions returns the wiki's and GitHub's version of a page a paused
// sync is waiting on, with a diff between them.
func (gs *GitHubService) ConflictVersions(path string) (*ConflictVersions, error) {
	s := gs.settings.GetGitHubSettings()
	if !slices.Contains(s.SyncConflicts, path) {
		return nil, apierrors.NewNotFoundError("sync conflict", path)
	}
	repo, err := gs.localRepository()
	if err != nil {
		return nil, err
	}
	remoteTree, err := commitTree(repo, plumbing.NewHash(s.PausedRemoteHead))
	if err != nil {
		return nil, err
	}
	head, err := repo.Head()
	if err != nil {
		return nil, err
	}
	localTree, err := commitTree(repo, head.Hash())
	if err != nil {
		return nil, err
	}
	read := func(blob string) string {
		if blob == "" {
			return ""
		}
		b, _ := blobBytes(repo, blob)
		return string(b)
	}
	v := &ConflictVersions{Path: path, Local: read(localTree[path]), Remote: read(remoteTree[path])}
	v.Diff = gs.gitService.computeDiff("/"+strings.TrimSuffix(path, ".md"), "schist", "github", v.Local, v.Remote)
	return v, nil
}
```

Add `"slices"` and `apierrors "github.com/MorrisMorrison/schist/internal/errors"`
to the `github_pull.go` imports. Define the two structs from the Interfaces
block in the same file.

In `GitHubConfigRequest`, add
`Mode *string `json:"mode,omitempty"``. In `UpdateConfiguration`, validate it
before the settings update:

```go
	if req.Mode != nil && *req.Mode != appconfig.GitHubModeBackup && *req.Mode != appconfig.GitHubModeTwoWay {
		return apierrors.NewValidationError(`mode must be "backup" or "two-way"`)
	}
```

and apply it inside the update closure:

```go
		if req.Mode != nil {
			st.GitHub.Mode = *req.Mode
			if *req.Mode == appconfig.GitHubModeTwoWay {
				st.GitHub.AutoSync = true // pulls need the interval sync
			} else {
				st.GitHub.SyncConflicts, st.GitHub.PausedRemoteHead = nil, ""
			}
		}
```

Make the interval depend on the mode:

```go
// autoSyncInterval is SCHIST_GITHUB_AUTO_SYNC_MINUTES when set; otherwise 5
// minutes for two-way sync (so edits from elsewhere arrive soon) and the
// default for backup.
func (gs *GitHubService) autoSyncInterval() time.Duration {
	if os.Getenv("SCHIST_GITHUB_AUTO_SYNC_MINUTES") == "" && gs.settings.GetGitHubSettings().TwoWay() {
		return 5 * time.Minute
	}
	if gs.config == nil || gs.config.GitHubAutoSyncInterval <= 0 {
		return appconfig.DefaultGitHubAutoSyncMinutes * time.Minute
	}
	return gs.config.GitHubAutoSyncInterval
}
```

Add `"os"` to the imports if it's missing.

In `github_service_scheduler.go`, change `interval time.Duration` to
`interval func() time.Duration`. Replace the ticker loop in `Start`:

```go
	go func() {
		defer s.done.Done()
		for {
			timer := time.NewTimer(s.cfg.interval())
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				if s.cfg.autoSync() {
					s.trigger()
				}
			}
		}
	}()
```

In `NewGitHubService`, pass `interval: service.autoSyncInterval` (the method
value, not a call). In `github_service_scheduler_test.go`, change each
`interval: X` to `interval: func() time.Duration { return X }`.

In `container.go`, after `gitService.SetCommitHook(...)`:

```go
	gitHubService.SetPullHook(func(pages []string) {
		if err := linkService.UpdateBacklinksFor(pages...); err != nil {
			log.Printf("Warning: link index after a pull: %v", err)
		}
	})
```

- [ ] **Step 4: Run the whole services suite**

Run: `cd backend && go test ./internal/... 2>&1 | grep -v "^ok" | tail -20`
Expected: only the known Windows-only failures, and nothing new.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/services && git commit -m "feat(sync): preview, conflict versions, two-way mode in config, 5-minute interval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: HTTP endpoints, then PR 2

**Files:**
- Modify: `backend/internal/handlers/github_handler.go` (next to
  `syncToGitHub`, line 94)
- Modify: `backend/internal/handlers/api_handler.go:116-124`
- Test: `backend/internal/handlers/github_handler_test.go`. If the file
  exists, follow its env helper; otherwise use the handler test env that
  `content_handlers_test.go` uses.

**Interfaces:**
- Consumes: `PreviewSync`, `ConflictVersions` and the extended
  `GitHubSyncOptions` (Tasks 7–8).
- Produces:
  - `POST /api/github/sync` with body
    `{"resolutions": {...}, "remote_head": "..."}`, beside `replace_remote`.
  - `POST /api/github/sync/preview` → `SyncPreview`.
  - `GET /api/github/sync/conflict?path=<repo path>` → `ConflictVersions`.

- [ ] **Step 1: Write the failing test**

```go
func TestGitHubSyncEndpoints_RequireSetup(t *testing.T) {
	env := newAPIEnv(t, apiEnvOptions{})
	w := env.do(t, http.MethodPost, "/api/github/sync/preview", nil, "")
	assert.Equal(t, http.StatusConflict, w.Code, "GitHub backup is not set up")
	w = env.do(t, http.MethodGet, "/api/github/sync/conflict?path=plan.md", nil, "")
	assert.Equal(t, http.StatusNotFound, w.Code)
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && go test ./internal/handlers/ -run TestGitHubSyncEndpoints_RequireSetup -v`
Expected: FAIL with 404 from the router (the routes don't exist yet).

- [ ] **Step 3: Implement**

In `api_handler.go`, inside the `github` group:

```go
		github.POST("/sync/preview", h.previewGitHubSync)
		github.GET("/sync/conflict", h.getGitHubSyncConflict)
```

In `github_handler.go`:

```go
// previewGitHubSync shows what a two-way sync would do, changing nothing.
func (h *APIHandler) previewGitHubSync(c *gin.Context) {
	preview, err := h.GitHubService.PreviewSync()
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, preview)
}

// getGitHubSyncConflict returns both versions of a page a paused sync waits on.
func (h *APIHandler) getGitHubSyncConflict(c *gin.Context) {
	versions, err := h.GitHubService.ConflictVersions(c.Query("path"))
	if err != nil {
		HandleError(c, err)
		return
	}
	c.JSON(http.StatusOK, versions)
}
```

`syncToGitHub` already binds `GitHubSyncOptions` from the body, so the new
fields come through. Check that `GitHubSyncOptions` has JSON tags for
`replace_remote`, and add them if it only has Go names.

- [ ] **Step 4: Run all backend tests**

Run: `cd backend && go vet ./... && go test ./... 2>&1 | grep -v "^ok" | tail -20`
Expected: only the known Windows-only failures.

- [ ] **Step 5: Commit, push, open PR 2, and merge on green**

```bash
git add backend/internal/handlers && git commit -m "feat(sync): preview and conflict endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The PR body: "Two-way sync engine (backend) for #303, part 2. Off by default
(`mode` = backup). UI follows in part 3." Watch CI, and squash-merge only when
fully green.

---

# PR 3: UI and docs

### Task 10: Client types, API methods, store

**Files:**
- Modify: `frontend/src/lib/api/types.ts:267-330`
- Modify: `frontend/src/lib/api/client.ts:715-718`
- Modify: `frontend/src/lib/stores/github.svelte.ts`
- Modify: `frontend/src/lib/utils/error.ts` (`ErrorCode` union)
- Test: `frontend/src/lib/api/client.test.ts`

**Interfaces:**
- Produces:

```ts
export type GitHubSyncMode = 'backup' | 'two-way';
// GitHubSettings gains:
mode?: GitHubSyncMode | '';
sync_conflicts?: string[];
paused_remote_head?: string;
unreadable?: string[];
// GitHubConfigRequest gains: mode?: GitHubSyncMode;
// GitHubSyncOptions gains:
resolutions?: Record<string, 'local' | 'remote'>;
remoteHead?: string;
export interface SyncPreview { incoming: string[]; outgoing: string[]; conflicts: string[]; unreadable: string[]; remote_head: string; }
export interface ConflictVersions { path: string; local: string; remote: string; diff: DiffResult; }
// client:
syncToGitHub(options): sends { replace_remote?, resolutions?, remote_head? }
previewGitHubSync(): Promise<SyncPreview>   // POST /github/sync/preview
getGitHubSyncConflict(path: string): Promise<ConflictVersions> // GET /github/sync/conflict?path=
// store (githubActions):
previewSync(): Promise<SyncPreview>
loadConflict(path: string): Promise<ConflictVersions>
// syncToGitHub(options) already exists and passes options through
```

- [ ] **Step 1: Write the failing client tests**

In `frontend/src/lib/api/client.test.ts`, follow the existing `lastCall()`
pattern (see the `moveFolder` test around line 346):

```ts
		it('sends resolutions with the remote head', async () => {
			await client.syncToGitHub({ resolutions: { 'plan.md': 'local' }, remoteHead: 'abc' });
			expect(lastCall().url).toBe('/api/github/sync');
			expect(JSON.parse(lastCall().init.body)).toEqual({
				resolutions: { 'plan.md': 'local' },
				remote_head: 'abc'
			});
		});

		it('previews and reads conflicts', async () => {
			await client.previewGitHubSync();
			expect(lastCall().url).toBe('/api/github/sync/preview');
			await client.getGitHubSyncConflict('notes/plan.md');
			expect(lastCall().url).toBe('/api/github/sync/conflict?path=notes%2Fplan.md');
		});
```

Adapt `lastCall().init.body` to the property name the helper actually exposes.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/lib/api/client.test.ts`
Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement**

Add the types from the Interfaces block to `types.ts`. Replace
`syncToGitHub` in `client.ts`:

```ts
	async syncToGitHub(options: GitHubSyncOptions = {}): Promise<GitHubSyncResult> {
		const body: Record<string, unknown> = {};
		if (options.replaceRemote) body.replace_remote = true;
		if (options.resolutions) {
			body.resolutions = options.resolutions;
			body.remote_head = options.remoteHead;
		}
		return this.send<GitHubSyncResult>(
			'POST',
			'/github/sync',
			Object.keys(body).length ? body : undefined
		);
	}

	async previewGitHubSync(): Promise<SyncPreview> {
		return this.send<SyncPreview>('POST', '/github/sync/preview');
	}

	async getGitHubSyncConflict(path: string): Promise<ConflictVersions> {
		return this.request<ConflictVersions>(
			`/github/sync/conflict?path=${encodeURIComponent(path)}`
		);
	}
```

Import `SyncPreview` and `ConflictVersions` in the client's type import list.
In `github.svelte.ts`, add next to `syncToGitHub`:

```ts
	async previewSync() {
		return apiClient.previewGitHubSync();
	},

	async loadConflict(path: string) {
		return apiClient.getGitHubSyncConflict(path);
	},
```

After a sync attempt (success or failure), make sure `syncToGitHub` reloads
the settings, so `sync_conflicts` refreshes. If it doesn't already, add
`await this.loadGitHubSettings(true)` in its `finally` block. Add
`'DOCUMENT_CHANGED' | 'SYNC_CONFLICT'` to the `ErrorCode` union in
`utils/error.ts` if they aren't there yet.

Run: `cd frontend && npx vitest run src/lib/api src/lib/stores`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api frontend/src/lib/stores frontend/src/lib/utils/error.ts && git commit -m "feat(sync): client and store for two-way sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: The mode switch with preview

**Files:**
- Create: `frontend/src/lib/components/github/SyncModeSetting.svelte`
- Test: `frontend/src/lib/components/github/SyncModeSetting.test.ts`
- Modify: `frontend/src/lib/components/GitHubSettingsSection.svelte` (render it
  at the top of `<Tabs.Content value="sync">`, line 569)

**Interfaces:**
- Consumes: `githubStore.settings.mode`, `githubActions.previewSync()`,
  `githubActions.updateSettings({ mode })` and
  `githubActions.syncToGitHub()` (Task 10).
- Produces: `<SyncModeSetting />` with `data-testid="sync-mode-backup"`,
  `"sync-mode-two-way"` and `"sync-preview-dialog"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: { settings: { mode: 'backup', enabled: true } },
	githubActions: {
		previewSync: vi.fn(),
		updateSettings: vi.fn().mockResolvedValue({}),
		syncToGitHub: vi.fn().mockResolvedValue({ success: true })
	}
}));

import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncModeSetting from './SyncModeSetting.svelte';

describe('SyncModeSetting', () => {
	beforeEach(() => vi.clearAllMocks());

	it('previews before switching to two-way, and switches on confirm', async () => {
		vi.mocked(githubActions.previewSync).mockResolvedValue({
			incoming: ['new.md'],
			outgoing: ['mine.md'],
			conflicts: ['plan.md'],
			unreadable: [],
			remote_head: 'abc'
		});
		render(SyncModeSetting);

		await page.getByTestId('sync-mode-two-way').click();
		const dialog = page.getByTestId('sync-preview-dialog');
		await expect.element(dialog.getByText('new.md')).toBeVisible();
		await expect.element(dialog.getByText('plan.md')).toBeVisible();
		expect(githubActions.updateSettings).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Turn on two-way sync' }).click();
		expect(githubActions.updateSettings).toHaveBeenCalledWith({ mode: 'two-way' });
		expect(githubActions.syncToGitHub).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/components/github/SyncModeSetting.test.ts`
Expected: FAIL (the module doesn't exist).

- [ ] **Step 3: Implement**

```svelte
<script lang="ts">
	// Backup only (push) or two-way sync (also pull edits made elsewhere, e.g.
	// Obsidian). Switching on shows what the first sync would do first.
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { githubActions, githubStore } from '#lib/stores/github.svelte.ts';
	import { getErrorMessage } from '#lib/utils/error.ts';
	import type { SyncPreview } from '#lib/api/types.ts';

	const twoWay = $derived(githubStore.settings?.mode === 'two-way');
	let preview = $state<SyncPreview | null>(null);
	let busy = $state(false);
	let error = $state('');

	async function chooseTwoWay() {
		if (twoWay || busy) return;
		busy = true;
		error = '';
		try {
			preview = await githubActions.previewSync();
		} catch (err) {
			error = getErrorMessage(err, 'Could not check GitHub');
		} finally {
			busy = false;
		}
	}

	async function confirmTwoWay() {
		busy = true;
		try {
			await githubActions.updateSettings({ mode: 'two-way' });
			preview = null;
			await githubActions.syncToGitHub().catch(() => {}); // a pause shows in the conflicts list
		} catch (err) {
			error = getErrorMessage(err, 'Could not turn on two-way sync');
		} finally {
			busy = false;
		}
	}

	async function chooseBackup() {
		if (!twoWay || busy) return;
		await githubActions.updateSettings({ mode: 'backup' });
	}
</script>

<fieldset class="space-y-2" aria-label="Sync mode">
	<legend class="text-sm font-medium">Sync mode</legend>
	<label class="flex items-start gap-2">
		<input
			type="radio"
			name="sync-mode"
			checked={!twoWay}
			onchange={chooseBackup}
			data-testid="sync-mode-backup"
		/>
		<span>
			<span class="font-medium">Backup only</span>
			<span class="text-muted-foreground block text-sm">Schist pushes; GitHub is a copy.</span>
		</span>
	</label>
	<label class="flex items-start gap-2">
		<input
			type="radio"
			name="sync-mode"
			checked={twoWay}
			onchange={chooseTwoWay}
			disabled={busy}
			data-testid="sync-mode-two-way"
		/>
		<span>
			<span class="font-medium">Two-way sync</span>
			<span class="text-muted-foreground block text-sm">
				Also brings in changes made on GitHub or in a clone (for example Obsidian), every 5
				minutes.
			</span>
		</span>
	</label>
	{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
</fieldset>

<Dialog.Root open={preview !== null} onOpenChange={(open) => !open && (preview = null)}>
	<Dialog.Content class="sm:max-w-lg" data-testid="sync-preview-dialog">
		<Dialog.Header>
			<Dialog.Title>Turn on two-way sync?</Dialog.Title>
			<Dialog.Description>This is what the first sync would do.</Dialog.Description>
		</Dialog.Header>
		{#if preview}
			{#each [['Comes into the wiki', preview.incoming], ['Goes to GitHub', preview.outgoing], ['Changed in both places (you pick a side)', preview.conflicts], ['Not readable by Schist (kept, not shown)', preview.unreadable]] as [label, items] (label)}
				{#if items.length}
					<div>
						<h4 class="text-sm font-medium">{label} ({items.length})</h4>
						<ul class="text-muted-foreground max-h-32 overflow-y-auto font-mono text-xs">
							{#each items as item (item)}<li>{item}</li>{/each}
						</ul>
					</div>
				{/if}
			{/each}
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (preview = null)}>Cancel</Button>
			<Button onclick={confirmTwoWay} disabled={busy}>Turn on two-way sync</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
```

If the codebase's `ui/radio-group` is the convention for settings radios (see
`EditorSettingsSection.svelte`), use it instead of raw inputs, and keep the
test ids on the items. Render `<SyncModeSetting />` at the top of the `sync`
tab in `GitHubSettingsSection.svelte`.

Run: `cd frontend && npx vitest run src/lib/components/github src/lib/components/GitHubSettingsSection.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components && git commit -m "feat(sync): mode switch with a preview of the first sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Paused-sync list with diff, and the page banner

**Files:**
- Create: `frontend/src/lib/components/github/SyncConflicts.svelte`
- Test: `frontend/src/lib/components/github/SyncConflicts.test.ts`
- Create: `frontend/src/lib/components/github/SyncConflictBanner.svelte`
- Test: `frontend/src/lib/components/github/SyncConflictBanner.test.ts`
- Modify: `frontend/src/lib/components/GitHubSettingsSection.svelte` (render
  `<SyncConflicts />` under `<SyncModeSetting />`)
- Modify: `frontend/src/lib/components/document/DocumentView.svelte` (render
  `<SyncConflictBanner path={documentPath} />` above the content)

**Interfaces:**
- Consumes: `githubStore.settings.sync_conflicts`,
  `paused_remote_head`, `unreadable`; `githubActions.loadConflict(path)` and
  `githubActions.syncToGitHub({ resolutions, remoteHead })`; and
  `DiffViewer.svelte` (`diffResult` prop).
- Produces:
  - `data-testid="sync-conflicts"` and `"sync-conflict-row"`, plus the
    buttons "Keep Schist's", "Take GitHub's", "All Schist", "All GitHub" and
    "Resume sync".
  - `data-testid="sync-conflict-banner"`.

- [ ] **Step 1: Write the failing tests**

`SyncConflicts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: {
		settings: { mode: 'two-way', sync_conflicts: ['plan.md', 'notes/a.md'], paused_remote_head: 'abc', unreadable: ['My Note.md'] }
	},
	githubActions: {
		loadConflict: vi.fn().mockResolvedValue({
			path: 'plan.md', local: 'L', remote: 'R',
			diff: { path: '/plan', hash1: 'schist', hash2: 'github', lines: [], summary: { additions: 0, deletions: 0, modifications: 0 } }
		}),
		syncToGitHub: vi.fn().mockResolvedValue({ success: true })
	}
}));

import { githubActions } from '#lib/stores/github.svelte.ts';
import SyncConflicts from './SyncConflicts.svelte';

describe('SyncConflicts', () => {
	beforeEach(() => vi.clearAllMocks());

	it('resumes only when every page has a side, sending the choices', async () => {
		render(SyncConflicts);
		await expect.element(page.getByText('Sync paused: 2 pages changed in both Schist and GitHub')).toBeVisible();
		const resume = page.getByRole('button', { name: 'Resume sync' });
		await expect.element(resume).toBeDisabled();

		const rows = page.getByTestId('sync-conflict-row');
		await rows.nth(0).getByRole('button', { name: "Keep Schist's" }).click();
		await rows.nth(1).getByRole('button', { name: "Take GitHub's" }).click();
		await resume.click();

		expect(githubActions.syncToGitHub).toHaveBeenCalledWith({
			resolutions: { 'plan.md': 'local', 'notes/a.md': 'remote' },
			remoteHead: 'abc'
		});
	});

	it('lists notes Schist cannot read', async () => {
		render(SyncConflicts);
		await expect.element(page.getByText('My Note.md')).toBeVisible();
	});
});
```

`SyncConflictBanner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';

vi.mock('#lib/stores/github.svelte.ts', () => ({
	githubStore: { settings: { sync_conflicts: ['notes/plan.md'] } }
}));
import SyncConflictBanner from './SyncConflictBanner.svelte';

describe('SyncConflictBanner', () => {
	it('shows on a page waiting for a side', async () => {
		render(SyncConflictBanner, { path: '/notes/plan' });
		await expect.element(page.getByTestId('sync-conflict-banner')).toBeVisible();
	});

	it('stays away elsewhere', async () => {
		render(SyncConflictBanner, { path: '/notes/other' });
		await expect.element(page.getByTestId('sync-conflict-banner')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npx vitest run src/lib/components/github`
Expected: FAIL (the modules don't exist).

- [ ] **Step 3: Implement**

`SyncConflicts.svelte`:

```svelte
<script lang="ts">
	// A paused two-way sync: pages changed in both Schist and GitHub. Pick a
	// side for each, then resume. The other version stays in git history.
	import { Button } from '#lib/components/ui/button/index.ts';
	import DiffViewer from '#lib/components/DiffViewer.svelte';
	import { githubActions, githubStore } from '#lib/stores/github.svelte.ts';
	import { getErrorMessage } from '#lib/utils/error.ts';
	import type { ConflictVersions } from '#lib/api/types.ts';

	type Side = 'local' | 'remote';
	const conflicts = $derived(githubStore.settings?.sync_conflicts ?? []);
	const unreadable = $derived(githubStore.settings?.unreadable ?? []);
	let choices = $state<Record<string, Side>>({});
	let open = $state<ConflictVersions | null>(null);
	let busy = $state(false);
	let error = $state('');
	const ready = $derived(conflicts.length > 0 && conflicts.every((p) => choices[p]));

	function chooseAll(side: Side) {
		choices = Object.fromEntries(conflicts.map((p) => [p, side]));
	}

	async function toggleDiff(path: string) {
		if (open?.path === path) {
			open = null;
			return;
		}
		try {
			open = await githubActions.loadConflict(path);
		} catch (err) {
			error = getErrorMessage(err, 'Could not load both versions');
		}
	}

	async function resume() {
		busy = true;
		error = '';
		try {
			await githubActions.syncToGitHub({
				resolutions: { ...choices },
				remoteHead: githubStore.settings?.paused_remote_head
			});
			choices = {};
			open = null;
		} catch (err) {
			error = getErrorMessage(err, 'Sync failed');
		} finally {
			busy = false;
		}
	}
</script>

{#if conflicts.length}
	<section class="border-destructive/40 space-y-3 rounded-lg border p-4" data-testid="sync-conflicts">
		<h3 class="font-medium">
			Sync paused: {conflicts.length}
			{conflicts.length === 1 ? 'page' : 'pages'} changed in both Schist and GitHub
		</h3>
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => chooseAll('local')}>All Schist</Button>
			<Button size="sm" variant="outline" onclick={() => chooseAll('remote')}>All GitHub</Button>
		</div>
		<ul class="space-y-2">
			{#each conflicts as path (path)}
				<li class="rounded border p-2" data-testid="sync-conflict-row">
					<div class="flex flex-wrap items-center gap-2">
						<button class="font-mono text-sm underline" onclick={() => toggleDiff(path)}>{path}</button>
						<span class="flex-1"></span>
						<Button
							size="sm"
							variant={choices[path] === 'local' ? 'default' : 'outline'}
							aria-pressed={choices[path] === 'local'}
							onclick={() => (choices = { ...choices, [path]: 'local' })}>Keep Schist's</Button
						>
						<Button
							size="sm"
							variant={choices[path] === 'remote' ? 'default' : 'outline'}
							aria-pressed={choices[path] === 'remote'}
							onclick={() => (choices = { ...choices, [path]: 'remote' })}>Take GitHub's</Button
						>
					</div>
					{#if open?.path === path}
						<div class="mt-2"><DiffViewer diffResult={open.diff} /></div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if error}<p class="text-destructive text-sm" role="alert">{error}</p>{/if}
		<Button onclick={resume} disabled={!ready || busy}>Resume sync</Button>
	</section>
{/if}

{#if unreadable.length}
	<section class="space-y-1 rounded-lg border p-4" data-testid="sync-unreadable">
		<h3 class="text-sm font-medium">Not readable by Schist ({unreadable.length})</h3>
		<p class="text-muted-foreground text-sm">
			These files came from GitHub and are kept as they are, but Schist can't show them as pages (no
			front matter, or a file name with spaces or other characters).
		</p>
		<ul class="font-mono text-xs">
			{#each unreadable as file (file)}<li>{file}</li>{/each}
		</ul>
	</section>
{/if}
```

`SyncConflictBanner.svelte`:

```svelte
<script lang="ts">
	// On a page a paused two-way sync is waiting on: point to where to decide.
	import { githubStore } from '#lib/stores/github.svelte.ts';

	let { path }: { path: string } = $props();
	const file = $derived(path.replace(/^\/+/, '') + '.md');
	const waiting = $derived((githubStore.settings?.sync_conflicts ?? []).includes(file));
</script>

{#if waiting}
	<div class="border-destructive/40 mb-4 rounded-lg border p-3 text-sm" role="status" data-testid="sync-conflict-banner">
		This page changed both here and on GitHub, so syncing is paused.
		<a class="underline" href="/settings#github">Pick a version in Settings → GitHub</a>.
	</div>
{/if}
```

Check the settings route's actual anchor for the GitHub section and use it.
Make sure the GitHub settings are loaded on the document page. If
`githubStore.settings` is only loaded by the settings page, call
`githubActions.loadGitHubSettings()` once in the banner's `onMount`, and catch
and ignore errors (the endpoint needs no secret unlock).

Render `<SyncConflicts />` after `<SyncModeSetting />` in
`GitHubSettingsSection.svelte`. In `DocumentView.svelte`, render
`<SyncConflictBanner path={documentPath} />` directly above the `<main>`
content.

Run: `cd frontend && npx vitest run src/lib/components`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components && git commit -m "feat(sync): resolve a paused sync per page, and a banner on affected pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Docs, then PR 3

**Files:**
- Modify: `docs/guides/github-backup.md`
- Modify: `docs/reference/configuration.md`
- Modify: `docs/reference/rest-api.md`
- Modify: `docs/reference/error-codes.md`

- [ ] **Step 1: Write the docs**

In `docs/guides/github-backup.md`, add a section "Two-way sync" covering:
- what it does (brings in edits made on GitHub or in a clone, such as
  Obsidian)
- how to turn it on (Settings → GitHub → Sync mode, with the preview)
- the rules:
  - different pages merge on their own
  - the same page changed in both places pauses the sync until you pick a
    side per page, and the other version stays in history
  - files that aren't pages (`.obsidian/`, attachments) take GitHub's
    version
- notes Schist can't read yet (no front matter, or file names with spaces)
  are kept but not shown, and are listed in Settings
- the editor's "This page changed since you opened it" dialog

Use the user's plain style: short sentences, no hype.

In `docs/reference/configuration.md`, extend the
`SCHIST_GITHUB_AUTO_SYNC_MINUTES` row: "default 15; 5 in two-way mode when
unset".

In `docs/reference/rest-api.md`, document `mode` on `PUT /github/config`,
`resolutions`/`remote_head` on `POST /github/sync`,
`POST /github/sync/preview`, and `GET /github/sync/conflict?path=`.

In `docs/reference/error-codes.md`, add `SYNC_CONFLICT` (409):
`details.conflicts`, `details.remote_head`.

- [ ] **Step 2: Check the docs site builds**

Run: `cd docs-site && npm run build 2>&1 | tail -5` (when its `node_modules`
are available; CI's Docs job runs it otherwise).
Expected: build OK, with no broken links.

- [ ] **Step 3: Commit, push, open PR 3, and merge on green**

```bash
git add docs && git commit -m "docs: two-way GitHub sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The PR body summarizes the UI and closes #303 (`Closes #303`). Watch CI, and
squash-merge only when fully green.
