# Deployment Guide

Step-by-step Railway runbook (recommended path, verified against the repo):
[`railway-deployment-guide.md`](./railway-deployment-guide.md).

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
   docker compose exec -e SEED_DEMO=true backend node dist/scripts/seed-demo.js
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
| `GEMINI_API_KEY` | Optional free-tier secret; empty = local-only, no external calls |
| `AI_PROVIDER` | Explicit provider: `gemini` (needs its key), `local` (default blueprint, no API), never `fake` in production. Empty = hybrid: local classifies, Gemini (if keyed) refines + writes |
| `CONTRACT_FILE_RETENTION` | `none`; retained files are blocked until encrypted private object storage exists |
| `RAG_ENABLED` | `false` by default; enable only after legal corpus and pgvector readiness review |
| `EMBEDDING_CACHE_DIR` | Writable persistent cache if RAG is enabled |

### Free Tier: Render + Neon

[render.yaml](../render.yaml) defines the backend (Docker web service) and the
frontend (static site that rewrites `/api/*` to the backend). Steps:

1. In Neon, create a project (PostgreSQL 15+) and copy the **direct**
   (non-pooled) connection string; it must include `sslmode=require`. The
   migrations run `CREATE EXTENSION vector`, which Neon supports.
2. In Render, choose New > Blueprint and select this repository.
3. Set the prompted secrets on `contratoclaro-api`: `DATABASE_URL` (Neon),
   `GEMINI_API_KEY` (free tier, optional — enables the hosted smart tier), and
   `CORS_ORIGIN` (the HTTPS URL of `contratoclaro-web`).
   `JWT_SECRET` is generated automatically.
4. If Render adds a suffix to the service name, update the rewrite destination
   in `render.yaml` to the real backend URL and redeploy the frontend.
5. Verify `https://<api>/ready` returns 200 and register a user from the site.

Limits: the free backend sleeps after inactivity (the first request can take
about 30 seconds), has 512 MB RAM (so keep `RAG_ENABLED=false`), and the
in-process worker requires a single instance. Migrations run on each start.

### Railway: backend + frontend + Postgres (recommended demo path)

Railway builds both Dockerfiles straight from this repo — no config file
needed. Create one project with three services (all from the same GitHub
repo), then wire them with private networking:

1. **Database:** Add > PostgreSQL plugin. Copy its `DATABASE_URL`
   (use the *private* one for the backend). The migrations run
   `CREATE EXTENSION vector`: if the managed Postgres rejects it, point
   `DATABASE_URL` at a Neon project instead (same requirement as above).
2. **Backend:** New > GitHub Repo > this repo, root directory `/backend`
   (Dockerfile detected automatically). Set variables:
   - `DATABASE_URL` = the Postgres private URL.
   - `JWT_SECRET` = Generate (Railway random value).
   - `CORS_ORIGIN` = the exact HTTPS URL from step 4 (update after first deploy).
   - `AI_PROVIDER` = `local` (downloads models on first analysis), or leave
     empty for the hybrid local + Gemini mode with `GEMINI_API_KEY` set.
   - Keep `NODE_ENV=production`, `RAG_ENABLED=false`,
     `CONTRACT_FILE_RETENTION=none`. Do not set `SEED_DEMO`.
   - Health check path: `/ready`.
3. **Model cache (recommended):** add a Railway volume mounted at
   `/app/storage/models` on the backend service, so downloaded AI models
   survive redeploys (otherwise each deploy re-downloads ~500 MB on the
   first analysis).
4. **Frontend:** New > GitHub Repo > this repo, root directory `/frontend`
   (Dockerfile detected automatically). Set variables:
   - `BACKEND_HOST` = `${{backend.RAILWAY_PRIVATE_DOMAIN}}` (replace
     `backend` with your backend service name if different).
   - `BACKEND_PORT` = `${{backend.PORT}}`.
   - No `VITE_API_URL` is needed: the Nginx frontend proxies same-origin
     `/api/*` to the backend, so no CORS preflights occur.
   - Health check path: `/`. Generate a public domain for this service.
5. Set backend `CORS_ORIGIN` to the frontend public domain and redeploy.
6. Verify `GET /ready` on the backend (`{"status":"ready"}`) and register a
   user in the frontend. The demo account is created through the UI in
   production (the seed script refuses to run outside development).

Constraints: keep exactly **1 replica** per service (in-process queue and
AI cache are not shared); the first analysis after a cold start downloads
models — expect minutes, then seconds. Trial credits cover a class demo;
watch usage before the free allowance runs out.

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
