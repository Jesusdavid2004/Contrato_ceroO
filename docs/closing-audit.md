# Closing Audit — ContratoClaro (PHASE 0, read-only)

**Date:** 2026-11-03
**Scope:** verify every gap in PHASE A/B/C against the current tree. No code changed.
**Method:** static inspection of `frontend/src`, `backend/src`, `backend/test`,
`backend/evaluation`, docs, `render.yaml`, `.env.example` files, Dockerfiles and CI.

Conventions: REAL = gap confirmed · SOLVED = already done · PARTIAL = partly done.

## A. Production readiness

### A1. Stuck jobs — REAL
- `InProcessAnalysisWorker` (`backend/src/infrastructure/services/InProcessAnalysisWorker.ts`)
  is a pure in-memory FIFO (max 2 concurrent). Nothing persists job state.
- `AnalyzeContractUseCase.execute` transitions contracts through
  `UPLOADED → EXTRACTING → ANALYZING → READY/FAILED`
  (`backend/src/domain/value-objects/ContractStatus.ts`), but a restart or crash
  between enqueue and completion leaves rows stuck in `EXTRACTING`/`ANALYZING`
  forever. `server.ts` runs migrations then `app.listen` — no startup sweep,
  no `ANALYSIS_TIMEOUT`, no `errors.analysis_interrupted` key anywhere.
- Frontend gives up after 60 s (`STATUS_POLL_INTERVAL_MS`/`ANALYSIS_TIMEOUT_MS`
  in `frontend/src/services/contracts.ts`) while the backend job may still run.

### A2. Frontend polling — REAL
- Polling is a fixed 500 ms interval capped at 60 s (`contracts.ts`). No backoff,
  no stage display. The status endpoint already returns granular stages
  (`UPLOADED/EXTRACTING/ANALYZING/READY/FAILED` — see `docs/openapi.yaml`
  `getContractStatus`), but `Home.tsx`/`Results.tsx` never render them.

### A3. Fake UI — REAL (two items)
- Notifications toggle in `Settings.tsx` is a visual-only `Switch` with a noop
  handler. Keys `settings.analysis_alerts*` exist in both locales.
- Delete-account UI is a dead `<span>` badge. Backend supports it
  (`DELETE /api/v1/auth/me`, `DeleteAccountUseCase`), but `services/contracts.ts`
  has no `deleteAccount` function and `AuthContext` never calls `/auth/me`
  with DELETE (only GET on mount). No Playwright coverage.

### A4. Auth storage — REAL
- `AuthContext.tsx` persists the access token in `localStorage` (`cc_token`)
  and sends it as `Bearer`. The httpOnly refresh cookie (`cc_refresh_token`)
  exists and rotates server-side (`presentation/utils/cookies.ts`), but the
  frontend never calls `POST /auth/refresh` to restore a session — startup
  verification is `GET /api/v1/auth/me` with the stored bearer token.
- Cookie attributes are correct: `httpOnly`, `Secure` in production,
  `SameSite=strict` in production / `lax` in dev. CORS uses `credentials: true`
  with an exact `CORS_ORIGIN` (plus localhost dev extras). Production-domain
  cookie/CORS behavior is only partly documented in `docs/security.md`.

### A5. Response validation — REAL
- `frontend/src/services/contracts.ts` validates with hand-written type guards
  (`parseContract`, `parseStatus`, …). No Zod in `frontend/package.json`, no
  inferred types. Runtime contract drift would fail silently as `api_error`.

### A6. Privacy — REAL, with one partial control
- No consent notice before upload when an external provider is configured; no
  privacy page (ES/EN).
- `shared/logger.ts` redacts sensitive *keys* (`original_text`, `token`, …),
  and current AI call sites only log names/counts — but `errorHandler.ts:57`
  logs `err.message`/`err.stack` **unredacted**, so a provider/SDK/Zod error
  embedding contract text would land in logs. No test pins this down.

### A7. Provider selection — REAL
- No `AI_PROVIDER` variable anywhere. Effective rule in `app.ts:72-98`:
  Anthropic client if `ANTHROPIC_API_KEY` set, else `FakeAIProvider` in tests,
  else `LocalAIProvider`. Production therefore defaults to **local**, not
  anthropic. `render.yaml` and both `.env.example` files lack the variable.
- Local models are lazy (first request downloads), so "no load at build/boot"
  holds today — but there is no warm-up path either, so the first real
  classification pays the full download inside the 60 s frontend timeout.
- `/ready` returns `{status}` only; the active provider is logged, not reported.

### A8. Demo seed — SOLVED (in spirit)
- `backend/scripts/seed-demo.ts` throws unless `NODE_ENV=development`, requires
  `DEMO_USER_PASSWORD` ≥ 12 chars, and is idempotent. Seeding is manual
  (`docker compose exec … seed-demo.js`), never automatic. An explicit
  `SEED_DEMO=true` flag is a 5-minute hardening, not a blocker.

## B. Evidence and quality

