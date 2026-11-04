# GitHub backup

Push the wiki's git history to a GitHub repository, by hand, after every change or on an interval. By default backup is push-only: Schist never pulls from GitHub. [Two-way sync](#two-way-sync) is an option that also brings in changes made there.

## Set it up

1. **Create a repository** on GitHub. It can be empty, and private is best. The branch doesn't have to exist; the first sync creates it.
2. **Create a token:** a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) limited to that repository, with **Contents: Read and write**.
3. **In Schist,** open **Settings → GitHub**, enter the token, owner, repository and branch, and click **Test connection**. Then save.
4. **Choose when to back up** under **Backup Settings**:

   | Option | When it pushes |
   |---|---|
   | *(neither)* | Only when you click **Sync** on the **Sync** tab. |
   | **Back up N minutes after the last edit** (recommended) | N minutes after you stop editing (1 to 60, default 2). Every edit restarts the countdown, so a writing session makes one push. While you keep editing, a backup still runs at least every 30 minutes. |
   | **Back up every N minutes** | On a fixed interval, set by `SCHIST_GITHUB_AUTO_SYNC_MINUTES` (default 15). Can be combined with the option above. |

Every change counts: autosaves while you type, saves, API and MCP writes, imports, moves and deletes. A backup first commits anything that's only been autosaved, then pushes. Backups run in the background and never slow down or fail a save.

**Status** in Settings shows the last successful sync and the last error, including errors from background syncs.

## Two-way sync

Two-way sync also brings in changes made on GitHub or in a clone of the repository, for example edits in Obsidian. Backup stays the default.

### Turn it on

1. Set up backup as described above.
2. Under **Settings → GitHub**, choose **Two-way sync** as the **Sync mode**.
3. Schist shows a preview of the first sync: what comes into the wiki (new, changed and deleted files), what goes to GitHub, pages changed in both places, and notes it can't read yet. Read it, then confirm.

Turning it on also turns on automatic sync. The default interval is 5 minutes. Set `SCHIST_GITHUB_AUTO_SYNC_MINUTES` to change it. Choosing **Backup only** again goes back to push-only.

### The rules

- Changes to different pages merge on their own.
- If the same page changed in both places, the sync pauses. Nothing is applied and nothing is pushed until you decide. Under **Settings → GitHub** you see both versions of each page and pick a side per page: **Keep Schist's** or **Take GitHub's**. The version you don't pick stays in the page's history.
- Only pages can conflict. Files that aren't pages, such as attachments, take GitHub's version when both sides changed them. The `.obsidian/` folder is never shown in the wiki.
- If the wiki or GitHub changes again while a sync runs, Schist plans again, up to 3 times. If it still can't settle, it stops and tries on the next sync.
- If a file in the wiki folder that git ignores sits where a file from GitHub should go, the sync stops and names the path. Move that file out of the wiki folder and sync again.
- **Replace GitHub branch** isn't offered in this mode.

### Notes Schist can't read yet

A note created in Obsidian without front matter, or with a file name that has spaces or other characters Schist doesn't allow, is kept but not shown. It stays in the repository and isn't deleted. It is listed in **Settings → GitHub** as not readable. Add front matter or rename the file, and it appears after the next sync.

### When a page changes while you edit it

If a sync brings in a new version of the page you have open, saving shows **This page changed since you opened it**. Autosave pauses. You can:

- **Load the new version.** Your text is copied to the clipboard first.
- **Keep mine.** Your text is saved over the new version, which stays in history.
- **Back to editor.** The dialog closes so you can copy or fix things by hand. The editor says that saving is paused, and the next save asks again.

If the page was deleted on GitHub, or changed so that Schist can't read it, the dialog says so. You can keep yours, which saves it as the page again, or **Discard my changes**, which copies your text to the clipboard first. The same dialog appears when another user or the API changed the page. See [`DOCUMENT_CHANGED`](../reference/error-codes.md).

## When the branch has other commits

If the GitHub branch has commits the wiki doesn't have (a README created with the repository, or a push from somewhere else), a normal sync stops with `SYNC_REMOTE_DIVERGED` and leaves GitHub alone. You can then:

- click **Replace GitHub branch** in Settings (backup mode only), which force-pushes the wiki's history once after you confirm; or
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
