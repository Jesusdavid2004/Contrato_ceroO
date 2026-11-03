# Testing

## Backend (`backend/`)

- `npm run type-check` — strict TypeScript, no emit.
- `npm test` — Vitest unit + integration suites. AI tests use the
  deterministic `FakeAIProvider` test double with a stubbed embedder
  (`test/local-ai-provider.test.ts` covers the local neural ranking without
  downloading models), so the suite stays offline. DB-backed suites run against
  the Compose PostgreSQL/pgvector instance.
- Local neural smoke (verified 2026-11-03, real `multilingual-e5-small` weights,
  no network): abusive clause → `high 0.66`, balanced clause → `low 0.72`.
- `npm run build` — `tsc -p tsconfig.build.json`.
- `npm run evaluate` — regenerates `docs/evaluation.md` from the synthetic
  fixture set (10 clauses, offline only, not a legal benchmark).

Coverage target: >= 70% in `domain/` + `application/` (fakes for repos and AI).
New use cases require a characterization test before refactor and a regression
test per bug fix (see `test/phase1-regression.test.ts`).

## Frontend (`frontend/`)

- `npm run lint` — Oxlint.
- `npm run type-check` — `tsc --noEmit`.
- `npm run i18n:check` — fails if `en.json` / `es.json` key sets differ.
- `npm run build` — Vite production bundle.
- `npm run test:e2e` — Playwright Chromium flows (API stubbed for determinism):
  unauthenticated redirect, upload retry, analysis read-back, letter
  edit/download, no-flagged-clause state, history open/delete, language and
  theme switch.

Browser E2E does not run against a live backend. Live API + DB evidence comes
from backend integration tests, Compose seed (`seed-demo.js`: 1 user,
1 contract, 3 clauses), and container smoke probes (`/health`, `/ready`,
Nginx `/api/health`).

## gRPC

- `npm test -- grpc-clause-analysis`: validation, 100-clause batch limit,
  unauthenticated rejection, health check, deterministic scores.

## Manual checklist before `v1.0.0`

1. `docker compose up --build -d`, `docker compose ps` healthy.
2. `docker compose exec backend node dist/scripts/seed-demo.js` idempotent.
3. Register/login/upload/poll/result/letter/PDF/delete with synthetic data.
4. Switch en/es + light/dark/system, no flash on reload.
5. `npm run evaluate` unchanged or reviewed.
