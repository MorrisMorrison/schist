# GitHub backup

Push the wiki's git history to a GitHub repository, by hand, after every change or on an interval. Backup is push-only: Schist never pulls from GitHub.

## Set it up

1. **Create a repository** on GitHub. It can be empty, and private is best. The branch doesn't have to exist; the first sync creates it.
2. **Create a token:** a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) limited to that repository, with **Contents: Read and write**.
3. **In Schist,** open **Settings → GitHub**, enter the token, owner, repository and branch, and click **Test connection**. Then save.
4. **Choose when to back up** under **Backup Settings**:

   | Option | When it pushes |
   |---|---|
   | *(neither)* | Only when you click **Sync** on the **Sync** tab. |
   | **Back up after every change** | 30 seconds after the last change, and at most 5 minutes after the first unpushed one. A burst of edits makes one push. |
   | **Back up every N minutes** | On a fixed interval, set by `SCHIST_GITHUB_AUTO_SYNC_MINUTES` (default 15). |

Every change counts: edits in the app, API and MCP writes, imports, moves and deletes. Backups run in the background and never slow down or fail a save.

**Status** in Settings shows the last successful sync and the last error, including errors from background syncs.

## When the branch has other commits

If the GitHub branch has commits the wiki doesn't have (a README created with the repository, or a push from somewhere else), a normal sync stops with `SYNC_REMOTE_DIVERGED` and leaves GitHub alone. You can then:

- click **Replace GitHub branch** in Settings, which force-pushes the wiki's history once after you confirm; or
- point the backup at an empty repository or a new branch.

## How the token is stored

The token is encrypted (AES-256-GCM) in `.schist/config.json` with a key derived from `SCHIST_SECRET_KEY`, or from `SCHIST_JWT_SECRET` when that is empty. The server can read it on its own, so backups keep running after a restart.

| Situation | What happens |
|---|---|
| You add or change `SCHIST_SECRET_KEY`, or change the JWT secret it falls back to | The saved token can't be read. Syncs fail with "set up GitHub backup again"; enter the token again. |
| No server secret (a development server with a generated JWT secret) | The token goes into the passkey-protected [secret store](secrets.md) instead. Setup and every sync after a restart need unlocked secrets (`SECRETS_LOCKED`). |
| A token saved by Schist 0.0.3 or older | It is in the secret store. The first sync with secrets unlocked moves it to the server key; after that no unlock is needed. |

Anyone who can read both the server's environment and the data folder can read the token. That's why it should be a fine-grained token for the backup repository only.

## Restore from the backup

The repository is a normal git repository of markdown files. To restore, clone it as the data folder before you start Schist:

```bash
git clone https://github.com/<owner>/<repo>.git data
```

The clone has the pages, the uploaded images and their history. It doesn't have `.schist/` (users, passkeys, shares, tokens, settings and secrets), which is never committed. Keep that folder in your [regular backups](../self-hosting/backups.md), or start fresh and create the admin account again.
