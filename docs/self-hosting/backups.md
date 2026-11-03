# Backups

The data folder is the whole wiki. Back it up and you can restore everything: pages, images, history, users, passkeys, shares, tokens and secrets.

## What's in the data folder

| Path | Holds | In git / GitHub backup |
|---|---|---|
| `*.md`, folders | The pages | Yes |
| `assets/` | Uploaded images | Yes |
| `trash/` | Deleted pages | Yes |
| `.git/` | The version history | It *is* the history |
| `.schist/` | Users, passkeys, invites, shares, tokens, settings, the encrypted secrets and the encrypted GitHub token | No, never committed |

[GitHub backup](../guides/github-backup.md) covers the pages and their history, but not `.schist/`. A full backup copies the whole folder.

## Back up the folder

Any file backup works: restic, borg, rsync, your NAS's snapshots. For a consistent copy, stop the container while you copy, or copy from a filesystem snapshot:

```bash
docker stop schist
tar czf "schist-$(date +%F).tgz" -C /path/to data
docker start schist
```

Also keep the environment: `SCHIST_JWT_SECRET` (and `SCHIST_SECRET_KEY` if you set it). Without the same value the restored GitHub token can't be decrypted, and you'd set up GitHub backup again.

## Restore

1. Stop Schist.
2. Replace the data folder with the backup.
3. Start Schist with the same `SCHIST_JWT_SECRET` and `SCHIST_FRONTEND_URL` as before.

Passkeys only work on the address they were registered on, so restore to the same `SCHIST_FRONTEND_URL`.

## Check the history

The data folder is a normal git repository:

```bash
git -C data log --oneline -10
```

If Schist reports a problem with the repository, `GET /api/git/health` describes it and `POST /api/git/repair` tries to fix it.