### B1. Real evaluation — REAL
- `backend/evaluation/` contains one `samples.json` (5 synthetic scenarios, 10
  clauses) and the script behind `npm run evaluate` measures the
  `FakeAIProvider` only. No `/evaluation` directory with 8–10 public/anonymized
  contracts, no hand labels beyond the synthetic fixture, no per-provider
  (local vs anthropic) comparison. `docs/evaluation.md` honestly scopes itself
  as a smoke test, not a benchmark.

### B2. RAG on — REAL
- No `/data/legal` corpus. `seed-legal-provisions` exists but the retrieval path
  is disabled (`RAG_ENABLED=false` default). Existing tests only assert empty
  `legal_basis` under prompt injection; no test asserts "cited provision was in
  the retrieved context" because nothing is retrieved.

### B3. gRPC — REAL (unused in production path)
- `startGrpcServer` is exported but never called (`server.ts` only starts
  Express). `ClauseAnalysisGrpcClient` is constructed only in its unit test.
  `AnalyzeContractUseCase` calls the `AIProvider` directly. `docs/grpc.md`
  describes it as orchestration transport, which overstates its real role.

### B4. Presentation docs — REAL
- `docs/case-study.md` and `docs/class-concepts.md` do not exist. Raw material
  exists: INP observer + `demoTaskVsMicrotask` (`frontend/src/lib/inp.ts`),
  worker pre-hash (`lib/fileHash.ts`, `workers/fileHash.worker.ts`), in-process
  queue (`InProcessAnalysisWorker.ts`), gRPC proto, contract-first OpenAPI.

### B5. Testing — REAL
- No `*.test.*` under `frontend/src` (no Vitest/Testing Library setup at all).
- All 4 Playwright specs run against `e2e/support/mock-api.ts` (recently fixed
  to accept both `/api/*` and `/api/v1/*`). No spec runs against a real backend,
  even with `FakeAIProvider`. No `scripts/smoke-prod.*`.

### B6. Quality reports — REAL
- No Lighthouse/axe runs, no `docs/quality/` directory, in either theme.

## C. Release

### C1. README — PARTIAL
- Has: purpose, 5-step setup, env table, stack, deployment link section (points
  to `docs/deployment.md`, no live URL yet), Spanish summary, doc links.
- Missing: live URL, verified screenshots (explicitly noted absent), inline
  Mermaid diagram (lives in `docs/architecture.md`, not embedded).

### C2. Demo script — PARTIAL
- `docs/demo-script.md` exists with local steps. Needs: live-URL steps,
  language/theme switching (already covered by e2e, not by the script), and an
  offline fallback (`AI_PROVIDER=fake` — blocked on A7).

### C3. Release — REAL
- `CHANGELOG.md` is `[Unreleased]` only; no `v1.0.0` tag. `npm audit` has not
  been run/recorded in this cycle.

## Additional risks found (not in the task list)

- **R1. Log leakage via error objects.** `errorHandler.ts:57` logs raw
  `err.message`/`err.stack`. Zod/provider/file errors can embed user input or
  document fragments. The key-based sanitizer does not inspect string values.
- **R2. Trust-proxy warning in production logs.** `app.set('trust proxy', 1)`
  is production-only, yet `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` appears behind
  the Nginx proxy, so rate-limit client identification falls back and per-IP
  limiting is unreliable. Verify and silence/fix in Phase A.
- **R3. Legacy vs versioned API drift.** Frontend mixes `/api/*` (contracts
  service) and `/api/v1/*` (auth). Both are mounted, so it works, but the
  canonical contract is v1-only per `docs/openapi.yaml`.
- **R4. First-request model download vs 60 s timeout.** With `AI_PROVIDER=local`
  the e5/TrOCR download happens inside the first classification request, which
  the frontend abandons after 60 s (backend keeps working; user sees a timeout
  on a job that later succeeds). Needs warm-up or longer/backoff polling (ties
  A2 + A7 together).
- **R5. TIFF/BMP OCR is a stub.** `ImageNormalizer` relabels TIFF/BMP buffers
  as PNG without real decoding, so local TrOCR will fail on genuine TIFF/BMP
  uploads. Either decode properly or narrow the accepted list.
- **R6. Single-replica constraint stands.** In-memory queue + process-local AI
  cache (documented). Any scaling work must come with the durable-queue design.
- **R7. Frontend `Accept-Language`.** `api-client` rule (services send locale
  explicitly per call) is satisfied functionally, but there is no shared
  `api-client.ts` — each service file wires headers itself.

## Suggested order (for confirmation)
1. A7 (provider switch — unblocks A2-timeout tuning, A6-consent, C2-fallback),
   A1 (stuck jobs), A4 (memory tokens + silent refresh).
2. A5 (Zod — needs new dep + ADR), A2 (backoff + stages), A6 (consent + privacy
   page + log test), A3 (remove toggle, wire delete + e2e).
3. B3 (wire gRPC into analysis or re-scope docs), B1/B2 (fixtures + corpus),
   B4 (docs), B5 (component tests + real-backend e2e + smoke script), B6.
4. C1–C3 (README, demo script, audit, tag).
