# Architecture Diagram

This document summarizes the deployed runtime boundaries and the most important component dependencies in the existing ContratoClaro application.

## Application Architecture

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    Browser["Web browser"]
    subgraph WebTier["Web tier - React and Nginx"]
        Frontend["React SPA"]
        Nginx["Nginx static server and API proxy"]
    end
    subgraph ApiTier["API tier - Node.js and Express 5"]
        Express["Express API"]
        Worker["In-process analysis worker"]
    end
    subgraph DataTier["Data tier"]
        Pg[("PostgreSQL 15 with pgvector")]
        LocalModels["Local embedding model"]
    end
    Anthropic["Anthropic API when configured"]

    Browser -->|"loads"| Nginx
    Nginx -->|"serves"| Frontend
    Frontend -->|"same-origin requests"| Nginx
    Nginx -->|"proxies /api"| Express
    Express -->|"persists records"| Pg
    Express -->|"queues analysis"| Worker
    Worker -->|"stores clauses and results"| Pg
    Worker -->|"AI extraction and classification"| Anthropic
    Worker -->|"RAG embeddings when enabled"| LocalModels
    LocalModels -->|"vector search"| Pg
```

### Technology Stack Summary

| Layer | Technology | Version | Purpose |
|---|---|---:|---|
| Web | React, TypeScript, Vite | React 19, Vite 8 | Bilingual responsive SPA |
| Web serving | Nginx | Alpine image | Static assets and same-origin API reverse proxy |
| API | Node.js, Express | Node 22, Express 5 | Authenticated versioned API and in-process worker |
| Persistence | PostgreSQL with pgvector | PostgreSQL 15 | Accounts, contracts, clauses, letters, usage, optional legal vectors |
| AI | Anthropic SDK or FakeAIProvider | SDK version in backend package manifest | Document transcription, classification, letters, offline demo |
| PDF | PDFKit | Version in backend package manifest | Localized objection-letter PDF |
| CI | GitHub Actions | Node 22 | Type-check, tests, evaluation, lint, build, browser tests |

### Data Storage & External Services

PostgreSQL stores user records, extracted contract clauses, analysis results,
letters, AI usage, and optional legal provisions. pgvector is required by the
migration set. The browser reaches the API through Nginx on the same origin.
Anthropic is an optional external service in development and is required by
production configuration; RAG uses a local embedding model and PostgreSQL
vector search. Original uploads are configured for ephemeral handling by
default. Production file retention is deliberately rejected until a private,
encrypted object-storage adapter and lifecycle policy exist.

### Key Architectural Decisions

- Clean layers separate Express presentation, application use cases, domain
  entities, and infrastructure adapters; repositories and AI providers are
  consumed through interfaces.
- Analysis is asynchronous to the upload response but runs in a bounded
  in-process worker. The backend must remain at one replica until jobs are
  durable across restarts and replicas.
- Docker Compose is for local demonstration and validation. Production requires
  an external TLS ingress, managed PostgreSQL with backups, secret management,
  and a single backend replica.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart LR
    subgraph Presentation["Presentation"]
        cAuth["Auth routes"]
        cContracts["Contract routes"]
        cMiddleware["Auth, rate limit, error handler"]
    end
    subgraph Application["Application"]
        cSessions["Auth and session use cases"]
        cUpload["Upload contract use case"]
        cAnalysis["Analyze contract use case"]
        cLetters["Letter and PDF use cases"]
        cWorker["In-process worker"]
    end
    subgraph Domain["Domain"]
        cEntities["User, Contract, Clause, Letter"]
        cInterfaces["Repository and AI interfaces"]
    end
    subgraph Infrastructure["Infrastructure"]
        cRepos["PostgreSQL repositories"]
        cProviders["Anthropic and fake AI providers"]
        cExtract["PDF extraction and segmentation"]
        cFiles["Local file storage"]
        cPdf["PDFKit generator"]
    end

    cAuth -->|"dispatches"| cSessions
    cContracts -->|"dispatches"| cUpload
    cContracts -->|"dispatches"| cLetters
    cContracts -->|"enqueues"| cWorker
    cWorker -->|"runs"| cAnalysis
    cSessions -->|"uses"| cInterfaces
    cUpload -->|"uses"| cInterfaces
    cAnalysis -->|"uses"| cInterfaces
    cLetters -->|"uses"| cInterfaces
    cAnalysis -->|"creates"| cEntities
    cInterfaces -->|"implemented by"| cRepos
    cInterfaces -->|"implemented by"| cProviders
    cAnalysis -->|"extracts with"| cExtract
    cUpload -->|"stores with"| cFiles
    cLetters -->|"renders with"| cPdf
    cMiddleware -.->|"protects"| cAuth
    cMiddleware -.->|"protects"| cContracts
```

### Component Inventory

| Component | Layer | Type | Responsibility |
|---|---|---|---|
| `authRoutes.ts` | Presentation | Express router | Registration, login, refresh, logout, profile, account deletion |
| `contractRoutes.ts` | Presentation | Express router | Upload, list, result, status, delete, letter, and PDF endpoints |
| Auth middleware and limiters | Presentation | Middleware | Access-token checks and per-IP/per-user request limits |
| Auth and session use cases | Application | Use cases | Register, authenticate, refresh, and delete account data |
| Upload contract use case | Application | Use case | Validate upload, apply retention adapter, and create contract |
| Analyze contract use case | Application | Pipeline use case | Extract, segment, retrieve optional legal context, classify, and persist |
| Letter use cases | Application | Use cases | Generate, update, and render persisted objection letters |
| In-process analysis worker | Application | Bounded worker | Schedules analysis jobs within one backend process |
| Domain entities and interfaces | Domain | Entities and ports | Lifecycle, risk score, value rules, and adapter contracts |
| PostgreSQL repositories | Infrastructure | Persistence adapters | Map records to domain entities and persist changes |
| AI providers | Infrastructure | Strategy adapters | Anthropic-backed behavior or deterministic offline behavior |
| PDF and file services | Infrastructure | Service adapters | Extract PDF text, segment clauses, store uploads, and render PDFs |
