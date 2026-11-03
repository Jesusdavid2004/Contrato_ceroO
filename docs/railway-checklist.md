# Railway Deployment Checklist (copy-paste runbook)

Project: one Railway project, three services from the same GitHub repo
(`Jesusdavid2004/Contrato_ceroO`, branch `main`).

## 0. Prerequisites (local)

- [ ] `git pull origin main` (needs commit `6f5ec5d` or newer: nginx template + dynamic healthchecks).
- [ ] Gemini key ready (optional, enables the hybrid smart tier). Get one at
      https://aistudio.google.com/apikey.

## 1. Database service

1. Railway project > **Add > Database > PostgreSQL**.
2. Open the service > **Variables** tab > copy the **private** `DATABASE_URL`
   (host ends in `.railway.internal`). Save it for step 2.
3. If step 2 migrations ever fail with `extension "vector" does not exist`,
   create a free Neon project instead and use its direct URL
   (`sslmode=require`).

## 2. Backend service

New Service > GitHub Repo > this repo. Settings:

| Field | Value |
|---|---|
| Root Directory | `/backend` |
| Builder | Dockerfile (auto-detected) |
| Healthcheck Path | `/ready` |
| Replicas | 1 (never scale: in-process queue + local AI cache) |

Variables (Variables tab > Raw Editor friendly):

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=<paste private Postgres URL>
JWT_SECRET=<Generate → random value>
CORS_ORIGIN=<paste frontend public URL AFTER step 3, then redeploy>
AI_PROVIDER=local
GEMINI_API_KEY=<optional: your AI Studio key, enables hybrid smart tier>
RAG_ENABLED=false
CONTRACT_FILE_RETENTION=none
```

Volumes: add one mounted at `/app/storage/models` (model cache survives redeploys;
without it, each deploy re-downloads ~500 MB on first analysis).

## 3. Frontend service

New Service > GitHub Repo > this repo. Settings:

| Field | Value |
|---|---|
| Root Directory | `/frontend` |
| Builder | Dockerfile (auto-detected) |
| Healthcheck Path | `/` |
| Replicas | 1 |

Variables (adjust `backend` if your backend service is named differently):

```env
BACKEND_HOST=${{backend.RAILWAY_PRIVATE_DOMAIN}}
BACKEND_PORT=${{backend.PORT}}
```

Then **Networking > Generate Domain** (public HTTPS URL, e.g.
`https://contratoclaro-web.up.railway.app`). No `VITE_API_URL` needed:
Nginx proxies same-origin `/api/*` to the backend.

## 4. Close the loop

1. Backend > Variables: set `CORS_ORIGIN` to the exact frontend public URL
   (no trailing slash) > redeploy backend.
2. Verify: `GET https://<backend>/ready` → `{"status":"ready","provider":"local"}`
   (or `"local+gemini"` with a key configured).
3. Open the frontend URL, **register a new user from the UI**
   (the demo seed refuses to run in production by design), upload a contract,
   wait for READY, generate the letter, download the PDF, delete the contract.

## 5. Operate

- First analysis after a deploy/cold start downloads AI models (minutes);
  afterwards it is seconds. The 10-minute frontend polling cap covers it.
- Keep `RAG_ENABLED=false` until a reviewed legal corpus is seeded.
- Keep 1 replica per service. Watch trial-credit usage before the allowance ends.
- Never commit `.env` files; rotate any secret that was ever pasted in chat.
