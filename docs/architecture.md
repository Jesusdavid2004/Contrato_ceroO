# ContratoClaro Architecture

ContratoClaro is a bilingual React SPA backed by an Express API and PostgreSQL. Contract analysis is queued in-process; the API persists extracted clauses and risk results, and generates objection letters from flagged clauses.

## System Context

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    sUser["Tenant, consumer, or employee"]
    sBrowser["Web browser"]
    sNginx["Nginx frontend and API reverse proxy"]
    sReact["React SPA"]
    sApi["Express API"]
    sWorker["In-process analysis worker"]
    sDb[("PostgreSQL 15 with pgvector")]
    sAnthropic["Anthropic API when configured"]
    sLocalModel["Local embedding model when RAG is enabled"]

    sUser -->|"uses"| sBrowser
    sBrowser -->|"loads"| sNginx
    sNginx -->|"serves static assets"| sReact
    sReact -->|"same-origin API requests"| sNginx
    sNginx -->|"proxies /api"| sApi
    sApi -->|"persists users, contracts, and results"| sDb
    sApi -->|"queues analysis in process"| sWorker
    sWorker -->|"reads and writes analysis data"| sDb
    sWorker -->|"classification, extraction, and letters"| sAnthropic
    sWorker -->|"embeds legal context"| sLocalModel
    sLocalModel -->|"retrieves provisions"| sDb
```

### Deployment Context

The local Docker Compose topology contains a PostgreSQL/pgvector database, the
Express backend, and an Nginx-served React frontend. The frontend proxies API
traffic on the same origin. A production installation must place a TLS-enabled
reverse proxy or managed ingress in front of the frontend and keep the database
and backend off the public network.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart LR
    subgraph cPresentation["Presentation"]
        cAuthRoutes["Auth routes"]
        cContractRoutes["Contract routes"]
        cMiddleware["Auth, rate-limit, and error middleware"]
    end
    subgraph cApplication["Application"]
        cAuthCases["Auth and session use cases"]
        cUploadCase["Upload use case"]
        cAnalysisCase["Analysis use case"]
        cLetterCases["Letter and PDF use cases"]
        cWorker["In-process analysis worker"]
    end
    subgraph cDomain["Domain"]
        cEntities["User, Contract, Clause, Letter"]
        cPorts["Repository and provider interfaces"]
    end
    subgraph cInfrastructure["Infrastructure"]
        cPostgres["PostgreSQL repositories"]
        cAI["Anthropic or Fake AI provider"]
        cExtract["PDF extraction and segmentation"]
        cStorage["Local file storage"]
        cPdf["PDFKit generator"]
        cLogger["Structured JSON logger"]
    end

    cAuthRoutes -->|"dispatches"| cAuthCases
    cContractRoutes -->|"dispatches"| cUploadCase
    cContractRoutes -->|"dispatches"| cLetterCases
    cContractRoutes -->|"queues"| cWorker
    cWorker -->|"runs"| cAnalysisCase
    cAnalysisCase -->|"uses"| cEntities
    cAuthCases -->|"uses"| cPorts
    cUploadCase -->|"uses"| cPorts
    cAnalysisCase -->|"uses"| cPorts
    cLetterCases -->|"uses"| cPorts
    cPorts -->|"implemented by"| cPostgres
    cPorts -->|"implemented by"| cAI
    cAnalysisCase -->|"extracts and segments with"| cExtract
    cUploadCase -->|"stores through"| cStorage
    cLetterCases -->|"renders with"| cPdf
    cMiddleware -.->|"wraps routes"| cAuthRoutes
    cMiddleware -.->|"wraps routes"| cContractRoutes
    cWorker -.->|"reports failures to"| cLogger
```

### Main AI Analysis Flow

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    qUser["Authenticated user uploads PDF or image"]
    qValidate["Validate size and file magic bytes"]
    qPersist["Persist contract as UPLOADED"]
    qQueue["Enqueue in process analysis job"]
    qExtract["Extract PDF text or request image transcription"]
    qSegment["Segment clauses in document order"]
    qContext["Optionally retrieve up to three legal provisions per clause"]
    qClassify["Classify clause batches of up to eight"]
    qConfidence["Confidence below 0.6"]
    qRecheck["Recheck uncertain clauses with smart model"]
    qSave["Persist clauses and calculate risk score"]
    qReady["Mark contract READY"]
    qFailed["Mark contract FAILED with message key"]

    qUser -->|"multipart request"| qValidate
    qValidate -->|"accepted"| qPersist
    qPersist -->|"returns contract id"| qQueue
    qQueue --> qExtract
    qExtract --> qSegment
    qSegment --> qContext
    qContext --> qClassify
    qClassify --> qConfidence
    qConfidence -->|"yes"| qRecheck
    qConfidence -->|"no"| qSave
    qRecheck --> qSave
    qSave --> qReady
    qValidate -->|"invalid input"| qFailed
    qExtract -->|"unrecoverable failure"| qFailed
    qClassify -->|"provider failure"| qFailed
```

### Entity Relationship Diagram

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    eUsers[("users")]
    eContracts[("contracts")]
    eClauses[("clauses")]
    eLetters[("objection_letters")]
    eUsage[("ai_usage")]
    eLegal[("legal_provisions")]
    eUsers -->|"one user owns many contracts"| eContracts
    eContracts -->|"one contract has many clauses by contract_id"| eClauses
    eContracts -->|"one contract may have many letter versions"| eLetters
    eUsers -->|"one user has many usage records by user_id"| eUsage
    eLegal -->|"retrieved by jurisdiction and vector similarity"| eContracts
```

The data relationship diagram is intentionally a flowchart rather than a
crow-foot ER notation so that entity ownership and foreign-key direction remain
readable in GitHub's Mermaid renderer.

## Architectural Boundaries and Limits

- Presentation routes validate HTTP input and dispatch use cases; application
  use cases own orchestration and authorization; domain entities own risk
  scoring and lifecycle rules; infrastructure contains PostgreSQL, AI,
  extraction, storage, and PDF adapters.
- Repository and AI interfaces keep application logic independent of concrete
  PostgreSQL and Anthropic SDKs. `FakeAIProvider` supports deterministic demos.
- The worker and classification cache are process-local. Run exactly one
  backend replica until work is moved to a durable queue and shared cache.
- Production startup rejects the deterministic demo provider and non-ephemeral
  contract retention. Encrypted private object storage is not implemented yet.
