# Users and passkeys

Schist signs people in with passkeys (WebAuthn), not passwords. This page covers the admin account, inviting people, managing passkeys and running without authentication.

## How sign-in works

A passkey is a key pair kept by your device or password manager: Face ID, Touch ID, Windows Hello, a phone or a security key. Signing in is one tap. A session lasts `SCHIST_JWT_EXPIRY_HOURS` (default 24 hours).

Passkeys are bound to the wiki's address. They work only on `localhost` or over HTTPS, and `SCHIST_FRONTEND_URL` must be the exact URL people open. If you change the address, existing passkeys stop working there.

## One shared wiki

All users share one wiki and have the same access to every page. There are no per-page permissions.

## The admin account

The first account, created on the setup page, is the admin. Only the admin can invite and remove users. The admin account can't be deleted.

## Invite people

1. Open **Settings → User Management** and click **Invite User**.
2. Copy the invitation link and send it to the person.
3. They open it, pick a username and register a passkey.

An invite link works once and expires after 7 days.

## Remove a user

In **Settings → User Management**, delete the user. Their sessions and personal access tokens stop working. Their pages stay in the wiki.

## Manage your passkeys

In **Settings → Passkey Security** you can:

- **Add Passkey:** register another device, so losing one doesn't lock you out;
- **Delete** a passkey you no longer use.

Register at least two passkeys for the admin account.

## Running without authentication

```bash
SCHIST_AUTH_ENABLED=false
```

Everyone who can reach Schist can then read and change everything. Use this only for a single-user wiki on `localhost` or behind another login (an authenticating reverse proxy, a VPN). Personal access tokens, users and [secrets](secrets.md) need authentication on.
