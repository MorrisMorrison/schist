# Introduction

Schist is a lightweight, self-hosted markdown wiki. This page explains what it does, how it stores your notes, and where to go next.

## What you get

| Area | What Schist does |
|---|---|
| **Storage** | One markdown file per page, with YAML front matter, in ordinary folders. No database. |
| **History** | Every save is a git commit. Browse a page's versions, compare them and restore any of them. |
| **Linking** | `[[Wiki links]]` with backlinks, a link graph, tags (front matter and `#hashtags`) and properties such as `aliases`. |
| **Finding** | Ranked full-text search with snippets, `tag:` filters and a quick switcher (<kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd>). |
| **Editor** | One page that switches between reading and editing in place (<kbd>Ctrl/Cmd</kbd>+<kbd>E</kbd>), with a toolbar, focus mode, image uploads, page templates and Mermaid diagrams. |
| **Accounts** | Passwordless sign-in with passkeys, invite links, and an admin role. |
| **Sharing** | Public read-only links that expire. |
| **Secrets** | Values such as API keys, referenced from pages and shown only after you unlock them with your passkey. |
| **Backup** | Optional push to a GitHub repository: by hand, after every change or on an interval. |
| **Import and export** | Import markdown files or an Obsidian vault (a folder or a `.zip`). Export a page, a folder or the whole wiki. |
| **AI assistants** | An optional [MCP](https://modelcontextprotocol.io) endpoint lets Claude and other assistants search, read and edit the wiki with a personal access token. |

## How it works

Schist is one Go binary that serves the API and the web app. You run it as a Docker container with one data folder mounted:

```text
data/
├── .git/            # the version history
├── .schist/         # users, passkeys, shares, tokens, settings, encrypted secrets
├── assets/          # uploaded images
├── trash/           # deleted pages
├── welcome.md
└── projects/
    └── roadmap.md
```

The data folder is the whole wiki. You can back it up like any folder, read its history with `git log`, or open the pages in another editor.

## Next steps

- [Install Schist](installation.md) with Docker or Docker Compose.
- Take the [first steps](first-steps.md): create a page, link it, find it again.
- Put it on the internet safely: [reverse proxy and HTTPS](../self-hosting/reverse-proxy.md).
- Look up every setting in the [configuration reference](../reference/configuration.md).
