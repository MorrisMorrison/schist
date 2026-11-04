# REST API

The JSON API behind the web app. Use it for scripts and integrations; AI assistants are better served by the [MCP endpoint](mcp-tools.md).

Every area also has a ready-to-run request file in [`http/`](../../http/) (VS Code REST Client or JetBrains HTTP client).

## Basics

| | |
|---|---|
| **Base URL** | `https://<your wiki>/api` (`http://localhost:8080/api` locally) |
| **Format** | JSON in and out, except uploads (multipart), exports (files) and assets |
| **Paths** | Pages and folders are addressed by their wiki path without `.md`: `/api/documents/projects/roadmap` |
| **Errors** | `{"error", "code", "details"}` with an HTTP status. Branch on `code`; see [Error codes](error-codes.md) |

## Authentication

With authentication on (the default), every endpoint except the public ones below needs a bearer token:

```http
Authorization: Bearer <token>
```

The token is either a **session JWT** from a passkey sign-in, or a **personal access token** (`sch_…`).

| Token | Where it works |
|---|---|
| Session JWT | Everywhere |
| Personal access token | Only `/api/documents`, `/api/folders`, `/api/assets`, `/api/links`, `/api/versions`, `/api/export`, `/api/import/documents`, `/api/search`, `/api/tags`, `/api/templates` and `/api/mcp`. Every other endpoint answers `403`. A `read` token gets `403` on anything but `GET`/`HEAD` (except `/api/mcp`). |

**Public endpoints** (no token): `/api/health`, `/api/config`, the setup and sign-in endpoints under `/api/auth` and `/api/passkeys`, and `GET /api/shares/{token}`. Tokens sent to public endpoints are ignored.

Without a valid token the answer is `401`:

```json
{ "error": "Unauthorized", "message": "Authentication required to access this resource" }
```

## Rate limiting

`/api/*` is limited per IP (`SCHIST_RATE_LIMIT_RPM`, default 100 a minute; `/api/health` is exempt). Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. Over the limit:

```json
{ "error": "Rate limit exceeded", "message": "Too many requests. Please try again later.", "retryAfter": 60 }
```

with status `429` and a `Retry-After` header.

## System

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/health` | `{"status": "ok", "service": "schist"}` |
| `GET` | `/api/config` | Feature flags for clients: `{"auth_enabled", "mcp_enabled"}` |
| `GET` | `/api/git/health` | Checks the data folder's git repository |
| `POST` | `/api/git/repair` | Repairs the git repository |

## Documents

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/documents` | Every page outside `/trash`: metadata and an `excerpt` (the first 400 characters), not the content. `{documents, total}` |
| `GET` | `/api/documents/{path}` | One page with its content |
| `POST` | `/api/documents` | Create a page |
| `PUT` | `/api/documents/{path}` | Update a page. A different `metaData.path` moves it |
| `DELETE` | `/api/documents/{path}` | Move the page to `/trash` |
| `POST` | `/api/documents/move` | Move a page: `{"oldPath", "newPath"}` |

A page:

```json
{
  "metaData": {
    "slug": "roadmap",
    "title": "Roadmap",
    "path": "/projects/roadmap",
    "created": "2026-11-03T10:30:00Z",
    "updated": "2026-11-03T12:00:00Z",
    "tags": ["planning"],
    "properties": { "status": "draft", "aliases": ["plan"] }
  },
  "content": "# Roadmap\n\nWhat we build next…"
}
```

- **Create:** send `metaData.title` and `content`; `path` and `tags` are optional. The path defaults to the slug of the title. Answers `{"message", "path"}`.
- **Tags:** inline `#tags` in the content are added to `tags` on every save, by any route (create, update, move, import, MCP). Code is skipped, and a tag must start a word.
- **Properties:** every other front matter key, left out when there are none. Sent `properties` replace the stored ones, `{}` clears them, and a save without `properties` keeps them. They can't replace Schist's own fields.

## Folders

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/folders` | The folder tree with page counts. `{folders, total}` |
| `GET` | `/api/folders/{path}` | One folder and its direct children (`/api/folders/` for the root) |
| `POST` | `/api/folders` | Create a folder: `{"path": "/projects/2026"}` |
| `PUT` | `/api/folders/{path}` | Rename a folder: `{"newName": "archive"}` (the new last segment, not a path) |
| `POST` | `/api/folders/move` | Move a folder: `{"oldPath", "newPath"}` |
| `DELETE` | `/api/folders/{path}` | **Removes the folder and everything in it from disk.** The root can't be deleted. To keep a way back, move it to `/trash` instead |

## Search and tags

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/search?q=&limit=` | Full-text search, described below |
| `GET` | `/api/tags` | Every tag with its count: `{tags: [{name, count}], total}` |
| `GET` | `/api/templates` | The page templates: `{templates, total}` |

