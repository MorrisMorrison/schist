# CI / CD

GitHub Actions workflows live in [`.github/workflows`](../.github/workflows). This
doc covers what runs, where the image is published, and how to use your own runner.

## Workflows

| Workflow | File | Triggers (paths) | Purpose |
|----------|------|------------------|---------|
| Build | `build.yml` | backend, frontend, Dockerfile, docker-compose, Makefile | `make build` |
| Backend Tests | `test-backend.yml` | `backend/**` | `go test ./...` |
| Frontend Tests | `test-frontend.yml` | `frontend/**` | Vitest unit tests, lint, `svelte-check` (inside the Playwright image) |
| E2E Tests | `e2e.yml` | backend, frontend, `e2e/**`, Dockerfile, docker-compose | Playwright suite against the Dockerised app, split into 2 shards (`e2e (1/2)`, `e2e (2/2)`), each on its own GitHub-hosted runner with its own backend. The image build reads a GitHub Actions layer cache (`scope=schist-image`) that only the Docker workflow on `main` writes (PRs can read `main`'s cache, not each other's) |
| Secret Scan | `secret-scan.yml` | all changes | gitleaks over the full history (via `make secret-scan`) |
| Docker | `docker.yml` | backend, frontend, Dockerfile, docker-compose; every `v*` tag | Build + smoke-test the image on PRs; on push to `main` or a release tag, publish the tested image |
| Release | `release.yml` | `v*` tags | Create the GitHub release with notes generated from the merged PRs (`v0.*` are pre-releases) |

## Coverage (Codecov)

Backend Tests and Frontend Tests upload coverage to [Codecov](https://about.codecov.io/)
with the flags `backend` (`go test -coverprofile`) and `frontend` (Vitest v8 coverage
as lcov (`lcovonly`), copied out of the Playwright container). `codecov.yml` keeps the status
checks **informational**, so coverage never blocks a merge, and uses carryforward
because each side only runs when its own paths change.

Uploads from `main` and same-repo branches use the `CODECOV_TOKEN` repository
secret; fork PRs upload tokenless. A failed upload never fails the job.

Locally: `cd backend && go test -cover ./...`, or
`cd frontend && npm run test:unit -- --coverage` (report in `frontend/coverage/`).

## Published image

`docker.yml` pushes the exact image that passed the smoke test to the GitHub
Container Registry:

- **Push to `main`** (when the image changed): `:latest` and `:main-<short-sha>`.
- **Release tag `vX.Y.Z`:** `:X.Y.Z` and `:vX.Y.Z-<short-sha>`. A tag never moves `:latest`.
- **Manual run** (`workflow_dispatch`): `:<branch>-<short-sha>`, plus the tag you type, if any.

The binary is stamped with the version (`X.Y.Z` on a tag, `dev-<sha>` otherwise). It shows in
the startup log line and as the MCP server's version. The job logs in with the built-in
`GITHUB_TOKEN` (`packages: write`), so no registry secret is needed.

## Releases

A release is a version tag on a commit of `main` that CI has already tested:

```bash
git tag -a v0.0.2 -m "Schist 0.0.2"
git push origin v0.0.2
```

- **`release.yml`** creates the GitHub release with notes generated from the merged PRs. Tags
  starting with `v0.` are marked as pre-releases until 1.0.
- **`docker.yml`** publishes `:0.0.2`.
- **Never move or re-tag a published version;** a broken release gets the next version.

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
