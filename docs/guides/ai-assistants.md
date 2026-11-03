# AI assistants (MCP)

Let Claude and other AI assistants search, read and edit your wiki through the [Model Context Protocol](https://modelcontextprotocol.io). The endpoint is off until you turn it on.

## 1. Turn on the endpoint

Start Schist with:

```bash
SCHIST_MCP_ENABLED=true
```

The endpoint is `https://<your wiki>/api/mcp`.

## 2. Create a token

Open **Settings → AI Assistants & API Tokens** and create a personal access token:

| Field | Choices |
|---|---|
| **Name** | Anything that tells you where it's used, e.g. "Laptop – Claude Code". |
| **Access** | **Read only**: search, read, history and links. **Read and write**: also create, edit, move, delete and import. |
| **Expires** | 30 days, 90 days (default), 1 year or never. |

The token (`sch_…`) is shown once. Schist stores only a hash of it.

## 3. Connect the assistant

Settings shows the exact commands for your wiki, ready to copy. For Claude Code:

```bash
claude mcp add --transport http schist https://wiki.example.com/api/mcp --header "Authorization: Bearer sch_..."
```

Other clients that support remote MCP servers take a JSON config:

```json
{
  "mcpServers": {
    "schist": {
      "type": "http",
      "url": "https://wiki.example.com/api/mcp",
      "headers": { "Authorization": "Bearer sch_..." }
    }
  }
}
```

Start a new assistant session after you connect, or after you upgrade Schist, so it picks up the current list of tools.

## What an assistant can do

The [MCP tools reference](../reference/mcp-tools.md) lists all 20 tools with their arguments. In short:

- **Read:** search, read pages, list folders and tags, follow backlinks and outgoing links, find broken links, read and compare old versions.
- **Write:** create pages, replace a snippet or a section, append, update properties, move and rename, delete to the trash, restore a version, import files.

## Safety

- **Every write is a git commit,** so you can see and undo what an assistant changed in the page's history.
- **Deleting moves things to `/trash`.** Nothing is removed for good over MCP.
- **Tokens reach documents only:** never secrets, passkeys, users, shares, tokens or settings. `{{secret:…}}` placeholders come back as written.
- **Revoke a token** in Settings to cut an assistant off at once.

Without authentication (`SCHIST_AUTH_ENABLED=false`) the endpoint needs no token. It then only accepts requests addressed to `localhost`, so a web page can't reach it through DNS rebinding.
