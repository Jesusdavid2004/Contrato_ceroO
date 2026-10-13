# Runtime Validation Report

**Generated:** 2026-10-13
**Target:** `D:\Contrato_ceroO` — Phase 9 security, evaluation, demo seed, and browser flow

## Summary

| Step | Status | Exit code | Details |
|---|---|---:|---|
| Frontend startup | PASS | 0 | Playwright launched Vite at `http://127.0.0.1:5173` and reached the application. |
| Backend tests and type check | PASS | 0 | 11 Vitest files, 86 tests; `npm run type-check` and `npm run build` passed. |
| PostgreSQL migration and demo seed | PASS | 0 | Temporary PostgreSQL 15/pgvector; migrations applied; seed run twice; verified 1 user, 1 contract, 3 clauses. |
| Browser E2E | PASS | 0 | 3 Chromium tests passed across unauthenticated redirect/retry, analysis, letter editing/download, no-flagged-clause, language and theme flows. |
| Frontend checks | PASS | 0 | `npm run lint`, `npm run build`, and `npm run i18n:check` passed. Oxlint reported one existing Fast Refresh warning in `src/context/AuthContext.tsx`. |
| High-risk evaluation | PASS | 0 | 10 synthetic clauses; high-risk precision 100%, recall 100% for the deterministic offline FakeAIProvider. |

## Environment

```text
docker: AVAILABLE — Docker server 29.8.1; `docker info --format 'Docker server {{.ServerVersion}}'`
node: AVAILABLE — v22.19.0; `node --version`
playwright: AVAILABLE — 1.64.0; `npx playwright --version`
chromium: AVAILABLE — installed with `npx playwright install chromium`
infra-tier: PRIMARY(Docker-based) — isolated PostgreSQL 15/pgvector container used for migration and seed verification
browser-tier: PRIMARY(Playwright) — Chromium browser E2E executed; no browser-tier fallback
```

## Test Evidence

- Backend: `npm run type-check`, `npm test`, and `npm run build` from `backend/`.
- PostgreSQL: `npm run seed:demo` executed twice against a disposable PostgreSQL 15/pgvector container; row counts confirmed seed idempotency.
- Browser: `npm run test:e2e` from `frontend/`; Playwright started the Vite development server through `playwright.config.ts`.
- Frontend: `npm run lint`, `npm run build`, and `npm run i18n:check`.
- Evaluation: `npm run evaluate` regenerated `docs/evaluation.md`.

## Browser Journeys

1. Unauthenticated navigation redirects to login; registration, upload retry, analysis read-back, and clause rendering succeed.
2. A high-risk result generates a letter, fills a localized placeholder, saves the edit, copies the text, downloads the PDF, and switches both language and theme.
3. A safe-only result shows the no-flagged-clauses state and does not request letter generation.

## Limitations

- Browser tests intercept the backend API for deterministic UI coverage. Real database migration and demo seeding were exercised separately; the full browser journey was not run against a live backend.
- The evaluation dataset is synthetic and tests only the offline FakeAIProvider. The reported precision and recall are not evidence of external LLM quality, legal correctness, or production performance.
- Legal-domain reviewers have not validated the expected labels; the sample set must be expanded and reviewed before it is treated as a benchmark.

**Overall:** PASS — required Phase 9 technical checks ran successfully, with the above scope limitations recorded.
