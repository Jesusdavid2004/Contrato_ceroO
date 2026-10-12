# System Audit - ContratoClaro

**Date:** 2026-10-12  
**Audit Type:** Read-Only Baseline Architectural & Security Audit (Phase 0)  
**Standard Reference:** `CLAUDE.md` & Project Specification

---

## 1. Executive Summary

The ContratoClaro codebase currently contains an initial, functional prototype composed of:
1. A **frontend** SPA built with Vite, React 19, TypeScript, Tailwind CSS v4, React Router 7, and react-i18next.
2. A **backend** monolithic service built with Node.js and Express 5 in JavaScript (CommonJS), utilizing in-memory data structures (`Map`), mock clause classification, and basic JWT authentication.
3. A **database** definition (`db_schema.sql`) for PostgreSQL with Spanish naming, unlinked to the backend runtime (a connection pool in `db.js` is defined but unused).
4. A **docker-compose** file containing only the PostgreSQL container.

While the frontend has good visual components and basic routing, the backend currently diverges significantly from the engineering standards defined in `CLAUDE.md` (Clean Architecture, TypeScript, versioned migrations, secure auth, robust file validation, and real AI integration).

---

## 2. Current Architecture & Component Inventory

### 2.1 Backend (`/backend`)
* **Runtime & Language:** Node.js, plain JavaScript (CommonJS), single entrypoint (`index.js`).
* **Dependencies:**
  * Web/HTTP: `express` (v5.2.1), `cors`, `helmet`
  * Auth: `bcrypt`, `jsonwebtoken`
  * Uploads/Files: `multer` (in-memory storage), `pdf-parse`
  * Database: `pg` (v8.23.1), `dotenv`
* **Current Endpoints:**
  * `GET /api/health` — Basic liveness probe.
  * `POST /api/auth/register` — In-memory user registration.
  * `POST /api/auth/login` — In-memory credential verification with bcrypt.
  * `GET /api/auth/me` — Protected route returning user payload from Bearer token.
  * `POST /api/contracts/analyze` — Multipart file upload (`contract`). Extracts text via `pdf-parse` (or mocked OCR text for images), runs simulated clause analysis with `setTimeout`, computes an arbitrary additive risk score, and stores in an in-memory `Map`.
  * `GET /api/contracts` — Returns list of analyzed contracts for the authenticated user from memory.
  * `DELETE /api/contracts/:id` — Deletes contract from memory with basic ownership check.
* **Testing:** No test runner or test suite configured (`scripts.test` is a stub).

### 2.2 Frontend (`/frontend`)
* **Runtime & Framework:** React 19, Vite 8, TypeScript (strict mode enabled in `tsconfig.json`).
* **Styling & UI:** Tailwind CSS v4 (`@tailwindcss/vite`), CSS custom properties for theming, Lucide React icons, Framer Motion animations.
* **Routing:** React Router DOM v7 (`BrowserRouter` in `App.tsx` with `ProtectedRoute`).
* **State & Data Fetching:** Direct `fetch` invocations in `AuthContext` and page components. No TanStack Query or Zod validation schemas.
* **i18n:** `i18next` + `react-i18next` with `en.json` and `es.json`.
* **Tooling:** Oxlint configured. No Prettier, Vitest, Testing Library, or Playwright.

### 2.3 Database & Infrastructure
* **Containerization:** `docker-compose.yml` launches only `postgres:15-alpine`. Backend and frontend services are not orchestrated in docker-compose.
* **Schema:** `backend/db_schema.sql` defines tables: `usuario`, `contrato`, `clausula`, `carta_objecion`.
* **Database Driver:** `backend/db.js` creates a `pg.Pool`, but it is completely bypassed by `index.js`. No migrations tool is installed.

---

## 3. Gaps Analysis vs. `CLAUDE.md` and Specification

