# Development setup

Run Schist from source: the Go API and the SvelteKit dev server side by side, with hot reload for the frontend.

## Requirements

| Tool | Version |
|---|---|
| Go | The version in `backend/go.mod`. With `GOTOOLCHAIN=auto` (the default), Go fetches it for you. |
| Node.js | 24, with npm |
| make, git | Any recent version |
| Docker | Only for the end-to-end tests and the image |

## Run it

```bash
git clone https://github.com/MorrisMorrison/schist.git
cd schist
make install
```

Then, in two terminals:

```bash
ENV=development make run-backend
```

```bash
make run-frontend
```

| Address | What |
|---|---|
| http://localhost:5173 | The app, from the Vite dev server with hot reload |
| http://localhost:8080/api | The API |

In development the backend generates a JWT secret at each start (so you sign in again after a restart), allows CORS from `SCHIST_FRONTEND_URL` (default `http://localhost:5173`) and logs in debug mode. The wiki lives in `backend/cmd/schist/data` unless you set `SCHIST_DATA_DIR`.

To skip passkeys while you work on something else:

```bash
SCHIST_AUTH_ENABLED=false ENV=development make run-backend
```

## Common commands

Run from the repository root.

| Task | Command |
|---|---|
| Install dependencies | `make install` (e2e: `make install-e2e`) |
| Build everything | `make build` |
| Run all unit tests | `make test` |
| Format | `make fmt` |
| Lint | `make lint` |
| Format, lint and type-check | `make verify` |
| Secret scan | `make secret-scan` |
| Remove build and test output | `make cleanup` |

[Testing](testing.md) covers the test suites, and [Architecture](architecture.md) the code layout.

## A production build locally

```bash
make build
cd backend/cmd/schist && ENV=production SCHIST_JWT_SECRET="$(openssl rand -base64 48)" \
  SCHIST_FRONTEND_URL=http://localhost:8080 SCHIST_STATIC_DIR=../../../frontend/build ./schist
```

Without `ENV=production` the binary doesn't serve the web app; in development that's the Vite server's job.

## Build the image

```bash
make run-docker
```

This builds the image from the `Dockerfile` and starts the `prod` profile of `docker-compose.yml` on http://localhost:8080.

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 8080 or 5173 in use | `SCHIST_PORT=8081 make run-backend` and `PUBLIC_API_URL=http://localhost:8081/api make run-frontend`. |
| The app can't reach the API | Check `curl http://localhost:8080/api/health`, and that the backend runs with `ENV=development`. |
| Passkey registration fails | Open the app on `localhost`, not `127.0.0.1`: passkeys are bound to the host name in `SCHIST_FRONTEND_URL`. |
| Signed out after every backend restart | Expected in development. Set `SCHIST_JWT_SECRET` to keep sessions. |
