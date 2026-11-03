# Sharing

Give someone without an account a read-only link to one page. Links expire, and you can revoke them at any time.

## Share a page

1. Open the page and click **Share** in its toolbar.
2. Pick how long the link works: 1 day, 1 week, 1 month or 3 months.
3. Copy the link. It looks like `https://wiki.example.com/share/<token>`.

The person sees the page as it is when they open it, without the sidebar. The link gives access to that page only; the rest of the wiki still needs an account.

> [!NOTE]
> **Never expires** in the dialog currently creates a link with the default expiry (7 days); see [#338](https://github.com/MorrisMorrison/schist/issues/338).

## Manage links

The share dialog lists your links with their expiry dates. Revoke one to make it stop working immediately. Expired links stop working on their own.

## Settings

| Variable | Default | Does |
|---|---|---|
| `SCHIST_SHARING_ENABLED` | `true` | `false` refuses new links and makes existing ones stop resolving. You can still list and revoke them. |
| `SCHIST_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | The expiry when none is given. |
| `SCHIST_SHARE_MAX_EXPIRY_DAYS` | `90` | The longest expiry allowed. |

Share links are built from `SCHIST_FRONTEND_URL`, so set it to the address people outside can reach.
