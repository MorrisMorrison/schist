# MCP tools

The 20 tools Schist's MCP server offers to AI assistants, with their arguments. To connect an assistant, see [AI assistants (MCP)](../guides/ai-assistants.md).

## The endpoint

| | |
|---|---|
| **URL** | `POST /api/mcp`, Streamable HTTP in stateless mode (`GET` and `DELETE` answer `405`) |
| **Enabled by** | `SCHIST_MCP_ENABLED=true`; otherwise the path is `404`. `GET /api/config` reports it as `mcp_enabled` |
| **Auth** | A personal access token or a session JWT. A read-only token is offered only the read tools. Without authentication the endpoint is open to `localhost` |

## Conventions

- **Paths** look like `/folder/page`, without `.md`. `/` is the root folder.
- **Writes** go through the same services as the REST API. Each is a git commit (folder moves and deletes too), and backlinks are updated.
- **Versions** are a full commit hash or a unique prefix of at least 7 characters.
- **Errors** come back as tool errors with a message that is safe to show.
- **Secrets:** `{{secret:…}}` placeholders are returned as written and never resolved.

## Read tools

Offered to every token.

| Tool | Arguments | Does |
|---|---|---|
| `search` | `query`, `limit?` | Full-text search, as `/api/search`. Snippets mark matches in `**bold**` |
| `read_document` | `path` | Content, title, tags, created and updated times, and `properties` (other front matter such as `aliases` or `status`) |
| `list_folder` | `path?` | Subfolders and the pages directly in the folder. Each subfolder has `documentCount` (pages directly in it) and `totalDocumentCount` (including its subfolders) |
| `get_backlinks` | `path` | Pages linking to `path` |
| `list_tags` | – | Tags with counts, most used first |
| `list_versions` | `path` | The page's versions, newest first: `hash`, `short`, `message`, `author`, `date` |
| `read_version` | `path`, `version` | Title, tags and content at a version |
| `diff_versions` | `path`, `from`, `to?` | A line diff from `from` to `to` (default: the latest): `+`/`-` lines with two lines of context, `additions`, `deletions`, and title or tag `changes` |
| `get_outgoing_links` | `path` | The page's links: `target`, `text`, the `path` it resolves to and `exists`, plus a `broken` count |
| `list_broken_links` | – | Pages with links to pages that don't exist (the trash skipped), sorted by path, with the broken `targets` and a `total` |

## Write tools

Offered to read-write tokens and session JWTs.

| Tool | Arguments | Does |
|---|---|---|
| `create_document` | `path`, `content`, `title?`, `tags?`, `properties?` | A new page; fails if it exists. The title defaults to one made from the path |
| `update_document` | `path`, `content?`, `title?`, `tags?`, `properties?` | Replaces only the fields passed; the path stays. `properties` replaces all of them, `{}` clears them, leaving it out keeps them. Schist's own fields (`title`, `tags`, `path`…) are refused in `properties` |
| `append_to_document` | `path`, `content`, `heading?` | Adds at the end of the page, or at the end of the section under `heading` |
| `edit_document` | `path`, `new_text`, and `old_text` (+ `replace_all?`) or `heading` | Replaces an exact snippet, or the section under `heading` up to the next heading of the same or a higher level (the heading line stays). Fails without writing if the snippet or heading is missing, or matches more than once without `replace_all`. Returns `replacements` and the `lines` where each change starts; an edit that changes nothing isn't committed |
| `move_document` | `path`, `new_path` | Moves or renames a page; fails if `new_path` exists. Links keep working |
| `move_folder` | `path`, `new_path` | Moves or renames a folder with everything in it; fails if the target exists |
| `delete_document` | `path` | Moves the page to `/trash/<path>` (replacing an older copy there, which stays in the history). Returns `trashPath` and `linkedFrom`, the pages whose links now break. Pages already in the trash are refused |
| `delete_folder` | `path` | Moves the folder to `/trash/<path>`, or `/trash/<path>-<timestamp>` when that exists. The root and the trash are refused |
| `restore_version` | `path`, `version` | Restores the page to a version as a new commit, so the content before stays in the history |
| `import_documents` | `files` (`[{path, content}]`, at most 200 files and 10 MB), `folder?`, `on_conflict?` | Imports markdown with the same conversion as the [import](../guides/import-and-export.md). Existing pages are skipped unless `on_conflict` is `rename` or `overwrite`, so a re-run is safe |

Nothing is removed for good over MCP: the trash is hidden from folders, search and links, and moving a page or folder back undoes a delete.
