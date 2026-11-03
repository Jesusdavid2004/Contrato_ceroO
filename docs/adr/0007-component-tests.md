# ADR 0007: Component Tests with Testing Library and jsdom

## Status
Accepted

## Context
Phase B5 requires component tests for the upload and result views. No DOM
test environment existed; Playwright covers flows but not isolated rendering.

## Decision
Render components with Testing Library in jsdom under the existing Vitest
setup (`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`):
no browser, no network (service calls are mocked).

## Consequences
- **Positive:** fast regression net for critical views in both locales.
- **Negative:** three small dev-only dependencies to audit.
