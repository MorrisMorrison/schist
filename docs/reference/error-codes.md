# Error codes

Every API error has the same shape. Clients should branch on `code`, never on the message, which may change.

```json
{
  "error": "Document not found: /projects/roadmap",
  "code": "RESOURCE_NOT_FOUND",
  "details": { "resource": "document" }
}
```

`details` is optional and differs per error. Internal errors never include the cause; it is logged on the server.

## Codes

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | The request is well-formed but a value isn't allowed. |
| `INVALID_PATH` | 400 | The path has characters other than letters, digits, `-`, `_` and `/`, has `..`, or is deeper than 10 levels. |
| `INVALID_REQUEST` | 400 | The body or query can't be read (bad JSON, wrong types). |
| `MISSING_REQUIRED_FIELD` | 400 | A required field is missing; `details.field` names it. |
| `UNAUTHORIZED` | 401 | No valid session or token. |
| `FORBIDDEN` | 403 | Signed in, but not allowed: an admin-only endpoint, a token on an endpoint tokens can't use, a read-only token writing, or sharing turned off. |
| `RESOURCE_NOT_FOUND` | 404 | The page, folder, asset, share or version doesn't exist. |
| `TIMEOUT_ERROR` | 408 | An operation took too long, e.g. a GitHub push. |
| `RESOURCE_ALREADY_EXISTS` | 409 | Something already exists at the target, e.g. a page at a move's destination. |
| `RESOURCE_CONFLICT` | 409 | The change conflicts with the current state. |
| `INVALID_STATE` | 409 | The operation isn't possible right now, e.g. a GitHub sync before backup is set up, or a saved GitHub token that can no longer be read ("set up GitHub backup again"). |
| `SYNC_REMOTE_DIVERGED` | 409 | The GitHub branch has commits the wiki doesn't have. Retry `POST /api/github/sync` with `{"replace_remote": true}` only after the user confirms. |
| `DOCUMENT_CHANGED` | 409 | A save sent a `baseVersion` and the page changed since; `details.document` is the current page. |
| `SECRETS_LOCKED` | 423 | The request needs the unlocked secret store. Unlock with a passkey and retry. A server restart locks the store again. |
| `INTERNAL_ERROR` | 500 | An unexpected error, such as a failed disk write. The server log has the cause. |
| `SERVICE_UNAVAILABLE` | 503 | A service Schist depends on, such as GitHub, isn't reachable. |

## Responses from middleware

Authentication and rate limiting answer before the request reaches a handler, with a different body and no `code`:

| Status | Body |
|---|---|
| 401 | `{"error": "Unauthorized", "message": "Authentication required to access this resource"}` |
| 403 | `{"error": "Forbidden", "message": "…"}` |
| 429 | `{"error": "Rate limit exceeded", "message": "…", "retryAfter": 60}` |

Check the HTTP status for these.