**Search** looks at titles, headings, tags and bodies, case-insensitive. Every word must match the start of a word in the page. `tag:name` words filter by tag. The trash is excluded, and files changed outside the app are picked up on the next query.

| Parameter | |
|---|---|
| `q` | Words and `tag:` filters. Empty returns no results. |
| `limit` | Maximum results, default 20, at most 100. |

Results are ranked title > heading > tag > body; an exact title, a title that starts with the query and the whole phrase score extra. A query that only matches a title as a loose subsequence (`gtst` → "Getting started") still appears, below every real match.

```json
{
  "query": "release notes",
  "total": 3,
  "results": [
    {
      "path": "/guides/releasing",
      "title": "Releasing",
      "tags": ["process"],
      "matchedIn": "content",
      "score": 14.4,
      "snippet": [
        { "text": "…before tagging, write the " },
        { "text": "release notes", "match": true },
        { "text": " and link the milestone…" }
      ]
    }
  ]
}
```

`total` counts every match, even past `limit`. `matchedIn` is `title`, `heading`, `tag` or `content`. `snippet` is a list of segments; `match: true` marks a hit, so clients can highlight without parsing HTML.

## Links

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/links/outgoing/{path}` | The page's `[[wiki links]]` and where they resolve: `{path, links, total}` |
| `GET` | `/api/links/backlinks/{path}` | The pages that link to it: `{path, backlinks, total}` |
| `GET` | `/api/links/broken` | Every link to a page that doesn't exist |

How a link target is resolved is described in [Writing and linking](../guides/writing-and-linking.md#wiki-links).

## Versions

Every save is a git commit. All endpoints take the page `path` as a query parameter.

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/versions?path=` | The page's versions, newest first: `{path, versions, total}` |
| `GET` | `/api/versions/document?path=&hash=` | The page at a version |
| `GET` | `/api/versions/diff?path=&hash1=&hash2=` | The changes between two versions |
| `POST` | `/api/versions/restore?path=&hash=` | Restore a version, saved as a new commit |

## Assets

| Method | Endpoint | Does |
|---|---|---|
| `POST` | `/api/assets/upload` | Upload an image (multipart field `file`): PNG, JPEG, GIF or WebP, up to 10 MB. The content is checked, not just the name. Answers `{"message", "asset": {name, original_name, path, size, content_type, created}}` |
| `GET` | `/api/assets/{path}` | Serve an asset |
| `DELETE` | `/api/assets/{path}` | Delete an asset |

Uploaded images are also served as static files at `/uploads/{path}`.

## Import and export

| Method | Endpoint | Does |
|---|---|---|
| `POST` | `/api/import/documents` | Import markdown files or `.zip` files (multipart) |
| `GET` | `/api/export/document/{path}` | One page as a `.md` download |
| `GET` | `/api/export/folder/{path}` | A folder as a `.zip` |
| `GET` | `/api/export/all` | The whole wiki as a `.zip` |

Import form fields:

| Field | Description |
|---|---|
| `files` | One or more `.md` files, or `.zip` files whose folders are kept |
| `paths` | Optional, one per file in the same order: the file's path inside an uploaded folder (`vault/devices/router.md`). Browsers drop folders from file names, so a folder upload sends them here |
| `target_path` | Folder to import into (default `/`). Created if it doesn't exist. Invalid names become slugs; `..` is refused |
| `overwrite_mode` | `rename` (default), `skip` or `overwrite` |

The answer is `{total_files, imported_count, skipped_count, failed_count, success, skipped, failed}`. Each `success` and `skipped` entry has `original_name`, `final_path`, `title` and `notes` (what was converted or dropped, or why it was skipped). What the conversion does is described in [Import and export](../guides/import-and-export.md).

## Shares

| Method | Endpoint | Does |
|---|---|---|
| `POST` | `/api/shares` | Create a share: `{"document_path", "expiry_days"}`. `0`, a negative value or no `expiry_days` uses the default; the maximum is capped. Every share expires. Answers `201 {id, document_path, token, share_url, created_at, expires_at, created_by}` |
| `GET` | `/api/shares` | Your shares: `{shares, total}` |
| `GET` | `/api/shares/{token}` | **Public.** The shared page, or `404` when unknown or expired |
| `DELETE` | `/api/shares/{id}` | Revoke a share |
| `POST` | `/api/shares/cleanup` | Remove expired shares |

