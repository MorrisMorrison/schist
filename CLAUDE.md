# CLAUDE.md

Guidance for AI agents (and humans) working on this repo. Keep it short and current: when behaviour, commands, config or layout change, update this file and the README / `docs/` in the same PR.

## What this is
Schist is a self-hosted markdown wiki. A Go (Gin) API stores documents as plain markdown files with YAML front matter (no database), versions them with git (go-git), and can back up to a GitHub repo. A SvelteKit single-page app (built with `adapter-static`) is served by the same binary. Auth is optional (passkeys/WebAuthn + JWT, off by default); there are public share links, passkey-protected secrets, wiki links and full-text search.

## Layout
| Path | Responsibility |
|---|---|
| `backend/cmd/schist/main.go` | Entry point: loads config, wires services, starts Gin |
| `backend/internal/config` | `SCHIST_*` env config (`config.go`) and persisted settings (`settings.go`) |
| `backend/internal/handlers` | HTTP layer. Routes are registered in `api_handler.go`; one file per area (`documents_handler.go`, `folders_handler.go`, …); `errors.go` has `HandleError` |
| `backend/internal/services` | Business logic and file/git I/O. `container.go` builds every service |
| `backend/internal/errors` | Typed `APIError` taxonomy (`NewNotFoundError`, `NewValidationError`, …) |
| `backend/internal/middleware` | Auth, admin, rate limiting, security headers/CSP |
| `backend/internal/{crypto,serializer,models,utils}` | JWT + secret store, markdown/front matter, data types, path helpers |
| `frontend/src/routes` | SvelteKit pages: `(app)` (the wiki), `login`, `setup`, `share` |
| `frontend/src/lib/api/client.ts` | The only place that calls the backend |
| `frontend/src/lib/stores/*.svelte.ts` | Rune-based stores (documents, auth, settings, …) |
| `frontend/src/lib/components/ui` | shadcn-style component library (bits-ui + tailwind-variants) |
| `e2e/` | Playwright suite (`tests/`, page objects in `pages/`, `fixtures/`) |
| `http/` | `.http` request files for every API area (REST Client / JetBrains) |
| `docs/` | API, configuration, CI, design and development docs |

## Commands
Run from the repo root unless noted. Needs Go 1.25+ (`backend/go.mod`; `GOTOOLCHAIN=auto` fetches it), Node 24 (what CI uses), and Docker for the e2e suite.

| Task | Command |
|---|---|
| Install deps | `make install` (frontend `npm i` + `go mod download`); e2e: `make install-e2e` |
| Build | `make build` (frontend then backend) |
| Backend tests | `make test-backend` (= `cd backend && go test ./...`) |
| Frontend unit tests | `make test-frontend` (Vitest **browser mode**, needs Playwright Chromium: `npx playwright install chromium` in `frontend/`) |
| Type check | `make check` (`svelte-check`) |
| Format / lint | `make fmt`, `make lint` (golangci-lint, prettier + eslint for frontend and e2e) |
| Everything before a PR | `make verify` then `make test` |
| Run locally | `ENV=development make run-backend` (:8080) + `make run-frontend` (:5173) |
| e2e | `docker compose --profile e2e up -d --build`, then `make e2e`, `make e2e-test TEST=<file>` or `make e2e-grep GREP="<title>"` |
| Coverage | `cd backend && go test -cover ./...`; `cd frontend && npm run test:unit -- --coverage`. CI uploads both to Codecov (informational only, see `docs/CI.md`) |
| Secret scan | `make secret-scan` (gitleaks) |
| README screenshots | `make screenshots` (builds the frontend, runs the backend against a demo wiki, writes `docs/screenshots/`; capture in `e2e/readme-screenshots/`) |
| Clean artifacts | `make cleanup` (scoped `git clean` of build/test output only) |

