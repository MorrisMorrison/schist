# Architecture

How Schist is put together: one Go binary that serves a JSON API and a single-page app, and stores everything as files in one folder.

## Principles

- **Files, not a database.** A page is a markdown file with YAML front matter. The data folder is the source of truth, and any editor can read it.
- **Git for history.** Every write is a commit (go-git, no `git` binary needed). Backup to GitHub is a push of that history.
- **Never lose a note.** Writes are atomic (a temporary file, then a rename), every user-supplied path is checked against traversal, and deletes go to a trash folder.
- **Secure by default.** Authentication, rate limiting and security headers are on unless turned off.

## Overview

```text
 Web app (SPA) ──/api────┐
 AI assistant ──/api/mcp─┤
                         ▼
 ┌──────────── schist binary ────────────┐
 │ Gin router → middleware → handlers    │
 │                  → services           │
 └───────────────┬───────────────────────┘
                 ▼
   data folder: markdown, assets, .schist/
   git history (go-git) ──push──▶ GitHub (optional)
```

A request passes rate limiting, security headers and authentication, then reaches a handler. Handlers parse and validate the request and call a service. Services hold the logic and do all file and git I/O.

## Backend

Go with [Gin](https://gin-gonic.com), in `backend/`:

| Package | Responsibility |
|---|---|
| `cmd/schist` | Entry point: loads the config, builds the services, starts the server. |
| `internal/config` | `SCHIST_*` environment config and the persisted settings. |
| `internal/handlers` | The HTTP layer. Routes are registered in `api_handler.go`, one file per area. |
| `internal/services` | Business logic: documents, folders, links, search, versions, import, GitHub, users, shares, tokens. `container.go` wires them together. |
| `internal/mcpserver` | The MCP server on the official Go SDK, built on the same services. |
| `internal/middleware` | Authentication, admin checks, rate limiting, security headers and CSP. |
| `internal/errors` | The typed error taxonomy; `HandleError` turns it into the JSON envelope. See [Error codes](../reference/error-codes.md). |
| `internal/crypto` | JWTs, key derivation and the encrypted secret store. |
| `internal/serializer` | Markdown and front matter in and out, including unknown keys (properties). |
| `internal/models`, `internal/utils` | Data types and path helpers. |

Key pieces:

- **Search** is an in-memory index of titles, headings, tags and bodies. Each query checks file modification times, so changes made outside the app show up on the next search.
- **Links** are resolved through a link index built once per operation: title, root slug, alias, then page name.
- **State files** (users, passkeys, shares, tokens) go through one generic JSON store that serialises read-modify-write and writes atomically.
- **Passkeys** use go-webauthn. Sessions are JWTs; personal access tokens are stored as SHA-256 hashes.

## Frontend

SvelteKit with Svelte 5 runes and TypeScript, built as a static single-page app (`adapter-static`) and served by the binary. In `frontend/src`:

| Path | Responsibility |
|---|---|
| `routes/` | Pages: `(app)` (the wiki), `login`, `setup`, `share`. |
| `lib/api/client.ts` | The only place that talks to the backend. |
| `lib/stores/` | Shared state as rune-based stores (documents, auth, settings…). |
| `lib/components/ui/` | The component library (bits-ui and Tailwind variants). |
| `lib/components/` | App components: sidebar, editor, document view, settings sections. |
| `lib/utils/` | Markdown rendering, wiki links, hashtags, sanitising. |

The editor is CodeMirror 6. Markdown is rendered with marked and sanitised before it reaches the page. Mermaid is loaded only on pages with a diagram.

## Data folder

| Path | Holds |
|---|---|
| `<folders>/<page>.md` | Pages |
| `assets/` | Uploaded images |
| `trash/` | Deleted pages and folders |
| `.git/` | The history |
| `.schist/` | App state: users, passkeys, invites, shares, tokens, settings, encrypted secrets. Ignored by git. |
