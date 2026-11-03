# Configuration

Schist is designed with minimal configuration using environment variables and sensible defaults. 

## Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHIST_PORT` | `8080` | Server port number |
| `SCHIST_DATA_DIR` | `data` | Directory for storing wiki documents and assets |
| `SCHIST_STATIC_DIR` | `./web` | Directory for serving static frontend files (production) |
| `SCHIST_FRONTEND_URL` | `http://localhost:5173` | Public URL of the app. Used for CORS in development, the passkey (WebAuthn) origin, and share and invite links. Must match the URL users open |
| `ENV` | `development` | Environment mode (development/production) |
| `SCHIST_RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `SCHIST_RATE_LIMIT_RPM` | `100` | Rate limit: requests per minute per IP |
| `SCHIST_AUTH_ENABLED` | `true` | Enable/disable JWT authentication |
| `SCHIST_JWT_SECRET` | `""` | JWT signing secret (required when auth is enabled) |
| `SCHIST_JWT_EXPIRY_HOURS` | `24` | JWT token expiry time in hours |
| `SCHIST_SECRET_KEY` | `""` | Secret for the key that encrypts the GitHub backup token, so backups keep running after a restart. When empty, the key comes from `SCHIST_JWT_SECRET`. Changing it (or the JWT secret it falls back to) means setting up GitHub backup again. See [GitHub backup](#github-backup) |
| `SCHIST_TEMPLATES_DIR` | `../../../templates` | Directory with document templates |
| `SCHIST_SHARING_ENABLED` | `true` | Enable/disable public share links. When `false`, new shares are refused (403) and existing share links stop resolving (404); owners can still list and revoke them |
| `SCHIST_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | Expiry used when a share is created without `expiry_days` (or with `0`) |
| `SCHIST_SHARE_MAX_EXPIRY_DAYS` | `90` | Upper bound for a share's `expiry_days` |
| `SCHIST_GITHUB_AUTO_SYNC_MINUTES` | `15` | How often GitHub backup pushes when its backup mode is **Automatic** (whole minutes, 1 to 1440). See [GitHub backup](#github-backup) |
| `SCHIST_MCP_ENABLED` | `false` | Serve the Model Context Protocol endpoint at `/api/mcp`. With auth on, clients authenticate with a personal access token (Settings → AI Assistants & API Tokens). Behind a reverse proxy this works as is: the bearer token, not the `Host` header, protects the endpoint. Without auth, the SDK's DNS-rebinding protection stays on, so local clients must use `localhost` |

### Frontend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_API_URL` | `http://localhost:8080/api` | Backend API URL for client-side calls |

## GitHub backup

GitHub backup is set up in the app under **Settings → GitHub** with a personal access token that can read and write the repository's contents.

**How the token is stored:** encrypted (AES-256-GCM) in `.schist/config.json` with a key derived from `SCHIST_SECRET_KEY`, or from `SCHIST_JWT_SECRET` when that's empty. The server can read it on its own, so backups keep running after a restart without anyone unlocking secrets. The token is then as safe as the server's environment: anyone who can read both the environment and the data directory can read it. Use a fine-grained token limited to the backup repository.
- **Without a server secret** (a development server whose JWT secret is generated at each start), the token is kept in the passkey-protected secret store instead: setup needs unlocked secrets, and so does every sync after a restart.
- **Tokens saved by older versions** are in the secret store. The first sync with secrets unlocked moves them to the server key; after that no unlock is needed.
- **If the key changes,** the saved token can't be read any more, and syncs fail with "set up GitHub backup again".

- **New repositories:** the repository can be empty, and the branch doesn't have to exist. The first sync creates it.
- **Push only:** a sync commits pending changes and pushes the wiki's git history to the branch. It never pulls.
- **When the branch has other commits** (for example a README created with the repository, or another device), a normal sync refuses with `SYNC_REMOTE_DIVERGED` and leaves GitHub as it is. Settings then offers **Replace GitHub branch**, which force-pushes the wiki's history once, after you confirm. Alternatively use an empty repository or a new branch.
- **Sync on save:** each committed change (an edit, an API or MCP write, an import, a move, a delete) schedules a push 30 seconds after the last change, and at most 5 minutes after the first unpushed one, so a burst of writes makes one push. The push runs in the background and never blocks or fails the write.
- **Automatic:** a push every `SCHIST_GITHUB_AUTO_SYNC_MINUTES` minutes.
- **Status:** Settings shows the last successful sync and the last error, background syncs included (for example "Secret store is locked" after a restart on a server without a server secret).

## Development vs Production

### Development Mode (`ENV=development`)

**Features:**
- **CORS enabled** - Allows frontend dev server to access API
- **Debug logging** - Detailed output with file:line information
- **Gin debug mode** - Verbose HTTP request logging
- **Separate servers** - Backend (8080) and frontend (5173)
- **Hot reload** - Frontend changes update immediately

**Setup:**
```bash
# Terminal 1: Start backend
make run-backend

# Terminal 2: Start frontend dev server
make run-frontend

# Access: http://localhost:5173
```

### Production Mode (`ENV != development`)

**Features:**
- **Single server** - Backend serves both API and static files
- **Gin release mode** - Optimized performance and minimal logging
- **No CORS** - Same-origin policy only
- **Static file serving** - Serves built frontend from SCHIST_STATIC_DIR
- **SPA routing** - Fallback to index.html for client-side routes

**Setup:**
```bash
# Using Docker (recommended)
make run-docker

# OR manual build
cd frontend && npm run build
cd ../backend && go build -o schist ./cmd/schist
./schist

# Access: http://localhost:8080
```

## Security Configuration

### Rate Limiting

**Configuration:**
```bash
# Enable rate limiting
SCHIST_RATE_LIMIT_ENABLED=true

# Set requests per minute per IP (default: 100)
SCHIST_RATE_LIMIT_RPM=60
```

The limit applies to API requests (`/api/*`) only. The web app's static files and `/api/health` are never limited: a single page load fetches dozens of JS, CSS and font files. Those files carry content hashes, so browsers cache them for a year, while the app shell (`index.html`) is always revalidated so a new deploy is picked up.

### JWT Authentication

**Configuration:**
```bash
# Enable JWT authentication for all endpoints
SCHIST_AUTH_ENABLED=true

# JWT secret key (REQUIRED when auth is enabled)
SCHIST_JWT_SECRET="your-secret-key-here"

# JWT token expiry time in hours (default: 24)
SCHIST_JWT_EXPIRY_HOURS=24
```

**Security Requirements:**
- `SCHIST_JWT_SECRET` must be set when authentication is enabled
- Use a strong, randomly generated secret (minimum 32 characters)
- Keep the JWT secret secure and never commit it to version control

## Logging Configuration

### Development Logging
```
[GIN-debug] Listening and serving HTTP on :8080
[CORS] Origin: http://localhost:5173 allowed
main.go:45: Server starting in development mode
```

### Production Logging
```
2024-01-15T10:30:00Z Server starting on port 8080
```

## Advanced Configuration

### Custom Data Directory Structure

You can organize your data directory with any structure:

```bash
# Example: Separate environments
SCHIST_DATA_DIR=/var/lib/schist/production make run-backend
SCHIST_DATA_DIR=/var/lib/schist/staging make run-backend
```