## Tests and how they isolate things
- **Backend:** standard `go test`, table-driven where it helps. File and git services run against `t.TempDir()`; nothing touches a real data dir or the network. GitHub tests cover settings and sync state with no client configured; there's no fake GitHub remote, so keep push/pull logic thin and test what you can locally. Add tests next to the code (`*_test.go`).
- **Path tests use `/`.** A few tests (path building, chmod/read-only dirs, `git init`) assume Linux and fail on Windows. CI runs Linux; on Windows, check you didn't *add* failures.
- **Frontend:** Vitest runs in real headless Chromium (`vitest.config.ts`, `fileParallelism: false`). Setup in `src/lib/test/setup.ts`; component tests use `@testing-library/svelte`.
- **e2e:** one worker, a shared backend and a shared auth state per run (CI splits the suite into 2 shards, each with its own backend, so a test must not depend on another test having run) (`auth.setup.ts` does a virtual-authenticator passkey ceremony). Tests must wait on the app's load signals (`BasePage.waitForContentReady` and friends), never on fixed timeouts. Seed data through the API fixtures, and keep each test's documents unique so tests don't collide.
- **Playwright version lockstep:** the frontend `playwright` dep, e2e `@playwright/test` and the `mcr.microsoft.com/playwright:v<ver>-noble` image in CI must stay on the same version, or the baked browsers don't match.

## Conventions
- **Errors:** services return typed errors from `internal/errors`; handlers just call `HandleError(c, err)`, which finds them with `errors.As` (so `%w` wrapping is fine) and writes the `{error, code, details}` envelope. Plain `fmt.Errorf` means an internal 500: the cause is logged, not returned. Never map status codes by matching error text, and never send `err.Error()` to the client.
- **Paths:** every user-supplied path goes through the `utils` path helpers (no `..`, stays inside the data dir).
- **JSON stores** (users, shares, passkeys) use the generic `jsonStore[T]` in `services/json_store.go`: every read-modify-write runs under its mutex (`update`) and every write is atomic (temp file + rename). Use it for any new store.
- **Config:** new settings are `SCHIST_*` env vars in `internal/config`, documented in `docs/CONFIGURATION.md` with a safe default.
- **Frontend:** Svelte 5 runes, TypeScript everywhere. Backend calls only through `lib/api/client.ts`; shared state in `lib/stores`. Handle API errors by HTTP status / `code`, not message strings.
- **Component library:** `lib/components/ui/*`, its variants and the design tokens in `app.css` are a complete library. Don't delete parts because they're currently unused. Unused *app* code is fair to remove.
- **Use the library, don't hand-roll UI:** build buttons, inputs, labels, checkboxes, badges, dialogs, dropdown menus and alerts from `lib/components/ui` (render custom triggers through `Button` / `buttonVariants`), not raw elements with copied Tailwind classes or custom modal shells. If a variant is missing, add it to the library. Icons inside `Button` take `size-*` classes (the button forces other svgs to `size-4`).
- **Page width:** every page sits in `PageContainer` (`ui/page-container`): `width="reading"` (default, 56rem column; documents, editor, new page, share, settings) or `width="wide"` (browse pages with card grids). Document pages take their width from `documentPageWidth()` (settings store), which returns `full` when "Full-width documents" is on. No per-page `max-w-*` on the outer container or on the text inside it; use `pageContainerVariants` where the element is not a plain div.
- **Formatting:** `gofmt`; prettier (with the svelte + tailwind plugins) for frontend and e2e.

## Workflow
- Branch off `main`, open a PR (template in `.github/pull_request_template.md`), squash-merge after review.
- Conventional-commit titles with a scope: `feat(frontend): …`, `fix(services): …`, `refactor(errors): …`, `test(e2e): …`, `ci: …`, `chore(deps): …`.
- CI (`docs/CI.md`): Build, Backend Tests, Frontend Tests, E2E, Secret Scan, Docker (build + smoke test on PRs, publish on `main`). README Screenshots (on frontend changes; on `main` it force-pushes the PNGs to the `screenshots` branch the README links to, so keep that branch unprotected). Runner jobs use `${{ vars.RUNS_ON || 'ubuntu-latest' }}`. A red e2e: check which tests failed and why before treating it as a real regression (see the `triage-e2e` skill).
- Dependabot opens grouped weekly PRs per ecosystem; held-back majors are listed in `.github/dependabot.yml`.

## Project skills
- `.claude/skills/add-api-endpoint` — a new endpoint end to end (service, typed errors, handler, route, client, `.http`, tests, docs).
- `.claude/skills/triage-e2e` — read a failing e2e run, tell flake from regression, reproduce one test.
