# Secrets

Keep values such as API keys and passwords out of your pages. A page refers to a secret by name, and the value shows only after you unlock the secret store with your passkey.

## Add a secret

1. Open **Settings → Secret Management** and click **Unlock** (your passkey confirms it).
2. Add a secret with a **key** (its name, e.g. `api_key`) and a **value**.

Secrets are encrypted on disk in `.schist/`. They are never committed to git or pushed to GitHub.

## Use it in a page

Write the key in a placeholder:

```markdown
The staging API key is {{secret:api_key}}.
```

| Secret store | The page shows |
|---|---|
| Locked | The placeholder, marked as locked |
| Unlocked | The value in its place |

The page file keeps `{{secret:api_key}}`, so exports, GitHub backups and share links never contain the value. AI assistants over MCP also get the placeholder, never the value.

## Locking

The unlock lasts until you click **Lock** or the server restarts. After a restart the store is locked again, and requests that need it answer `423 SECRETS_LOCKED` until someone unlocks it.

## Requirements

Secrets need authentication on (`SCHIST_AUTH_ENABLED=true`, the default) and a registered passkey. See [Users and passkeys](users-and-passkeys.md).
