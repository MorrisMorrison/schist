---
name: triage-e2e
description: Triage a failing Schist Playwright e2e run — tell a cancelled run, a timing flake and a real regression apart, then reproduce or fix the one test. Use when the E2E Tests check is red on a PR or main, when an e2e test is flaky, or when writing/changing e2e tests.
---

# Triage a red e2e run

## 1. Was it actually a failure?
```bash
gh pr checks <pr>
gh run view <run-id> --log-failed | tail -200
```
- **Cancelled** (`Canceling since a higher priority waiting request…`): the workflow's concurrency group is per branch, so a newer push to the same branch cancelled it. Look at the newest run instead; not a failure.
- **Setup failed** (Docker build, compose health check, `npm ci`): an infra or dependency problem, not a test. Check whether the same step fails on `main`.

## 2. Flake or regression?
Read *which* tests failed and *how*:
| Symptom | Usually |
|---|---|
| `expect(locator).toBeVisible()` timeout, passes on retry, unrelated to the diff | Timing flake |
| Same test fails on every retry, or on `main` too | Real (in the test or the app) |
| Wrong status / value (`expected 400, received 404`) | Real regression: the API or the error mapping changed |
| `strict mode violation: … resolved to 2 elements` | Selector too broad: fix the test's locator |

Compare with the latest `main` run: `gh run list --workflow e2e.yml --branch main --limit 5`.

## 3. Reproduce one test
Needs Docker.
```bash
docker compose --profile e2e up -d --build
make e2e-test TEST=01-document-lifecycle.test.ts
make e2e-grep GREP="should delete a document"
cd e2e && npx playwright show-report
```
On CI, the HTML report, traces (on first retry) and failure screenshots are uploaded as run artifacts: `gh run download <run-id>`.

## 4. Fixing a flaky test
- Wait on the app's signals: page-object helpers in `e2e/pages/BasePage.ts` (`waitForContentReady` and friends) or a web-first `expect(...)`. **Never** add `waitForTimeout` or raise a timeout to paper over a race.
- Seed data through the API fixtures (`e2e/fixtures/`) with unique names; the suite runs with one worker and one shared backend, so leftover data leaks between tests.
- Prefer `getByRole` / `data-testid` locators scoped to the dialog or panel over bare text matches.
- After a fix, run the test several times locally (`npx playwright test tests/<file> --repeat-each 5`) before calling it stable.

## 5. Changing Playwright
The frontend `playwright` dep, e2e `@playwright/test` and the `mcr.microsoft.com/playwright:v<ver>-noble` image tag in the workflows move together in one PR.
