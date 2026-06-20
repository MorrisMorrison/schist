# CI / CD

GitHub Actions workflows live in [`.github/workflows`](../.github/workflows). This
doc covers how they run, how to switch runners, and how minute usage is kept down.

## Workflows

| Workflow | File | Triggers (paths) | Purpose |
|----------|------|------------------|---------|
| Build | `build.yml` | backend, frontend, Dockerfile, docker-compose, Makefile | `make build` (Go + frontend compile) |
| Backend Tests | `test-backend.yml` | `backend/**` | `go test ./...` |
| Frontend Tests | `test-frontend.yml` | `frontend/**` | Vitest unit tests, lint, `svelte-check` |
| E2E Tests | `e2e.yml` | backend, frontend, `e2e/**`, Dockerfile, docker-compose | Playwright suite against the Dockerised app |
| Secret Scan | `secret-scan.yml` | all changes | gitleaks (via `make secret-scan`) |
| Docker | `docker.yml` | backend, frontend, Dockerfile, docker-compose | Build + smoke-test the image; on push to `main`, publish that tested image to `ghcr.io/<repo>:latest` (VPS auto-pulls) |

All jobs run on `${{ vars.RUNS_ON || 'ubuntu-latest' }}` (see below).

## Switching runners (GitHub-hosted ↔ self-hosted)

The runner is controlled by a single **repository variable** `RUNS_ON`
(Settings → Secrets and variables → Actions → Variables).

| Goal | `RUNS_ON` value |
|------|-----------------|
| GitHub-hosted (default) | leave the variable **unset** (falls back to `ubuntu-latest`) — or set it to `ubuntu-latest` exactly |
| Self-hosted | set to your runner's label, e.g. `self-hosted` |

> The hosted label is `ubuntu-latest` (hyphen, not underscore). An invalid value
> leaves jobs queued forever because no runner matches it.

No code changes or commits are needed to switch — update the variable and the next
run picks it up.

### ⚠️ Security
Only point `RUNS_ON` at a self-hosted runner while the repository is **private**.
On a public repo, a pull request from a fork can execute arbitrary code on a
self-hosted runner. If you make the repo public, remove `RUNS_ON` and stay on
GitHub-hosted (public repos get unlimited free Actions minutes).

### Self-hosted runner prerequisites
Add the runner under Settings → Actions → Runners → "New self-hosted runner".
The host must have, for all jobs to pass:

- **Docker** (daemon running) — used by the e2e, build, and docker jobs
- **Node.js 22** and **npm**
- **Go 1.23**
- **make**, `curl`, `openssl`, `git`

## Minute usage controls

The repo is private, so GitHub-hosted runs draw from the monthly free minute
allowance. Three mechanisms keep usage down:

1. **Concurrency** — each workflow uses
   `group: ${{ github.workflow }}-${{ github.ref }}` with
   `cancel-in-progress: true`. Pushing new commits to a PR cancels its previous
   run, and merging several PRs to `main` in quick succession cancels the
   superseded runs so only the latest commit builds.
2. **Path filters** — backend-only changes don't run frontend tests (and vice
   versa); docs-only changes don't trigger build/test/e2e; the `docker` workflow
   only rebuilds the image when image inputs change.
3. **Gated heavy jobs** — the expensive e2e and Docker jobs are scoped to the
   paths that actually affect them.

> Because heavy workflows are path-filtered, a docs-only PR won't run them. If any
> of these are later made *required* status checks, account for the "skipped
> required check" case (e.g. a lightweight always-runs guard job).

## Alternatives if minutes run out

- **Make the repo public** → unlimited free GitHub-hosted minutes.
- **Self-hosted runner** (above) → free compute on your own hardware.
- **Self-hosted CI** (Gitea/Forgejo Actions are largely compatible with these
  YAMLs; Woodpecker CI is another lightweight option).
- **Raise the spending limit** for metered minutes.
