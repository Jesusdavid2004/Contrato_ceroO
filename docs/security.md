# Security Notes

**Status:** implementation notes for Phase 10; this is not an independent
penetration test or a legal compliance certification.

## Existing Controls

- Helmet response headers, a configured CORS allowlist, bearer access-token
  authentication, password hashing with bcrypt, and httpOnly refresh cookies.
- Authentication, upload, and AI-letter routes have request rate limits.
- Uploads are checked by binary magic bytes and limited to 10 MiB. Contract and
  letter routes enforce ownership before returning user data.
- Database access uses parameterized PostgreSQL queries. Centralized API errors
  return a code and translation key rather than provider stack traces.
- The production backend requires an explicitly configured JWT secret, CORS
  origin, and Anthropic API key. It rejects non-ephemeral file retention.
- Nginx sets `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`.
  The deployment ingress must enforce HTTPS and HSTS.

## Production Blockers and Residual Risks

1. **No public production deployment exists yet.** No provider, domain,
   subscription, secret store, or managed database was supplied. Do not infer
   that local Compose is production infrastructure.
2. **Private encrypted object storage is not implemented.** Production startup
   therefore rejects `CONTRACT_FILE_RETENTION=7d|30d`; keep
   `CONTRACT_FILE_RETENTION=none`. Development local-file retention does not
   have an automated expiry lifecycle and must not be used for real contracts.
3. **The analysis queue is in process.** Jobs can be lost on restart and are
   not shared by replicas. Deploy one backend replica only until a durable
   queue, retry policy, and shared idempotency mechanism are implemented.
4. **Browser access tokens are stored in local storage.** This increases
   exposure if a future cross-site scripting defect is introduced. Avoid
   untrusted script injection and treat migration to memory-only access tokens
   as a remaining auth-hardening task.
5. **Hard-delete behavior for retained local files is not production-ready.**
   The production retention guard avoids this code path for real deployments;
   implement and test a storage-key lifecycle before enabling retained uploads.
6. **Database TLS and operations depend on deployment configuration.** Use a
   managed PostgreSQL service with TLS, private networking, automated backups,
   restore drills, and a least-privilege database identity.
7. **Legal and AI quality are not certified.** The offline evaluation uses
   synthetic examples and does not measure a hosted model or constitute legal
   advice. Review legal source currency and AI outputs before production use.

## Deployment Security Checklist

- Terminate HTTPS at a managed ingress/reverse proxy, redirect HTTP to HTTPS,
  set HSTS there, and expose no direct public route to PostgreSQL or backend.
- Set `NODE_ENV=production`, a unique random `JWT_SECRET`, the exact frontend
  origin in `CORS_ORIGIN`, a production database URL/password, and
  `ANTHROPIC_API_KEY` using the platform's secret manager.
- Leave `CONTRACT_FILE_RETENTION=none`; do not put real contract data into the
  demo account or logs.
- Keep `RAG_ENABLED=false` until pgvector availability, reviewed legal corpus,
  and model-cache volume capacity are confirmed.
- Restrict database ingress to the backend network. Encrypt backups and test
  restores before accepting user documents.
- Keep one backend replica; alert on failed readiness probes, database
  connection failures, failed analysis statuses, and AI provider errors.
- Rotate any secret that has ever been committed, pasted into a command, or
  placed in a publicly accessible artifact.
