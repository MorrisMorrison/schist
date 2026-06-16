# HTTP API Test Files

`.http` request collections for testing the Schist API with the
[VS Code REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
extension (or any compatible client, such as the JetBrains HTTP client).

The files are organised one-per-resource and together cover every route registered
in `backend/internal/handlers/api._handler.go`.

## Files

| File | Endpoints |
| --- | --- |
| `health.http` | `GET /health`, `GET /config`, CORS preflight |
| `auth.http` | `/auth/*` — setup, passkey login, invites, user management |
| `documents.http` | `/documents/*` (CRUD, move, HEAD) and `/templates` |
| `folders.http` | `/folders/*` — tree, contents, create, rename, move, delete |
| `assets.http` | `/assets/*` upload/serve/delete and the static `/uploads/*` mirror |
| `search.http` | `GET /search` and `GET /tags` |
| `links.http` | `/links/*` — broken links, outgoing links, backlinks |
| `versions.http` | `/versions/*` — history, view-at-commit, diff, restore |
| `import.http` | `POST /import/documents` — bulk markdown import |
| `export.http` | `/export/*` — single document, folder zip, full wiki zip |
| `shares.http` | `/shares/*` — public read-only share links |
| `github.http` | `/github/*` GitHub backup and `/git/*` local repo health |
| `secrets.http` | `/secrets/*` — encrypted secret store |
| `passkeys.http` | `/passkeys/*` — WebAuthn registration, auth, unlock, management |

## Usage

1. Install the **REST Client** extension in VS Code.
2. **Select an environment**: `Ctrl/Cmd+Shift+P` → "Rest Client: Switch Environment":
   - `dev` — frontend dev server on `:5173`, backend on `:8080`
   - `local` — backend on `:8080`, frontend on `:3000`
   - `docker` — everything on `:8080`
   - `prod` — everything on `:8080`
3. Open a file and click **Send Request** above any request.

### Variables

Environment values live in `http-client.env.json`:

- `{{baseUrl}}` — server root (e.g. `http://localhost:8080`)
- `{{apiUrl}}` — API base (`{{baseUrl}}/api`)
- `{{frontendUrl}}` — frontend origin (used for CORS examples)
- `{{authToken}}` — JWT for protected routes when auth is enabled (shared, empty by default)

Each file also defines local `@variables` at the top (paths, ids, tokens) — edit
those placeholders to point at real data in your instance.

### Request chaining

Many requests are named (`# @name createShare`) so later requests can reference
their responses, e.g. `GET {{apiUrl}}/shares/{{createShare.response.body.token}}`.
Run the named request first, then the dependent one in the same session.

## Authentication

Auth is **optional** and **disabled by default** (`SCHIST_AUTH_ENABLED=false`), so
most requests work as-is. When enabled, protected endpoints require a
`Bearer <jwt>` token:

```
Authorization: Bearer {{authToken}}
```

`/health`, `/config`, the `/auth/login*` + `/auth/setup/*` routes, the
`/passkeys/{register,authenticate}/*` begin/finish routes, and `GET /shares/:token`
stay public even when auth is on. Obtain a JWT via `POST /auth/login/passkey`
(see `auth.http`) — note that minting a real passkey credential requires a browser
authenticator (see `passkeys.http`).

## Notes on file uploads

`assets.http` and `import.http` use `multipart/form-data` and reference files
relative to the `.http` file (e.g. `< ./sample.png`). Drop a sample image / markdown
file into this `http/` folder, or adjust the paths, before sending those requests.

## Server setup

```bash
# Development mode (CORS enabled)
ENV=development make run-backend

# Production mode
make run-backend
```

The backend listens on `http://localhost:8080` by default.
