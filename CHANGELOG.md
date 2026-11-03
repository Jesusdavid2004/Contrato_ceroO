# Changelog

Notable changes to ContratoClaro are documented here.

## [Unreleased]

### Added

- Local neural AI by default with zero external APIs: `LocalAIProvider`
  (multilingual-e5 embedding prototypes for risk classification, neural-ranked
  letter composition) and `LocalDocumentProcessor` (on-device TrOCR for scanned
  images). `ANTHROPIC_API_KEY` is now optional; `FakeAIProvider` remains the
  deterministic test double with `local-ai-provider` unit tests.
- Internal gRPC `ClauseAnalysisService` (proto + server + client adapter),
  deterministic scoring, `docs/grpc.md`, and `grpc-clause-analysis` tests.
- Frontend Web Worker file pre-hash (`postMessage`) and INP observer with
  Task vs Microtask demo helper for class evidence.
- `docs/testing.md` with backend/frontend/gRPC/manual release checklist.
- `GRPC_PORT` and `GRPC_INTERNAL_TOKEN` configuration.

### Fixed

- OpenAPI 3.1 warnings: added `info.license` and `logout` 429 response.
- Corrected `frontend/index.html` entry to `main.tsx` and added no-flash
  theme bootstrap script.
- Corrected `docs/api.md` upload formats (PDF, PNG, JPEG, WebP, TIFF, BMP, GIF).
- CI now runs backend `build` and frontend `type-check`.
- Containerized local PostgreSQL/pgvector, backend, and frontend stack with
  health checks and local-only port bindings.
- Production multi-stage backend image, non-root runtime, and ignore rules for
  build contexts.
- Liveness and database-readiness endpoints.
- OpenAPI 3.1 specification, architecture diagrams, deployment, security, and
  live demo documentation.
- Runtime validation evidence and explicit production-readiness limitations.

### Changed

- Frontend API calls now use same-origin paths by default; Vite proxies `/api`
  to the local backend during development.
- Production configuration fails closed when the demo AI provider or local
  retained-file storage would otherwise be selected.

### Security

- Local Docker ports bind to loopback and use explicit local-only credential
  samples; production instructions require real secrets and HTTPS ingress.

## Release Policy

No public deployment or `v1.0.0` tag has been created. Create a release only
after the production deployment prerequisites and open security items in
[`docs/security.md`](./docs/security.md) have been reviewed.
