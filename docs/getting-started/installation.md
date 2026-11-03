# Installation

Run Schist with Docker or Docker Compose. You need Docker and a folder for the wiki's data.

## Docker

```bash
docker run -d --name schist \
  -p 8080:8080 \
  -v "$(pwd)/data:/app/data" \
  -e ENV=production \
  -e SCHIST_JWT_SECRET="$(openssl rand -base64 48)" \
  -e SCHIST_FRONTEND_URL=http://localhost:8080 \
  ghcr.io/morrismorrison/schist:latest
```

Open http://localhost:8080. Schist asks you to create the admin account and register a passkey (Face ID, Touch ID, Windows Hello, a phone or a security key).

> [!WARNING]
> This example creates a new JWT secret on every `docker run`. That's fine for a first look, but a changed secret signs everyone out and stops GitHub backups. For a wiki you keep, use Docker Compose with a fixed secret, as below.

## Docker Compose

1. Create a folder with this `docker-compose.yml`:

   ```yaml
   services:
     schist:
       image: ghcr.io/morrismorrison/schist:0.0.4
       container_name: schist
       restart: unless-stopped
       ports:
         - "8080:8080"
       volumes:
         - ./data:/app/data
       environment:
         - ENV=production
         - SCHIST_JWT_SECRET=${SCHIST_JWT_SECRET:?set a random secret of at least 32 characters}
         - SCHIST_FRONTEND_URL=http://localhost:8080
   ```

2. Create the secret once and keep it in a `.env` file next to it:

   ```bash
   echo "SCHIST_JWT_SECRET=$(openssl rand -base64 48)" > .env
   ```

3. Start Schist:

   ```bash
   docker compose up -d
   ```

## The settings you must get right

| Variable | Why it matters |
|---|---|
| `ENV=production` | Serves the web app from the binary and refuses to start without a real JWT secret. |
| `SCHIST_JWT_SECRET` | Signs sign-in tokens and protects the GitHub backup token. At least 32 random characters. Keep it stable. |
| `SCHIST_FRONTEND_URL` | The exact URL people open, with scheme, host and port (`https://wiki.example.com`). Passkeys, share links and invite links are built from it. |

Passkeys only work on `localhost` or over HTTPS. To reach Schist from other devices, put it behind a [reverse proxy with TLS](../self-hosting/reverse-proxy.md) and set `SCHIST_FRONTEND_URL` to the HTTPS address.

Every other setting has a safe default. The [configuration reference](../reference/configuration.md) lists them all.

## Image tags

Images are published to `ghcr.io/morrismorrison/schist`.

| Tag | What it is |
|---|---|
| `:X.Y.Z` (e.g. `:0.0.4`) | A release. Never changes. Recommended. |
| `:latest` | The newest build of `main`. Moves on every merged change. |
| `:main-<sha>` | One specific build of `main`. |

Schist is pre-1.0: releases are snapshots on the way to a stable 1.0. The [releases page](https://github.com/MorrisMorrison/schist/releases) lists them with their notes, and [Upgrading](../self-hosting/upgrading.md) explains how to move between them.

## Check that it runs

```bash
curl http://localhost:8080/api/health
```

The answer is `{"status":"ok","service":"schist"}`. The container log names the version, for example `Starting Schist 0.0.4 on port 8080 (env: production)`.

## Next

[First steps](first-steps.md): create a page, link it and find it again.
