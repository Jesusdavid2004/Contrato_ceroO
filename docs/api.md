# ContratoClaro API

The canonical API contract is [OpenAPI 3.1](./openapi.yaml). Versioned routes
are mounted under `/api/v1`; legacy `/api` aliases remain available for the
existing frontend. The unauthenticated liveness and readiness checks are
`GET /health` and `GET /ready`.

## Authentication

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| POST | `/auth/register` | No | Create an account and session |
| POST | `/auth/login` | No | Authenticate and create a session |
| POST | `/auth/refresh` | Refresh cookie | Rotate access and refresh tokens |
| POST | `/auth/logout` | No | Clear refresh cookie |
| GET | `/auth/me` | Bearer access token | Get current user |
| DELETE | `/auth/me` | Bearer access token | Permanently delete account data |

## Contracts

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| POST | `/contracts` | Bearer access token | Upload a multipart contract and enqueue analysis |
| GET | `/contracts` | Bearer access token | List current user's contracts |
| GET | `/contracts/:id` | Bearer access token | Get an owned contract and clauses |
| GET | `/contracts/:id/status` | Bearer access token | Poll processing state |
| DELETE | `/contracts/:id` | Bearer access token | Delete an owned contract |
| POST | `/contracts/:id/letter` | Bearer access token | Generate a letter from flagged clauses |
| PUT | `/contracts/:id/letter` | Bearer access token | Save letter edits |
| GET | `/contracts/:id/letter/pdf` | Bearer access token | Download the latest letter PDF |

Upload accepts PDF, PNG, or JPEG files up to 10 MiB. The API checks file magic
bytes and returns analysis status separately from the upload response.

## Errors

Errors use `{ "code": "...", "message_key": "...", "details": {} }` where
available. The frontend maps `message_key` through its active locale. Common
statuses include 400 for malformed/missing input, 401 for unauthenticated
requests, 403 for ownership violations, 404 for missing resources, 409 for
state conflicts, 413 for oversized uploads, 415 for unsupported file types,
422 for business validation, and 429 for rate limits.

All contract routes require an access token in the `Authorization: Bearer
<token>` header. The paths are available under `/api/v1/contracts` and the
legacy `/api/contracts` alias.

## Generate an objection letter

`POST /:id/letter`

Generates and persists a letter using only clauses classified as medium or high
risk. The contract must be `READY` and belong to the authenticated user. The
endpoint is rate-limited by both client IP and user.

Success response (`201`):

```json
{
  "id": "letter-id",
  "contract_id": "contract-id",
  "locale": "es",
  "content": "Estimado/a [DESTINATARIO]: ...",
  "created_at": "2026-10-13T12:00:00.000Z"
}
```

Relevant errors: `404` for a missing contract, `403` for a contract owned by a
different user, `409` while analysis is not complete, and `422` if no
medium/high-risk clause was found. In the no-flagged-clause case the AI provider
is not called.

## Download the latest objection letter

`GET /:id/letter/pdf`

Returns the latest persisted letter as a localized PDF attachment with
`Content-Type: application/pdf`. This route does not invoke the AI provider.
It returns `404` when no letter has been generated for the contract.

## Save edited objection letter

`PUT /:id/letter`

Persists user edits to the latest generated letter without invoking AI. The
contract and an existing generated letter must belong to the authenticated
user. The body is `{ "content": "..." }`; content must be non-empty and no
longer than 350 words. The response uses the same shape as the generation
response. Subsequent PDF downloads use the saved edits.
