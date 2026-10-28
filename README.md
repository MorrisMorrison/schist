# Schist 🪨

[![E2E Tests](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml/badge.svg)](https://github.com/MorrisMorrison/schist/actions/workflows/e2e.yml)
[![codecov](https://codecov.io/gh/MorrisMorrison/schist/graph/badge.svg)](https://codecov.io/gh/MorrisMorrison/schist)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lightweight, self-hosted markdown wiki with Obsidian-style features in the browser. Your notes stay plain markdown files on disk, versioned with git. There's no database.

<!-- Screenshots are generated from a demo wiki by the "README Screenshots" workflow
     (e2e/readme-screenshots/) on every frontend change to main and published to the
     `screenshots` branch. Regenerate them locally with `make screenshots`. -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/document-dark.png">
    <img width="900" alt="A wiki page with the folder tree on the left and rendered markdown: headings, a table, wiki links and code" src="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/document-light.png">
  </picture>
</p>

<table>
  <tr>
    <td align="center" width="33%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/editor-dark.png">
        <img alt="A page in edit mode: the markdown in the same column and typography as the reading view" src="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/editor-light.png">
      </picture>
      <br /><sub>Editing in place</sub>
    </td>
    <td align="center" width="33%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/quick-switcher-dark.png">
        <img alt="Quick switcher searching pages by title" src="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/quick-switcher-light.png">
      </picture>
      <br /><sub>Quick switcher (<kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd>)</sub>
    </td>
    <td align="center" width="33%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/version-history-dark.png">
        <img alt="Version history of a page with restore buttons" src="https://raw.githubusercontent.com/MorrisMorrison/schist/screenshots/version-history-light.png">
      </picture>
      <br /><sub>Version history and restore</sub>
    </td>
  </tr>
</table>

## Features

- **Plain markdown on disk:** one `.md` file per page with YAML front matter, organised in folders. No database: easy to back up, easy to leave.
- **Linked notes:** `[[wiki links]]` with backlinks, tags, full-text search and a quick switcher.
- **Editor:** one page that switches between reading and editing in place (<kbd>Ctrl/Cmd</kbd> + <kbd>E</kbd>), with the markdown shown in the reading column and typography, a formatting toolbar, a focus mode, image uploads and page templates.
- **History:** every save is a git commit. Browse a page's versions and restore any of them, with optional backup to a GitHub repository.
- **Sharing:** public read-only links that expire.
- **Accounts:** passwordless login with passkeys (WebAuthn), invite links for new users, and an admin role for user management.
- **Secrets:** reference values like API keys from your pages. They show as locked placeholders until you unlock them with your passkey.
- **AI assistants (MCP):** an optional [Model Context Protocol](https://modelcontextprotocol.io) endpoint lets Claude and other assistants search, read and write your wiki, using personal access tokens.
- **Import and export** of markdown files.
- **Dark and light themes**, keyboard shortcuts and a mobile layout.
- **Secure defaults:** authentication, rate limiting and security headers (CSP, HSTS, …) are on unless you turn them off.

## Quick start (Docker)

```bash
docker run -d --name schist \
  -p 8080:8080 \
  -v "$(pwd)/data:/app/data" \
  -e ENV=production \
  -e SCHIST_JWT_SECRET="$(openssl rand -base64 48)" \
  -e SCHIST_FRONTEND_URL=http://localhost:8080 \
  ghcr.io/morrismorrison/schist:latest
```

Open http://localhost:8080. On first start, Schist walks you through creating the admin account and registering a passkey (Face ID, Touch ID, Windows Hello, a security key, …).

> [!IMPORTANT]
> - **`SCHIST_JWT_SECRET`** is required in production: at least 32 random characters. Keep it stable, or everyone is logged out on every restart.
> - **`SCHIST_FRONTEND_URL`** must be the exact URL you open Schist at, with scheme, host and port (e.g. `https://wiki.example.com`). Passkeys, share links and invite links are built from it. Passkeys only work on `localhost` or over HTTPS.

**Image tags.** `:latest` follows `main` (every merged change). To stay on a release instead, pin its version, e.g. `ghcr.io/morrismorrison/schist:0.0.1`. See the [releases page](https://github.com/MorrisMorrison/schist/releases). Schist is pre-1.0: releases are snapshots on the way to a stable 1.0, not long-term-supported versions.

### Docker Compose

```yaml
services:
  schist:
    image: ghcr.io/morrismorrison/schist:latest
    container_name: schist
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - ENV=production
      - SCHIST_JWT_SECRET=${SCHIST_JWT_SECRET:?set a random secret of at least 32 characters}
      - SCHIST_FRONTEND_URL=https://wiki.example.com
```

Put the secret in a `.env` file next to `docker-compose.yml` (`SCHIST_JWT_SECRET=...`, generated once with `openssl rand -base64 48`), then:

```bash
docker compose up -d
```

If Schist is reachable from outside your machine, put a reverse proxy with TLS (Caddy, Traefik, nginx, …) in front of it.

## Configuration

Everything is configured with environment variables. The common ones:

| Variable | Default | What it does |
|---|---|---|
| `ENV` | `development` | Set it to `production` to serve the web app from the binary and require a real JWT secret |
| `SCHIST_JWT_SECRET` | – | Token signing secret (required in production, ≥ 32 characters) |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | Public URL of the app (passkeys, share and invite links) |
| `SCHIST_DATA_DIR` | `data` | Where pages, assets and the git history live (`/app/data` in the image) |
| `SCHIST_PORT` | `8080` | HTTP port |
| `SCHIST_AUTH_ENABLED` | `true` | Passkey login. Turn it off only for a single-user wiki that sits behind other authentication |
| `SCHIST_RATE_LIMIT_ENABLED` / `SCHIST_RATE_LIMIT_RPM` | `true` / `100` | Per-IP rate limit |
| `SCHIST_SHARING_ENABLED` | `true` | Public share links (`SCHIST_SHARE_DEFAULT_EXPIRY_DAYS` 7, `SCHIST_SHARE_MAX_EXPIRY_DAYS` 90) |
| `SCHIST_MCP_ENABLED` | `false` | The MCP endpoint for AI assistants at `/api/mcp` (see below) |

GitHub backup is set up in the app under **Settings → GitHub**. [docs/CONFIGURATION.md](docs/CONFIGURATION.md) has the full list, including the security headers and CSP.

## AI assistants (MCP)

Start Schist with `SCHIST_MCP_ENABLED=true`, then create a token under **Settings → AI Assistants & API Tokens** and connect your assistant. Settings shows the exact commands for your instance. For Claude Code:

```bash
claude mcp add --transport http schist https://wiki.example.com/api/mcp --header "Authorization: Bearer sch_..."
```

Other clients that support remote MCP servers take the same URL and `Authorization` header in their JSON config.

| Tool | Does |
|---|---|
| `search` | Full-text search with snippets and `tag:` filters |
| `read_document` | A page's markdown, title, tags and dates |
| `list_folder` | A folder's subfolders and pages |
| `get_backlinks` | The pages linking to a page |
| `list_tags` | Every tag with its count |
| `create_document` | Create a page |
| `update_document` | Replace a page's content, title or tags |
| `append_to_document` | Add text at the end of a page or of a section |

**Tokens:**
- **Access level:** a *read-only* token only gets the first five tools; a *read and write* token gets all eight.
- **Git history:** every write is a git commit, so you can restore earlier versions.
- **What tokens can't reach:** there is no delete tool, and tokens can't use secrets, passkeys, users, shares or settings.
- **Without authentication** (`SCHIST_AUTH_ENABLED=false`), the endpoint needs no token.

## Your data

`SCHIST_DATA_DIR` is an ordinary folder of markdown files plus a git repository. Back it up like any other folder, open it in another editor, or read its history with `git log`. Deleted pages go to a `trash` folder first.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd> | Quick switcher |
| <kbd>Ctrl/Cmd</kbd> + <kbd>H</kbd> | Home |
| <kbd>Ctrl/Cmd</kbd> + <kbd>,</kbd> | Settings |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd> | New page |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Alt</kbd> + <kbd>F</kbd> | New folder |
| <kbd>Ctrl/Cmd</kbd> + <kbd>E</kbd> | Switch the current page between reading and editing |
| <kbd>Ctrl/Cmd</kbd> + <kbd>S</kbd> | Save (in the editor) |
| <kbd>F11</kbd> | Focus mode (in the editor) |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> | Delete the current page |
| <kbd>Ctrl/Cmd</kbd> + <kbd>J</kbd> | Download the current page |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd> | Toggle dark/light theme |
| <kbd>Ctrl/Cmd</kbd> + <kbd>B</kbd> | Toggle the sidebar |
| <kbd>Esc</kbd> | Close the quick switcher or a dialog |

## Development

The Go (Gin) backend is in `backend/`, the SvelteKit + Svelte 5 single-page app in `frontend/`, and the Playwright end-to-end tests in `e2e/`.

```bash
make install                         # frontend deps + Go modules
ENV=development make run-backend     # API on :8080
make run-frontend                    # app on :5173
make test                            # backend + frontend tests
make screenshots                     # regenerate the README screenshots into docs/screenshots/
```

See the [development guide](docs/DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md). More docs: [quick start](docs/QUICK_START.md) · [API](docs/API.md) · [configuration](docs/CONFIGURATION.md) · [design](docs/DESIGN_DOC.md) · [CI](docs/CI.md). Every API area also has a ready-to-run request file in [`http/`](http/).

## License

[MIT](LICENSE)
