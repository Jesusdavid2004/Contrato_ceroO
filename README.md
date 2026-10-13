# ContratoClaro

ContratoClaro helps tenants, consumers, and employees understand risky terms
in contracts and prepare a respectful objection letter. It provides general
information, **not legal advice**.

## Quick Start

Requirements: Docker Engine with Compose v2. Node.js 22 is required to run the
repository checks outside the containers.

1. Copy the local environment template and set unique local passwords:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env`: set `DB_PASSWORD`, `JWT_SECRET`, and
   `DEMO_USER_PASSWORD` (at least 12 characters). These values are for local
   development only.
2. Build and start PostgreSQL, backend, and frontend:

   ```powershell
   docker compose up --build -d
   ```

3. Wait until the services are healthy, then create synthetic demo data:

   ```powershell
   docker compose ps
   docker compose exec backend node dist/scripts/seed-demo.js
   ```

4. Open `http://localhost:8080` and sign in with the demo credentials from
   `.env`.

The demo seed is development-only, idempotent, and does not create or store an
original contract file. See [the live demo script](./docs/demo-script.md).

## Features

- Register and sign in; upload PDF, PNG, or JPEG contract documents.
- Track asynchronous analysis status and inspect ordered clauses with low,
  medium, or high risk explanations.
- Generate and edit a letter based on medium/high-risk clauses; download it as
  a localized PDF.
- View contract history, delete a contract, and permanently delete an account.
- Switch English/Spanish and light/dark/system themes.
- Optional Colombian legal-context retrieval with pgvector; it is disabled by
  default and is not a substitute for checking official legal sources.

## Architecture and Documentation

- [Architecture and Mermaid diagrams](./docs/architecture.md)
- [Deployment guide and current deployment status](./docs/deployment.md)
- [API overview](./docs/api.md) and [OpenAPI 3.1 contract](./docs/openapi.yaml)
- [Security notes and production blockers](./docs/security.md)
- [Demo walkthrough](./docs/demo-script.md)
- [Offline evaluation and limitations](./docs/evaluation.md)
- [Runtime validation evidence](./docs/runtime-validation-report.md)
- [Architecture discovery diagrams](./.github/modernize/assessment/engines/facts/architecture-diagram.md)
- [Architecture decision records](./docs/adr/)
- [Changelog](./CHANGELOG.md)

There is **no public HTTPS deployment URL yet**. A cloud provider, authorized
account/subscription, domain, managed database, and secret store must be chosen
before provisioning production infrastructure. Local Compose is not a
production deployment.

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, i18next |
| Backend | Node.js 22, Express 5, TypeScript |
| Database | PostgreSQL 15 with pgvector |
| AI | Anthropic SDK in configured environments; deterministic FakeAIProvider for offline demos |
| PDF | PDFKit |
| Tests | Vitest, Supertest, Playwright |
| Containers and CI | Docker Compose, GitHub Actions |

## Configuration

Docker Compose reads the root `.env`; the backend reference is
[backend/.env.example](./backend/.env.example). Never commit `.env` files or
put real contract data or production credentials into the demo environment.

| Variable | Purpose | Local default |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL password | Local-only sample; replace before use |
| `JWT_SECRET` | Signs access and refresh tokens | Local-only sample; replace before use |
| `CORS_ORIGIN` | Exact browser origin allowed by the backend | `http://localhost:8080` |
| `NODE_ENV` | Runtime mode | `development` |
| `ANTHROPIC_API_KEY` | Hosted transcription/classification/letter provider | Empty; FakeAIProvider is used locally |
| `RAG_ENABLED` | Enable legal provision retrieval | `false` |
| `CONTRACT_FILE_RETENTION` | Original upload retention | `none` |
| `DEMO_USER_EMAIL` | Local synthetic demo account | `demo@example.test` |
| `DEMO_USER_PASSWORD` | Local demo password; at least 12 characters | Must be set |

Production additionally requires `DATABASE_URL`, an explicitly set secure
`JWT_SECRET`, an exact HTTPS `CORS_ORIGIN`, and `ANTHROPIC_API_KEY`. Production
startup rejects demo AI and non-ephemeral file retention.

## Validation Commands

From `backend/`:

```powershell
npm ci
npm run type-check
npm test
npm run build
npm run evaluate
```

From `frontend/`:

```powershell
npm ci
npm run lint
npm run i18n:check
npm run build
npm run test:e2e
```

Playwright browser tests stub the API for deterministic UI coverage. Backend
integration tests and the PostgreSQL-backed demo seed provide separate API and
database evidence; see the runtime report for exact scope and gaps.

## Screenshots

No verified application screenshots have been committed yet. The synthetic
demo can be used to capture release screenshots after running the local stack.

## Resumen en español

ContratoClaro ayuda a revisar contratos, entender cláusulas de riesgo y preparar
una carta de objeción editable. La información es general y no constituye
asesoría legal. La demo local usa datos sintéticos; todavía no existe un
despliegue público HTTPS.
