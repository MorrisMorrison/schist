# Upgrading

Move to a new Schist version on purpose, with a backup and a way back.

## Pin a release

Run a version tag, not `:latest`:

```yaml
image: ghcr.io/morrismorrison/schist:0.0.4
```

`:latest` follows `main` and changes with every merged pull request. A release tag (`:X.Y.Z`) never changes. The [releases page](https://github.com/MorrisMorrison/schist/releases) lists every version with its notes, including any upgrade steps.

Schist is pre-1.0: releases are snapshots on the way to 1.0, without long-term support. Read the notes of every version you skip.

## Upgrade

1. **Read the release notes** of the new version and every one in between.
2. **Back up** the data folder ([Backups](backups.md)).
3. **Change the tag** in `docker-compose.yml`, then pull and restart:

   ```bash
   docker compose pull
   docker compose up -d
   ```

4. **Check it:**

   ```bash
   curl https://wiki.example.com/api/health
   docker logs schist | grep "Starting Schist"
   ```

   The log line names the new version.

5. **Reconnect AI assistants:** start a new assistant session so it loads the current MCP tools.

## Roll back

Set the previous tag and restart. If the new version already changed files in the data folder, restore the backup from step 2 first.

## Notes for specific versions

| Upgrading to | Do this |
|---|---|
| 0.0.4 | The GitHub token moves to a server-side key. If you use GitHub backup, unlock secrets once and run a sync; after that backups run without an unlock. The token's key now comes from `SCHIST_SECRET_KEY` or `SCHIST_JWT_SECRET`: changing either (or adding `SCHIST_SECRET_KEY` later) means entering the GitHub token again. |
