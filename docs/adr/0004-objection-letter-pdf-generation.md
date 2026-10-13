# ADR 0004: Objection Letter PDF Generation

## Status
Accepted

## Context
Users need an editable objection-letter response and a downloadable PDF in the
contract's selected language. PDF creation belongs in infrastructure; application
logic must enforce contract ownership and only send flagged clauses to the AI.

## Decision
- Generate the letter through the existing `AIProvider` interface, persist it
  through `ContractRepository`, and reject requests before the AI call when the
  contract is not ready or has no medium/high-risk clauses.
- Generate the downloadable PDF from the persisted letter using PDFKit in an
  infrastructure adapter. The letter content is generated in the contract
  locale; the PDF metadata title follows that locale.
- Protect the generation endpoint with an authenticated AI rate limiter and
  verify ownership for both generation and PDF download.

## Consequences
- PDFKit is a focused dependency for paginated PDF output, stream errors, and
  metadata, avoiding a custom PDF serializer.
- Generated letters are persisted and reusable for PDF downloads. A newly
  generated letter is saved as the latest version while prior versions remain
  in the database.
