# Reverse proxy and HTTPS

Put Schist behind a reverse proxy with TLS to reach it from other devices. Passkeys need HTTPS on any address other than `localhost`.

## What the proxy must do

| Requirement | Why |
|---|---|
| Terminate TLS for your domain | Passkeys only work over HTTPS. |
| Forward everything to Schist's port (8080) | The API, the web app, `/api/mcp` and `/uploads` are all on one port. |
| Set `X-Forwarded-For` | Schist rate-limits per client address and takes it from this header. |
| Allow uploads of at least 10 MB | Image uploads go up to 10 MB, imports can be larger. |
| Not buffer or time out quickly on `/api/mcp` and `/api/import` | Large imports and GitHub pushes can take a while. |

Then set `SCHIST_FRONTEND_URL` to the HTTPS address, e.g. `https://wiki.example.com`.

> [!IMPORTANT]
> Only the proxy should reach port 8080. Publish the port on `127.0.0.1` (`-p 127.0.0.1:8080:8080`) or keep Schist on a Docker network with the proxy. A client that reaches Schist directly can set `X-Forwarded-For` itself and get around the rate limit.

## Caddy

Caddy gets and renews the certificate on its own:

```text
wiki.example.com {
	reverse_proxy localhost:8080
}
```

## nginx

```nginx
server {
    listen 443 ssl;
    server_name wiki.example.com;

    ssl_certificate     /etc/letsencrypt/live/wiki.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.example.com/privkey.pem;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

## Traefik (Docker labels)

```yaml
services:
  schist:
    image: ghcr.io/morrismorrison/schist:0.0.4
    labels:
      - traefik.enable=true
      - traefik.http.routers.schist.rule=Host(`wiki.example.com`)
      - traefik.http.routers.schist.entrypoints=websecure
      - traefik.http.routers.schist.tls.certresolver=letsencrypt
      - traefik.http.services.schist.loadbalancer.server.port=8080
```

## A login in front of Schist

You can put Schist behind an authenticating proxy (an SSO gateway, basic auth, a VPN). Keep in mind:

- With Schist's own authentication on as well, people sign in twice, but secrets, tokens and users keep working.
- With `SCHIST_AUTH_ENABLED=false`, the proxy is the only protection, and there are no users, secrets or personal access tokens.
- MCP clients send a bearer token, not a browser cookie. A gateway that requires a browser login blocks them; let `/api/mcp` through to Schist.

## Security headers

Schist sends its own CSP, HSTS and other headers ([Configuration](../reference/configuration.md#security-headers)). If the proxy adds headers too, make sure they don't conflict, and don't send two different CSPs.
