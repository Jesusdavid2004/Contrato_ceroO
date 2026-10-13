# API additions: objection letters

All routes require an access token in the `Authorization: Bearer <token>`
header. The paths are available under `/api/v1/contracts` and the legacy
`/api/contracts` alias.

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
