# CI / CD

GitHub Actions workflows live in [`.github/workflows`](../.github/workflows). This
doc covers what runs, where the image is published, and how to use your own runner.

## Workflows

| Workflow | File | Triggers (paths) | Purpose |
|----------|------|------------------|---------|
| Build | `build.yml` | backend, frontend, Dockerfile, docker-compose, Makefile | `make build` |
| Backend Tests | `test-backend.yml` | `backend/**` | `go test ./...` |
| Frontend Tests | `test-frontend.yml` | `frontend/**` | Vitest unit tests, lint, `svelte-check` (inside the Playwright image) |
| E2E Tests | `e2e.yml` | backend, frontend, `e2e/**`, Dockerfile, docker-compose | Playwright suite against the Dockerised app (always GitHub-hosted) |
| Secret Scan | `secret-scan.yml` | all changes | gitleaks over the full history (via `make secret-scan`) |
| Docker | `docker.yml` | backend, frontend, Dockerfile, docker-compose | Build + smoke-test the image on PRs; on push to `main`, publish the tested image |

## Published image

On every push to `main` that changes the image, `docker.yml` pushes the exact
image that passed the smoke test to the GitHub Container Registry:

- `ghcr.io/morrismorrison/schist:latest`
- `ghcr.io/morrismorrison/schist:main-<short-sha>` (pin this for reproducible deploys)

A manual run (`workflow_dispatch`) can publish an extra tag. The job logs in with
the built-in `GITHUB_TOKEN` (`packages: write`), so no registry secret is needed.

## Runners

All jobs except e2e use `${{ vars.RUNS_ON || 'ubuntu-latest' }}`. With the
repository variable `RUNS_ON` **unset**, everything runs on GitHub-hosted
runners, which are free for public repositories. That's the default and the
recommended setup.

### Using a self-hosted runner (private forks only)

> [!WARNING]
> Never point `RUNS_ON` at a self-hosted runner on a **public** repository. A pull
> request from a fork can run arbitrary code on that machine.

In a private fork you can set `RUNS_ON` (Settings → Secrets and variables →
Actions → Variables) to your runner's label. The hosted label is `ubuntu-latest`
(hyphen, not underscore); an invalid value leaves jobs queued forever.

The workflows already work on a Docker-out-of-Docker runner: the Docker smoke
test and the frontend/e2e browser jobs talk over run-unique Docker networks and
`docker cp` code into containers instead of relying on published ports, bind
mounts or the `container:` job key. The host needs:

- **Docker** (daemon running)
- **Go 1.25** and **Node.js 24** with npm
- **make**, `curl`, `openssl`, `git`

Don't run `playwright install` on a shared runner host: browser jobs run inside
the `mcr.microsoft.com/playwright` image, whose version must match the
`playwright` / `@playwright/test` dependencies.

## Keeping runs cheap

1. **Concurrency.** Each workflow uses `group: ${{ github.workflow }}-${{ github.ref }}`
   with `cancel-in-progress: true`, so a new push cancels the previous run on the
   same branch.
2. **Path filters.** Backend-only changes don't run frontend tests (and vice
   versa); docs-only changes don't trigger build/test/e2e/Docker.

> Because heavy workflows are path-filtered, a docs-only PR won't run them. If any
> of these become *required* status checks, account for the "skipped required
> check" case (e.g. a lightweight always-runs guard job).
