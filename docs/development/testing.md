# Testing

The three test suites, how to run them, and what a new change should come with.

## Overview

| Suite | Where | Runs with | Command |
|---|---|---|---|
| Backend unit tests | `backend/**/*_test.go` | `go test` | `make test-backend` |
| Frontend unit and component tests | `frontend/src/**/*.test.ts` | Vitest in headless Chromium | `make test-frontend` |
| End-to-end tests | `e2e/tests/` | Playwright against the app in Docker | `make e2e` |

`make test` runs the backend and frontend suites. CI runs all three on every pull request ([CI and releases](ci-and-releases.md)).

## Backend

```bash
cd backend
go test ./...
go test ./internal/services -run TestImport -v
go test -cover ./...
```

- Tests are table-driven where it helps and live next to the code.
- File and git services run in `t.TempDir()`; nothing touches a real data folder or the network.
- There is no fake GitHub remote: keep push logic thin and test the decisions around it.
- A few tests assume Linux paths and permissions and fail on Windows. CI runs Linux; on Windows, check you didn't add new failures.

## Frontend

Vitest runs in real headless Chromium (browser mode), so install it once:

```bash
cd frontend
npx playwright install chromium
npm run test:unit -- --run
npm run test:unit -- --run src/lib/utils/wiki-links.test.ts
npm run test:unit -- --coverage
```

Component tests use `@testing-library/svelte`. Also run `npm run check` (svelte-check) and `npm run lint`.

## End-to-end

The suite runs against the production image with authentication on. It needs Docker.

```bash
docker compose --profile e2e up -d --build
make e2e
make e2e-test TEST=import-export.test.ts
make e2e-grep GREP="should create a document"
make e2e-ui
```

How the suite stays reliable:

- **One worker, one shared backend** per run. `auth.setup.ts` registers the first user with a virtual passkey and saves the signed-in state. CI splits the suite into two shards, each with its own backend, so a test must not depend on another one.
- **Seed through the API fixtures** and give every page and folder a unique name. After every test a fixture wipes the documents, folders and shares.
- **Import `test` and `expect` from `../fixtures`,** never from `@playwright/test`.
- **Wait on the app, not the clock:** web-first assertions and `BasePage.waitForContentReady`, never `waitForTimeout`.

[`e2e/README.md`](../../e2e/README.md) has the page objects, test categories and debugging tips.

### Playwright versions

The frontend's `playwright`, the e2e suite's `@playwright/test` and the `mcr.microsoft.com/playwright` image used in CI must be the same version, or the browsers don't match.

## Trying the API by hand

[`http/`](../../http/) has a request file for every API area, for the VS Code REST Client or the JetBrains HTTP client. Pick an environment in `http-client.env.json` (`dev`, `docker`…) and set `authToken` to a session JWT or a personal access token.

## README screenshots

```bash
make screenshots
```

This builds the frontend, starts the backend against a throwaway demo wiki and writes `docs/screenshots/<screen>-<light|dark>.png`. The capture lives in `e2e/readme-screenshots/`. In CI the **README Screenshots** workflow publishes them to the `screenshots` branch, which the README and this site link to. Nothing is committed to `main`.

## What a change should include

| Change | Tests |
|---|---|
| Backend logic, storage, import, sync | Go tests, including the failure paths |
| A new endpoint | Handler tests, a `.http` request, and the [REST API](../reference/rest-api.md) page |
| A component or store | A Vitest test |
| A user flow | An e2e test |
| Rendering of user content | An XSS case in `e2e/tests/xss-security.test.ts` |
