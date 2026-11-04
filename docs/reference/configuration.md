# Configuration

Every setting is an environment variable with a safe default. This page lists them all.

Booleans take `true`/`false` (also `1`/`0`, `yes`/`no`, `on`/`off`). A value that can't be parsed falls back to the default.

## Essentials

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | `production` serves the web app from the binary, runs Gin in release mode, turns CORS off and requires `SCHIST_JWT_SECRET`. The Docker examples set it. |
| `SCHIST_JWT_SECRET` | – | Signs session tokens. Required in production, at least 32 characters (`openssl rand -base64 48`). In development a random one is generated at each start. Changing it signs everyone out and, unless `SCHIST_SECRET_KEY` is set, invalidates the saved GitHub token. |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | The exact public URL of the app, with scheme, host and port. Used as the passkey origin, in share and invite links, and for CORS in development. |
| `SCHIST_DATA_DIR` | `data` | The wiki's data folder: pages, assets, git history and `.schist/`. `/app/data` in the image. |
| `SCHIST_PORT` | `8080` | HTTP port. |

## Authentication

| Variable | Default | Description |
|---|---|---|
| `SCHIST_AUTH_ENABLED` | `true` | Passkey sign-in. `false` makes every endpoint open; see [running without authentication](../guides/users-and-passkeys.md#running-without-authentication). |
| `SCHIST_JWT_EXPIRY_HOURS` | `24` | How long a sign-in lasts. |
| `SCHIST_SECRET_KEY` | – | Key material for encrypting the GitHub backup token. When empty, the JWT secret is used. Set it before you set up GitHub backup if you want to be able to rotate the JWT secret later; adding or changing it afterwards means entering the GitHub token again. See [how the token is stored](../guides/github-backup.md#how-the-token-is-stored). |

## Features

| Variable | Default | Description |
|---|---|---|
| `SCHIST_MCP_ENABLED` | `false` | The MCP endpoint at `/api/mcp`. See [AI assistants](../guides/ai-assistants.md). |
| `SCHIST_SHARING_ENABLED` | `true` | Public share links. `false` refuses new ones (403) and makes existing ones stop resolving (404); owners can still list and revoke them. |
| `SCHIST_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | Expiry of a share created without one. |
| `SCHIST_SHARE_MAX_EXPIRY_DAYS` | `90` | The longest expiry a share can have. |
| `SCHIST_GITHUB_AUTO_SYNC_MINUTES` | `15`; `5` in two-way mode when unset | Interval of the "Back up every N minutes" GitHub backup and of two-way sync, in whole minutes from 1 to 1440. |
| `SCHIST_TEMPLATES_DIR` | `./templates` in the image | Folder with the page templates offered by **New page**. |

## Rate limiting

| Variable | Default | Description |
|---|---|---|
| `SCHIST_RATE_LIMIT_ENABLED` | `true` | Per-IP rate limit on `/api/*`. `/api/health` and the web app's static files are never limited. |
| `SCHIST_RATE_LIMIT_RPM` | `100` | Requests per minute per IP. Raise it for heavy API or MCP use (e.g. `300`). |

Behind a reverse proxy, the limit should apply to each visitor, not to the proxy. See [Reverse proxy](../self-hosting/reverse-proxy.md).

## Security headers

Schist sends these headers on every response. The defaults suit a wiki served on its own domain.

| Variable | Default |
|---|---|
| `SCHIST_CSP_ENABLED` | `true` |
| `SCHIST_CSP_DEFAULT_SRC` | `'self'` |
| `SCHIST_CSP_SCRIPT_SRC` | `'self' 'unsafe-inline'` |
| `SCHIST_CSP_STYLE_SRC` | `'self' 'unsafe-inline'` |
| `SCHIST_CSP_IMG_SRC` | `'self' data: https:` |
| `SCHIST_CSP_FONT_SRC` | `'self' data:` |
| `SCHIST_CSP_CONNECT_SRC` | `'self'` |
| `SCHIST_CSP_FRAME_SRC` | `'none'` |
| `SCHIST_CSP_FORM_ACTION` | `'self'` |
| `SCHIST_HSTS_ENABLED` | `true` |
| `SCHIST_HSTS_MAX_AGE` | `31536000` (1 year) |
| `SCHIST_HSTS_INCLUDE_SUBDOMAINS` | `true` |
| `SCHIST_HSTS_PRELOAD` | `false` |
| `SCHIST_X_FRAME_OPTIONS` | `DENY` |
| `SCHIST_X_CONTENT_TYPE_OPTIONS` | `true` (`nosniff`) |
| `SCHIST_X_XSS_PROTECTION` | `true` |
| `SCHIST_REFERRER_POLICY` | `strict-origin-when-cross-origin` |
| `SCHIST_PERMISSIONS_POLICY` | `geolocation=(), microphone=(), camera=()` |

Pages may show images from any `https:` address. Set `SCHIST_CSP_IMG_SRC` to `'self' data:` to allow only uploaded images.

## Caching

Hashed web-app files under `/_app/immutable/` are cached for a year. The app shell (`index.html`) is always revalidated, so a new version is picked up on the next load.

## Development only

| Variable | Default | Description |
|---|---|---|
| `SCHIST_STATIC_DIR` | `./web` | Folder with the built web app, served in production mode. |
| `PUBLIC_API_URL` | `http://localhost:8080/api` | Frontend build setting: the API URL the dev server talks to. |

In development (`ENV=development`) the API runs on :8080 and the Vite dev server on :5173, with CORS allowed from `SCHIST_FRONTEND_URL` and debug logging. See [Development setup](../development/setup.md).
