# Changelog

Notable changes to ContratoClaro are documented here.

## [Unreleased]

### Removed

- Anthropic adapter, SDK dependency, and related config/docs. The AI stack is
  now local neural models by default with an optional free Gemini tier
  (`AI_PROVIDER=gemini|local|fake`); Claude references remain only in
  historical audit documents.

## [1.0.0] - 2026-11-03

First tagged release: local-first AI, hardened auth, evidence-backed quality,
and release documentation. No public deployment yet (see Release Policy).

### Added

- Hybrid AI by default with zero required APIs: `LocalAIProvider`
  (multilingual-e5 embedding prototypes for risk classification, neural-ranked
  letter composition) classifies every clause on-device; hosted adapters
  (Anthropic Claude, Google Gemini with JSON mode) refine low-confidence
  clauses and write letters when a key is configured (`TieredAIProvider`
  routes by tier). `AI_PROVIDER=anthropic|gemini|local|fake` selects the
  setup; `/ready` reports the active provider.
- `LocalDocumentProcessor` (on-device TrOCR for scanned images) used whenever
  the local tier owns document processing.
- Startup recovery for interrupted analyses: contracts stuck in
  `EXTRACTING`/`ANALYZING` past `ANALYSIS_JOB_TIMEOUT_MS` are marked `FAILED`
  with `errors.analysis_interrupted` (new `status_updated_at` column,
  versioned migration).
- `SEED_DEMO=true` gate for the demo seed (in addition to `NODE_ENV=development`).
- Memory-only access tokens with silent session restore through the httpOnly
  refresh cookie; documented cookie/CORS attributes in `docs/security.md`.
- Zod-validated API responses with inferred types in the frontend
  (`docs/adr/0006-frontend-zod-validation-and-vitest.md`); Vitest unit tests
  (characterization, contracts, results/home views).
- Exponential-backoff polling with visible analysis stages.
- Password-confirmed account deletion wired to `DELETE /auth/me` with
  Playwright coverage.
- External-AI consent notice, public privacy page (ES/EN), log-privacy tests.
- Internal gRPC `ClauseAnalysisService` (proto + server + client adapter) with
  docs and tests (documented as not wired into the production path).
- Frontend Web Worker file pre-hash (`postMessage`) and INP observer with a
  Task vs Microtask demo helper.
- `evaluation/` fixtures (9 hand-labeled contracts) and per-provider
  precision/recall reporting (`npm run evaluate`).
- Curated Colombian legal corpus (`data/legal/CO.json`, 14 provisions) with a
  no-hallucinated-citation test (`npm run seed:legal`, `RAG_ENABLED`).
- `docs/case-study.md`, `docs/class-concepts.md`, `docs/testing.md`,
  `docs/grpc.md`; Playwright e2e against a real backend; `scripts/smoke-prod.*`.
- axe-core audit (0 violations, both themes) and Lighthouse desktop reports in
  `docs/quality/`; fixed all serious color-contrast issues.
- Screenshots, Mermaid system diagram, and 5-command setup in the README.
- Rounded `main` landmark shell in `index.html` and aligned theme bootstrap
  key with the persisted preference.

### Fixed

- Objection-letter responses now carry the persisted id (previously missing,
  which broke the frontend letter editor against a real backend).
- OpenAPI 3.1 warnings: added `info.license` and a `logout` 429 response.
- Corrected upload formats (PDF, PNG, JPEG, WebP, TIFF, BMP, GIF) and the
  frontend entry to `main.tsx`.
- Backend runtime moved to Debian-slim so onnxruntime finds glibc.
- e2e mock accepts both versioned and legacy API aliases.

### Security

- Local Docker ports bind to loopback with explicit local-only credential
  samples; production instructions require real secrets and HTTPS ingress.
- `npm audit`: the 2 HIGH advisories (body-parser, multer) were fixed with
  non-breaking updates. 3 moderate advisories remain in the glob/minimatch
  chain of the dev-time `node-pg-migrate` tool (not reachable from request
  handling); fixing them requires breaking upgrades (`npm audit fix --force`)
  and is deferred.
- Production startup rejects the fake test double, non-ephemeral file
  retention, and missing secrets/CORS origin.

## Release Policy

`v1.0.0` is tagged from `main`. It certifies the local demo, offline AI, and
repository checks — not a production deployment. Provision cloud
infrastructure, secrets, and a managed database per `docs/deployment.md`, and
review the open items in [`docs/security.md`](./docs/security.md) before
serving real users.
