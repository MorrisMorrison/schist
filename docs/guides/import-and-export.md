# Import and export

Bring markdown notes or an Obsidian vault into Schist, and take pages, folders or the whole wiki out again.

## Import

1. Click the **Import** button (the upload icon) at the top of the sidebar, or choose **Import here** in a folder's menu.
2. Choose markdown files, a folder, or a `.zip`.
3. Pick the target folder. It may be new; the import creates it.
4. Choose what happens when a page already exists:

   | Option | Does |
   |---|---|
   | **Rename** (default) | Imports the file next to the existing page under a new name. |
   | **Skip** | Keeps the existing page. Safe to run again. |
   | **Overwrite** | Replaces the existing page. Its old version stays in the history. |

The report lists every file with what was converted or dropped, and why a file was skipped. The whole import is one git commit.

### What is kept

| From the files | Becomes |
|---|---|
| Folders | Folders. Names become slugs (`My Notes` → `my-notes`); hidden folders lose their dot (`.agents` → `agents`). |
| File name | The page path, as in Obsidian: `devices/router.md` → `/devices/router`. |
| Front matter `title`, else the first `# heading`, else the file name | The title |
| Front matter `tags` and inline `#tags` | Tags |
| Front matter `created` / `updated` | The page dates |
| Every other front matter key | A [property](writing-and-linking.md#properties), such as `aliases` |

### What is converted

- **Links** become `[[Title]]` links: `[[file]]`, `[[folder/file]]`, `[[file#heading]]`, `[[file|alias]]` (also escaped inside tables) and markdown links to `.md` files. A target is looked up in the import first, then among the pages already in the wiki, so links between import batches resolve.
- **Callouts** (`> [!note] Title`) become a bold label in the quote.
- **Note embeds** `![[note]]` become links.

### What is removed or skipped

- Plugin syntax: Dataview and DataviewJS queries, inline Dataview, Tasks queries, Templater tags, Buttons and Meta Bind blocks.
- `%% comments %%` and block IDs (`^abc123`).
- Tool folders (`.obsidian`, `.git`, `.trash`), hidden files and files that aren't markdown. Embedded images aren't imported.

AI assistants can import too: see `import_documents` in the [MCP tools](../reference/mcp-tools.md).

## Export

| What | Where | You get |
|---|---|---|
| One page | The page menu, or <kbd>Ctrl/Cmd</kbd>+<kbd>J</kbd> | A `.md` file |
| A folder | The folder's menu | A `.zip` |
| The whole wiki | The sidebar's **+** menu | A `.zip` |

For a full copy with history, back up the data folder instead: see [Backups](../self-hosting/backups.md).
