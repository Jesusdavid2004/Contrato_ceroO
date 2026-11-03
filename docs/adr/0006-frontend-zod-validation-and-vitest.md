# ADR 0006: Runtime API Validation with Zod and Unit Tests with Vitest in the Frontend

## Status
Accepted

## Context
`services/contracts.ts` validated backend payloads with hand-written type
guards, so a contract drift fails opaquely as `errors.api_error`, and the
frontend had no unit-test runner (only stubbed Playwright e2e).

## Decision
Validate every API response with Zod schemas and infer the public types from
them (single source of truth, same major version as the backend). Run pure
service/parser tests with Vitest in a Node environment (no DOM needed);
component tests remain a Phase B item.

## Consequences
- **Positive:** fail-fast parsing with explicit validation errors, inferred
  types that cannot drift from the runtime schema, offline regression net.
- **Negative:** two small dependencies to audit (`zod`, `vitest`).
