# Runtime Validation Report

**Generated:** 2026-10-13
**Target:** `D:\Contrato_ceroO` — Phase 9 validation and Phase 10 deployment checks

## Summary

| Step | Status | Exit code | Details |
|---|---|---:|---|
| Frontend startup | PASS | 0 | Playwright launched Vite at `http://127.0.0.1:5173` and reached the application. |
| Backend tests and type check | PASS | 0 | 11 Vitest files, 88 tests; `npm run type-check` and `npm run build` passed. |
| PostgreSQL migration and demo seed | PASS | 0 | Docker Compose PostgreSQL 15/pgvector; migrations applied; seed run twice; verified 1 user, 1 contract, 3 clauses. |
| Browser E2E | PASS | 0 | 4 Chromium tests passed across unauthenticated redirect/retry, analysis, letter editing/download, no-flagged-clause, history read/open/delete, language and theme flows. |
| Frontend checks | PASS | 0 | `npm run lint`, `npm run build`, and `npm run i18n:check` passed after history integration. Oxlint reports one existing Fast Refresh warning in `src/context/AuthContext.tsx`. |
| High-risk evaluation | PASS | 0 | 10 synthetic clauses; high-risk precision 100%, recall 100% for the deterministic offline FakeAIProvider. |
| Container images and Compose | PASS | 0 | Backend and frontend images built; Compose parsed; services became healthy. Initial attempt to publish PostgreSQL on host port 5432 was blocked, so the database port is now internal-only. |
| Deployed-container smoke | PASS | 0 | Backend `/health` and `/ready`, frontend HTTP 200, and Nginx `/api/health` proxy verified. Demo seed rerun was idempotent. |
| OpenAPI lint | PASS | 0 | OpenAPI 3.1 parsed by Redocly; 2 non-blocking warnings remain: no license field and logout has no 4xx response. |

## Environment

```text
docker: AVAILABLE — Docker server 29.8.1; `docker info --format 'Docker server {{.ServerVersion}}'`
node: AVAILABLE — v22.19.0; `node --version`
playwright: AVAILABLE — 1.64.0; `npx playwright --version`
chromium: AVAILABLE — installed with `npx playwright install chromium`
infra-tier: PRIMARY(Docker-based) — PostgreSQL 15/pgvector used by the complete local Compose stack
browser-tier: PRIMARY(Playwright) — Chromium browser E2E executed; no browser-tier fallback
```

## Test Evidence

- Backend: `npm run type-check`, `npm test`, and `npm run build` from `backend/`.
- PostgreSQL: Compose migrations completed; the demo seed was executed twice inside the backend container; row counts confirmed 1 user, 1 contract, and 3 clauses.
- Deployment: `docker compose build`, `docker compose config --quiet`, and HTTP probes against the started containers.
- API contract: `npx --yes @redocly/cli lint docs/openapi.yaml`.
- Browser: `npm run test:e2e` from `frontend/`; Playwright started the Vite development server through `playwright.config.ts`.
- Frontend: `npm run lint`, `npm run build`, and `npm run i18n:check`.
- Evaluation: `npm run evaluate` regenerated `docs/evaluation.md`.

## Browser Journeys

1. Unauthenticated navigation redirects to login; registration, upload retry, analysis read-back, and clause rendering succeed.
2. A high-risk result generates a letter, fills a localized placeholder, saves the edit, copies the text, downloads the PDF, and switches both language and theme.
3. A safe-only result shows the no-flagged-clauses state and does not request letter generation.
4. Authenticated history loads contract summaries, opens the selected contract result, and confirms deletion removes it from the visible list.

## Limitations

- Browser tests intercept the backend API for deterministic UI coverage. Real database migration and demo seeding were exercised separately; the full browser journey was not run against a live backend.
- The evaluation dataset is synthetic and tests only the offline FakeAIProvider. The reported precision and recall are not evidence of external LLM quality, legal correctness, or production performance.
- Legal-domain reviewers have not validated the expected labels; the sample set must be expanded and reviewed before it is treated as a benchmark.
- The live container smoke test used local development configuration and synthetic data only. It is not evidence of a public HTTPS deployment or production-provider readiness.

**Overall:** PASS — Phase 9 tests and Phase 10 local container smoke checks passed; public deployment remains blocked on provider/domain/secret-store selection and the production limitations in `docs/security.md`.
