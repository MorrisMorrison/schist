---
name: add-api-endpoint
description: Add or change a Schist REST endpoint end to end — service method with typed errors, Gin handler, route in api_handler.go, frontend API client + types, .http request file, tests and docs. Use when a feature needs a new /api route, a new request/response field, or a change to an existing endpoint's behaviour or status codes.
---

# Add an API endpoint end to end

Work from the inside out: service → handler → route → client → docs. Write the service test first.

## 1. Service (`backend/internal/services/`)
- Put the logic on the existing service for that area (`DocumentService`, `ShareService`, …). A new service gets a constructor and a field on `Services` in `container.go`.
- Return **typed errors** from `internal/errors`: `NewNotFoundError(resource, id)` → 404, `NewValidationError` / `NewInvalidPathError` / `NewMissingRequiredFieldError` → 400, `NewAlreadyExistsError` / `NewConflictError` → 409, `NewUnauthorizedError` → 401, `NewForbiddenError` → 403. Wrapping with `%w` is fine. A genuine internal failure stays a plain `fmt.Errorf` (→ 500, cause logged, not sent).
- User-supplied paths go through the `utils` path helpers. New JSON stores copy the mutex + atomic temp-file-and-rename pattern from `saveShares`.
- **Test first** in `<service>_test.go`: table-driven, data in `t.TempDir()`, assert the error *type* (`errors.As`) for each failure case, not its text.

## 2. Handler (`backend/internal/handlers/<area>_handler.go`)
- Method on `*APIHandler`. Request/response structs with `json` tags (snake_case) next to the handler.
- Bind with `ValidateJSONBody(c, &req)`; on error `HandleError(c, apiErr); return`.
- Get the user with `currentUser(c)` when the action is per-user.
- On any service error: `HandleError(c, err); return`. Never `c.JSON(status, gin.H{"error": err.Error()})` and never map status by `strings.Contains(err.Error(), …)`.

## 3. Route (`backend/internal/handlers/api_handler.go`)
- Register in the right group (`documents`, `folders`, `shares`, `auth`, the `admin` sub-group, …). Check whether it must be public or behind auth / admin middleware.
- `api_handler.go` is shared by every area: keep the diff to the route lines, and don't edit it from two branches at once.

## 4. Frontend
- Types in `frontend/src/lib/api/types.ts`; a method on the client in `frontend/src/lib/api/client.ts` using the private `request<T>()` helper (it attaches the token and handles 401s).
- Call it from the relevant store in `lib/stores/*.svelte.ts`, not from components. Branch on HTTP status / error `code`, not on message text.

## 5. Docs and request files
- Add the request to the area's file in `http/` (same style: `###` title, expected status in a `# =>` comment).
- Update `docs/API.md`; new config → `docs/CONFIGURATION.md`; user-visible feature → `README.md`.

## Verify
```bash
cd backend && gofmt -l . && go vet ./... && go test ./...
cd frontend && npm run check && npm run lint && npm run test:unit
```
If the flow is user-facing, add or extend an e2e test in `e2e/tests/` (seed data through the API fixtures) and let CI run it.
