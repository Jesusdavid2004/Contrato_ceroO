# ADR 0005: Container Deployment Boundaries

## Status
Accepted

## Context
The application has a browser SPA, an Express API, and PostgreSQL with pgvector.
The analysis worker and AI result cache are process-local. Uploaded contract
files can be sensitive, and production file retention is not backed by a
private encrypted object-storage adapter.

## Decision

- Use Docker Compose for local demonstrations with PostgreSQL, backend, and
  Nginx-served frontend. The frontend proxies `/api` on the same origin.
- Build the backend as a multi-stage Node 22 image, install only production
  dependencies in its runtime stage, and run it as the non-root `node` user.
- Keep PostgreSQL and backend ports bound to loopback in the local Compose
  profile; require HTTPS ingress, a private managed PostgreSQL service, and
  platform-managed secrets for production.
- Keep exactly one backend replica while analysis jobs and classification
  caching are in process. Production startup requires Anthropic credentials
  and `CONTRACT_FILE_RETENTION=none`.
- Do not claim a production release, public URL, or `v1.0.0` tag until a cloud
  target is authorized and the remaining storage, auth, and operations risks
  are addressed.

## Consequences

- **Positive:** Local containers are isolated and reproducible; the browser no
  longer depends on a hard-coded localhost API URL; database readiness can be
  checked independently from process liveness.
- **Negative:** Production deployment remains provider-specific and is not
  automated. The current in-process queue constrains horizontal scaling, and
  file retention is unavailable in production until encrypted object storage
  and deletion lifecycle tests exist.
