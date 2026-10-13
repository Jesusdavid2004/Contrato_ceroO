# Deployment Guide

## Deployment Status

There is no public HTTPS deployment yet. The repository does not identify a
cloud provider, account/subscription, domain, secret store, or managed database.
This guide makes the existing services runnable as containers and records the
requirements for a production deployment; it does not claim that infrastructure
has been provisioned.

## Local Container Demo

Prerequisites: Docker Engine with Compose v2 and Node.js 22 only if running
repository tests outside containers.

1. Copy `.env.example` to `.env` and replace the local-only database and JWT
   values. Set `DEMO_USER_PASSWORD` to a unique value of at least 12 characters.
2. Build and start the complete local stack:

   ```powershell
   docker compose up --build -d
   ```

3. Wait for the backend migration and health checks, then seed the synthetic
   account and contract:

   ```powershell
   docker compose ps
   docker compose exec backend node dist/scripts/seed-demo.js
   ```

4. Open `http://localhost:8080` and sign in with `DEMO_USER_EMAIL` and
   `DEMO_USER_PASSWORD` from `.env`.
5. Stop the stack when finished:

   ```powershell
   docker compose down
   ```

The database volume remains after `docker compose down`. Removing demo data is
not the same as removing the database volume; do not add `-v` unless you
intentionally want to delete local database contents.

## Production Topology

Use a TLS-enabled managed ingress or reverse proxy in front of the frontend
container. Keep backend and database private. Use managed PostgreSQL 15 or
compatible PostgreSQL with pgvector; store secrets in a platform secret manager.
The backend image is non-root and multi-stage; the frontend image serves the SPA
and proxies `/api/` to the backend.

Required application settings:

| Setting | Production requirement |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` inside the backend network |
| `DATABASE_URL` | Private PostgreSQL connection URL; require TLS for managed DB |
| `JWT_SECRET` | Secret-manager value, at least 16 characters, never a sample/default |
| `CORS_ORIGIN` | Exact HTTPS origin of the browser frontend |
| `ANTHROPIC_API_KEY` | Secret-manager value; required by production startup |
| `CONTRACT_FILE_RETENTION` | `none`; retained files are blocked until encrypted private object storage exists |
| `RAG_ENABLED` | `false` by default; enable only after legal corpus and pgvector readiness review |
| `EMBEDDING_CACHE_DIR` | Writable persistent cache if RAG is enabled |

### Release Procedure

1. Build and scan the backend and frontend images in CI. Use immutable image
   tags based on the commit SHA; do not deploy `latest`.
2. Provision PostgreSQL with pgvector, private networking, encryption, backups,
   and a least-privilege application role.
3. Configure secrets and the settings above. Do not use the local `.env`
   sample values in an environment reachable by real users.
4. Deploy one backend replica. Startup applies versioned migrations before
   accepting requests; take a database backup before every release that changes
   schema.
5. Put the frontend behind HTTPS ingress, set the exact `CORS_ORIGIN`, and
   confirm the public route cannot reach the database or backend directly.
6. Verify `GET /health` for liveness, `GET /ready` for database readiness,
   registration/login, upload, polling, result ownership, letter generation,
   PDF download, and deletion using synthetic data.
7. Check structured logs and readiness after rollout. Roll back the application
   image if smoke tests fail; restore a database backup only under an approved
   recovery procedure because schema rollback may be destructive.

### Scaling and Operations

- Keep backend replica count at **1**. The analysis worker and classification
  cache are process-local and have no durable job recovery.
- Set ingress request/body limits consistently with the 10 MiB upload cap and
  allow enough time for status polling. Do not buffer contract uploads in
  external logs or observability tooling.
- Configure database backup retention and periodically test a restore to a
  separate environment. Monitor disk usage, DB connections, failed analyses,
  rate-limit responses, and provider availability.
- Do not enable 7-day or 30-day file retention: production configuration fails
  closed because the private encrypted storage adapter and expiry lifecycle
  have not been implemented.
- If RAG is enabled, budget storage for the local embedding model and preserve
  it across backend restarts. RAG startup must not be considered ready until
  migrations and legal-provision seeding are complete.

## Not Yet Automated

Cloud resource provisioning, public DNS/TLS certificates, secret-manager
integration, managed database creation, artifact publication, and hosted
deployment require a selected provider and authorized account. No deployment
pipeline or public deployment URL is configured in this repository.
