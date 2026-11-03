# Course Concepts → Code Map

Every item below points at the file and line where the concept is implemented.
Line numbers refer to the current `main` tree.

## Event Loop: Tasks vs Microtasks
- `frontend/src/lib/inp.ts:48` — `demoTaskVsMicrotask()` returns the execution
  order proving microtasks (`queueMicrotask`, `Promise.then`) run before the
  next macrotask (`setTimeout`).
- `frontend/src/lib/fileHash.ts:7,26` — file hashing offloaded with
  `new Worker(...)` + `postMessage`, keeping the main thread free.
- `backend/src/infrastructure/services/InProcessAnalysisWorker.ts:7,30` —
  in-process FIFO queue; each job's promise chain (microtasks) runs with max 2
  concurrent analyses, `.finally()` dequeues the next.

## Rendering pipeline
- `frontend/` (Vite CSR) + `rendering-lab/` (Next.js 15: CSR dashboard, SSR
  pages, SSG guides, ISR glossary, Streaming with Suspense).
- Style/Layout/Paint cost is what the INP observer below measures.

## INP (Interaction to Next Paint)
- `frontend/src/lib/inp.ts:26` — `PerformanceObserver` on `event` entries
  reports `durationMs` (input delay + processing + presentation delay) with
  good/needs-improvement/poor rating at the 200/500 ms thresholds; initialized
  in `frontend/src/main.tsx`.

## Web Workers and `postMessage`
- `frontend/src/workers/fileHash.worker.ts:1,9` — worker receives an
  `ArrayBuffer` via `postMessage`, returns SHA-256 hex (WebCrypto `subtle`).
- `SharedArrayBuffer` is intentionally **not** used: it requires
  cross-origin isolation (COOP/COEP), which this classroom deployment does not
  enable; `postMessage` with transferables covers the need.

## Rendering patterns (CSR/SSR/SSG/ISR/Streaming SSR)
- Implemented side by side in `rendering-lab/`; the main SPA stays CSR while
  `docs/rendering-patterns.md` compares TTFB/FCP/LCP, SEO, and caching per
  pattern. Privacy rule: static pages never touch user contract data.

## Contract-First APIs
- `docs/openapi.yaml` is the single source of truth; `backend/src/app.ts:177`
  serves it as JSON plus interactive Swagger UI (`swagger-ui-express`,
  `backend/src/app.ts:6`). Frontend and backend were aligned to it (e2e mock
  accepts both `/api/*` and `/api/v1/*` aliases).

## End-to-end typing (DB → component)
- `backend/src/domain/entities/Contract.ts` → `toJSON()` →
  `frontend/src/services/contracts.ts:8,49` — Zod schemas are the runtime
  contract and the TypeScript types are inferred from them (`z.infer`), so the
  type cannot drift from the parser.

## Parsing vs validation (Zod)
- `frontend/src/services/contracts.ts:78` — every response goes through
  `schema.safeParse`; failures become `ContractApiError('errors.api_error')`.
  Backend mirrors this with Zod at the boundary (`backend/src/shared/config.ts`,
  `presentation/middleware/validationMiddleware.ts`).

## gRPC (Protobuf + HTTP/2)
- `proto/clause_analysis.proto:10,12` — `ClauseAnalysisService` with
  `AnalyzeClause` / `BatchAnalyze` / `HealthCheck` RPCs and strict enums.
- `backend/src/infrastructure/grpc/ClauseAnalysisGrpcServer.ts` — server with
  metadata auth and 15 s client deadlines; `ClauseAnalysisGrpcClient.ts` —
  typed caller. Phase B3 verdict: implemented and unit-tested, not wired into
  the production path (see `docs/grpc.md`).

## Queues, AI flow, and observability
- Queue + worker: `InProcessAnalysisWorker.ts`; recovery of interrupted jobs:
  `RecoverStuckContractsUseCase.ts` with `errors.analysis_interrupted`.
- AI abstraction: `AIProvider` interface with local (embeddings, zero API),
  free Gemini (JSON mode + Zod + 1 retry), and fake (tests) adapters, combined
  by `TieredAIProvider` (fast local tier + smart hosted tier).
- Logs carry counts/ids, never clause text (`backend/test/log-privacy.test.ts`
  pins this); the client only ever sees `{ code, message_key }`.
