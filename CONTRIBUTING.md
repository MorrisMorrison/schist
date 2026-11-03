# Contributing

Thanks for helping with Schist. This page covers how to propose a change and what a pull request needs to be merged.

## Before you start

- **Bugs:** open an [issue](https://github.com/MorrisMorrison/schist/issues/new/choose) with the steps to reproduce, what you expected and what happened, and the version (the startup log line or the image tag).
- **Features:** open an issue first and describe the use case. Schist stays small on purpose, so it's worth agreeing on the idea before you build it.
- **Security problems:** don't post the details publicly. Open an issue that only says you found a security problem and asks for a private contact.

## Make a change

1. Fork the repository and set it up: [Development setup](docs/development/setup.md).
2. Create a branch off `main`: `feat/…`, `fix/…`, `docs/…`, `refactor/…`.
3. Make the change, with tests ([Testing](docs/development/testing.md) says which).
4. Check it:

   ```bash
   make verify
   make test
   ```

5. Open a pull request against `main`. The template asks for a summary, how you tested it and, for UI changes, screenshots (from demo content, never real notes).

## Pull request titles

Conventional commits with a scope. Pull requests are squash-merged, so the title becomes the commit message.

| Example | For |
|---|---|
| `feat(frontend): resizable sidebar` | A new feature |
| `fix(services): keep properties on rename` | A bug fix |
| `docs: explain GitHub backup modes` | Documentation |
| `refactor(errors): typed GitHub errors` | Code changes without new behaviour |
| `test(e2e): import from a zip` | Tests only |
| `ci: cache the Playwright image` | Workflows |
| `chore(deps): bump vite` | Dependencies |

## Code conventions

**Backend (Go)**

- Services return typed errors from `internal/errors` (`NewNotFoundError`, `NewValidationError`, …); handlers call `HandleError`. Never map a status from error text and never send `err.Error()` to the client.
- Every user-supplied path goes through the `utils` path helpers.
- Writes are atomic. New JSON state files use the shared `jsonStore`.
- New settings are `SCHIST_*` variables with a safe default, documented in the [configuration reference](docs/reference/configuration.md).
- `gofmt`, and table-driven tests in `t.TempDir()`.

**Frontend (Svelte 5, TypeScript)**

- Runes and TypeScript everywhere. Backend calls only through `lib/api/client.ts`; shared state in `lib/stores`.
- Build UI from `lib/components/ui` (buttons, inputs, dialogs, menus…), not hand-rolled elements. Add a variant to the library if one is missing, and don't delete library parts because they're unused.
- Pages sit in `PageContainer`. Handle API errors by status or `code`, not by message.
- Prettier and ESLint (`make fmt`, `make lint`).

[Architecture](docs/development/architecture.md) explains the layout of the code.

## Documentation

User-visible changes update the docs in the same pull request: the guide or reference page in `docs/`, and the [REST API](docs/reference/rest-api.md) or [MCP tools](docs/reference/mcp-tools.md) page for API changes. The docs site is built from these files; [Docs site](docs/development/docs-site.md) explains how to preview it and add a page.

## Review and CI

CI must be green: build, unit tests, end-to-end tests, the Docker smoke test and the secret scan ([CI and releases](docs/development/ci-and-releases.md)). Coverage is reported but never blocks a merge.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
