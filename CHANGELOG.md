# Changelog

Notable changes to ContratoClaro are documented here.

## [Unreleased]

### Added

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