## Secrets

The secret store must be unlocked (with a passkey, `POST /api/passkeys/unlock`) for everything except `status` and `lock`; otherwise the answer is `423 SECRETS_LOCKED`.

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/secrets/status` | `{unlocked, has_secrets, has_passkeys, requires_setup}` |
| `POST` | `/api/secrets/lock` | Lock the store |
| `GET` | `/api/secrets` | The secret keys (not the values) |
| `POST` | `/api/secrets` | Create one: `{"key", "value"}` |
| `GET` | `/api/secrets/{key}` | One value: `{"value"}` |
| `PUT` | `/api/secrets/{key}` | Change a value: `{"value"}` |
| `DELETE` | `/api/secrets/{key}` | Delete one |

## GitHub backup

| Method | Endpoint | Does |
|---|---|---|
| `POST` | `/api/github/test` | Test a token and repository without saving: `{token, owner, repo, branch}`. `branch_exists: false` is fine; the first sync creates it |
| `POST` | `/api/github/setup` | Save the backup: `{token, owner, repo, branch, auto_sync, sync_on_save, sync_delay_minutes}` |
| `GET` | `/api/github/config` | The settings (never the token), the last sync, the last error and its code, `auto_sync_interval_minutes` and `sync_delay_minutes` |
| `PUT` | `/api/github/config` | Change `auto_sync`, `sync_on_save` (back up after the last edit), `sync_delay_minutes` (1 to 60, default 2; else `VALIDATION_ERROR`) or `branch` |
| `GET` | `/api/github/connection-status` | `{connected, tokenExists, pendingChanges}` |
| `POST` | `/api/github/sync` | Push now. `{"replace_remote": true}` force-pushes once over a diverged branch; send it only after the user confirms |
| `POST` | `/api/github/disconnect` | Remove the backup settings and token |

`sync` answers `409 INVALID_STATE` when backup isn't set up, `409 SYNC_REMOTE_DIVERGED` when the branch has other commits, and `423 SECRETS_LOCKED` when the token is still in a locked secret store. See [GitHub backup](../guides/github-backup.md).

## Users and sign-in

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/auth/setup/required` | **Public.** `{"requires_setup"}`: true until the first user exists |
| `POST` | `/api/auth/setup/first-user` | **Public.** Create the admin, only while no users exist |
| `POST` | `/api/auth/setup/invite-user` | **Public.** Create a user from an invite: `{token, username, credential_id}` |
| `POST` | `/api/auth/login/passkey` | **Public.** Exchange a verified passkey credential for a session: `{token, user}` |
| `POST` | `/api/auth/logout` | **Public.** Stateless; the client drops its token |
| `GET` | `/api/auth/me` | The signed-in user |
| `POST` | `/api/auth/invite` | Admin. Create an invite: `{token, invite_url}`, valid once for 7 days |
| `GET` | `/api/auth/users` | Admin. List users |
| `POST` | `/api/auth/users` | Admin. Create a user |
| `DELETE` | `/api/auth/users/{username}` | Admin. Delete a user (not the admin) |

## Passkeys

The WebAuthn ceremonies need a browser, so these are mainly for the web app.

| Method | Endpoint | Does |
|---|---|---|
| `POST` | `/api/passkeys/register/begin`, `/register/finish` | **Public.** Register a passkey |
| `POST` | `/api/passkeys/authenticate/begin`, `/authenticate/finish` | **Public.** Sign in with a passkey |
| `GET` | `/api/passkeys` | Your passkeys |
| `GET` | `/api/passkeys/status` | Whether passkeys are set up |
| `POST` | `/api/passkeys/unlock` | Unlock the secret store with a passkey |
| `DELETE` | `/api/passkeys/{id}` | Delete a passkey |

## Personal access tokens

Need a signed-in session: a token can't create or revoke tokens. These answer `409` when authentication is off.

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/api/tokens` | Your tokens, newest first: `{tokens, total}`. Never the raw token or its hash |
| `POST` | `/api/tokens` | Create one: `{"name", "scope": "read" \| "read-write", "expires_in_days": 0-365}` (`0` = never). Answers `201 {"token": "sch_…", "info"}`; the token is shown this once. At most 25 per user |
| `DELETE` | `/api/tokens/{id}` | Revoke one (`204`; `404` for an unknown id or someone else's token) |

A token stops working (`401`) when it expires, is revoked, or its user is deleted. Only a SHA-256 hash is stored.

## MCP

`POST /api/mcp` serves the [Model Context Protocol](mcp-tools.md) when `SCHIST_MCP_ENABLED=true`; otherwise the path is `404`.