| Area | Current Implementation | Standard Requirement (`CLAUDE.md`) | Gap Status |
| :--- | :--- | :--- | :--- |
| **Language & Naming** | DB schema and columns in Spanish (`usuario`, `contrato`, `clausula`, `carta_objecion`). | ALL code, identifiers, DB columns, routes, files in English. User-facing text in i18n. | **Non-compliant** |
| **Backend Architecture** | Single monolithic `index.js` file (~228 lines) holding routes, mock logic, and in-memory state. | Layered Clean Architecture: `domain/`, `application/`, `infrastructure/`, `presentation/`, and composition root (`container`). | **Non-compliant** |
| **Backend Language** | Plain JavaScript (CommonJS). | TypeScript strict mode. | **Non-compliant** |
| **Database Persistence** | In-memory `Map` for users and contracts. `db.js` is disconnected. | PostgreSQL persistence with versioned migrations (`node-pg-migrate`), parameterized queries via repository pattern. | **Non-compliant** |
| **Schema Completeness** | Missing contract type, jurisdiction, locale, processing status, risk details, JSONB legal basis, AI usage, vector embeddings. | Complete domain model: contracts (`type`, `jurisdiction`, `status`, `global_risk_score`), clauses (`confidence`, `why_risky`, `legal_basis` JSONB, `suggested_change`), `ai_usage`, `legal_provisions`. | **Non-compliant** |
| **Risk Calculation** | Ad-hoc calculation: `high += 25`, `medium += 10`, capped at 100. | Standard domain formula: `round(100 * (3*high + medium) / (3 * totalClauses))`. | **Non-compliant** |
| **AI Integration** | Hardcoded mock generator with `setTimeout(1500)`. | `AIProvider` interface with Anthropic SDK, `FakeAIProvider` for tests/offline, batched clause classification (up to 8), Zod structured output, low-confidence re-checks, prompts in separate versioned files. | **Non-compliant** |
| **Analysis Pipeline** | Synchronous endpoint (`POST /api/contracts/analyze`). | Asynchronous pipeline with in-process worker, status polling (`/contracts/:id/status`), text extraction + OCR fallback, regex/AI segmentation. | **Non-compliant** |
| **Objection Letter** | Not implemented on backend or frontend. | Generation endpoint, editable preview, placeholder replacement, and localized PDF export. | **Non-compliant** |
| **Authentication & Tokens** | Single 7-day JWT returned in JSON body and stored in `localStorage`. | Short-lived access token + rotating refresh token in `httpOnly`, `secure`, `SameSite` cookies. `POST /auth/refresh`, `POST /auth/logout`, `DELETE /me`. | **Non-compliant** |
| **Error Handling** | Generic `{ error: string }`. | Centralized handler mapping typed exceptions to `{ code, message_key, details? }`. | **Non-compliant** |
| **Frontend Architecture** | Direct `fetch()` inside components and context; no response validation. | Feature-based organization, TanStack Query for server state, Zod response validation, `api-client.ts` as single HTTP gateway. | **Non-compliant** |
| **DevOps & CI** | Only Postgres in docker-compose; no Dockerfiles; no GitHub Actions workflow. | Multi-service docker-compose (db, backend, frontend), Dockerfiles, CI with lint, type-check, tests, i18n checks. | **Non-compliant** |
| **Testing** | No tests in frontend or backend. | Unit tests (domain/application >= 70% coverage), integration tests against test DB, Playwright e2e, security injection fixtures. | **Non-compliant** |

---

## 4. Security Findings & Risks

1. **In-Memory Volatility & Absence of Persistence:**
   * User accounts and contract data exist solely in Node.js process memory. Restarting or crashing the container wipes all records.
2. **Insecure Token Storage:**
   * Tokens stored in browser `localStorage` are vulnerable to Cross-Site Scripting (XSS).
   * No refresh token rotation or revocation mechanism.
3. **Weak File Upload Validation:**
   * File validation only inspects `file.mimetype` provided by the client header, vulnerable to MIME-spoofing. Magic bytes inspection is missing.
   * File retention policy is not implemented: original files remain in memory or storage without retention flags (`CONTRACT_FILE_RETENTION=none|7d|30d`).
4. **Lack of Rate Limiting:**
   * No rate limiting on authentication (`/api/auth/*`), uploads, or analysis endpoints, leaving the server vulnerable to brute-force and Denial-of-Service.
5. **Permissive CORS:**
   * `app.use(cors())` allows requests from any origin rather than restricting to the configured frontend origin.
6. **Hardcoded Fallback Secrets:**
   * `JWT_SECRET` defaults to `'contratoclaro-dev-secret-change-in-prod'` if the environment variable is omitted.

---

## 5. Proposed Order of Work (Phased Implementation Plan)

Following `CLAUDE.md` Section 10 and the project prompt:

* **Phase 0 (Current):** System Audit (`docs/audit.md`) & Baseline Validation. *(Stop and request user confirmation)*.
* **Phase 1: Tooling, Safety Net & Environment Setup:**
  * Configure TypeScript in backend (`allowJs: true` for incremental migration).
  * Configure testing framework (Vitest, Supertest, testing libraries) and write characterization tests pinning current endpoints (`/api/health`, `/api/auth/register`, `/api/auth/login`, `/api/contracts/analyze`).
  * Add Prettier, set up `npm run i18n:check`, and define GitHub Actions CI workflow.
  * Complete `docker-compose.yml` with backend and frontend services.
* **Phase 2: Database Migrations & Clean Architecture Refactor:**
  * Set up `node-pg-migrate` and migrate `db_schema.sql` into standardized English migrations (`users`, `contracts`, `clauses`, `objection_letters`, `ai_usage`, `legal_provisions`).
  * Implement Domain layer (`User`, `Contract`, `Clause`, `RiskScore`, domain exceptions, formula tests).
  * Implement centralized error handler `{ code, message_key, details }` and validated environment configuration.
* **Phase 3: Auth Hardening & Upload Pipeline:**
  * Implement secure authentication with httpOnly cookie refresh tokens, password hashing, and rate limiting.
  * Build upload pipeline with magic byte validation, size limits (10MB, 40 pages), and configurable privacy retention (`none|7d|30d`).
* **Phase 4: Text Extraction & Clause Segmentation:**
  * PDF extraction via `pdf-parse` with character density validation; OCR image fallback.
  * Clause segmenter with regex-first strategy and AI segmentation fallback with test fixtures.
* **Phase 5: AI Integration:**
  * `AIProvider` interface with Anthropic Claude SDK adapter and deterministic `FakeAIProvider`.
  * Prompts in `src/infrastructure/ai/prompts/`. Batched classification (up to 8 clauses), Zod schema validation with retry, quota tracking, and cache.
* **Phase 6: Legal RAG (Feature-Flagged):**
  * `pgvector` migration, legal provision seeding script for jurisdictions (e.g. Colombia), retrieval adapter.
* **Phase 7: Objection Letter & Localized PDF:**
  * Objection letter generation use case (filtered to HIGH/MEDIUM clauses).
  * Localized PDF generation.
* **Phase 8: Frontend Evolution:**
  * Refactor to feature structure with `api-client.ts`, TanStack Query, and Zod response validation.
  * Update UI: contract upload with progress, highlighted clauses with risk badges, objection letter preview and editor, history, language/theme persistence without flash.
* **Phase 9: End-to-End, Security & Evaluation Testing:**
  * Playwright E2E tests, prompt-injection defense verification tests, evaluation dataset and metrics in `docs/evaluation.md`.
* **Phase 10: Final Documentation, Architecture Diagrams & Release:**
  * Mermaid diagrams, Architecture Decision Records (`docs/adr/`), OpenAPI documentation, README update, and release tag `v1.0.0`.

---
