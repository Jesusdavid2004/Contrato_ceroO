# gRPC Clause Analysis Service

Internal service over HTTP/2 (`@grpc/grpc-js` + `@grpc/proto-loader`).
Not exposed publicly. Express calls it through `ClauseAnalysisGrpcClient`.

## Status (Phase B3 verdict)

The service is **implemented, tested, and documented, but NOT wired into the
production analysis path**: `AnalyzeContractUseCase` calls the configured
`AIProvider` directly, and `startGrpcServer` is never invoked by `server.ts`.
This is deliberate for now — the rule-based demo scoring inside the gRPC
server must not silently replace the neural/hosted providers in production.

Adoption path (not yet done): start the server with a supervised port,
inject `ClauseAnalysisGrpcClient` into the analysis flow behind a feature
flag, and compare its output against the `AIProvider` result before promoting
it beyond diagnostics and contract demos.

## Proto

`proto/clause_analysis.proto` defines `ClauseAnalysisService`:

- `AnalyzeClause(AnalyzeClauseRequest) -> AnalyzeClauseResponse`
- `BatchAnalyze(BatchAnalyzeRequest) -> BatchAnalyzeResponse`
- `HealthCheck(HealthCheckRequest) -> HealthCheckResponse`

Enums: `RiskLevel` (LOW/MEDIUM/HIGH), `ClauseCategory`
(TERMINATION/FINANCIAL/OBLIGATIONS/RIGHTS/TEMPORAL/OTHER).

## Server

`backend/src/infrastructure/grpc/ClauseAnalysisGrpcServer.ts`:

- `createGrpcServer()` with auth interceptor (service token in metadata,
  `HealthCheck` bypassed).
- Validation errors map to `INVALID_ARGUMENT`, transport failures to
  `INTERNAL`, 15s deadline on client calls.
- Deterministic rule-based scoring (hash of text + provision, no `Math.random`)
  so tests are reproducible. Production clause decisions still come from the
  AI provider pipeline; this service is the internal orchestration transport.

## Client

`backend/src/infrastructure/grpc/ClauseAnalysisGrpcClient.ts`:

- `analyzeClause()` / `batchAnalyze()` with `authorization: Bearer <GRPC_INTERNAL_TOKEN>`.
- Deadline enforced at 15s; errors logged without contract text.

## Config

| Variable | Default | Purpose |
|---|---|---|
| `GRPC_PORT` | `50051` | Internal bind port |
| `GRPC_INTERNAL_TOKEN` | `dev-internal-token` | Service-to-service token |

Set a random `GRPC_INTERNAL_TOKEN` per environment via the secret manager.
Never expose the gRPC port publicly; keep one backend replica while the
analysis worker remains in-process.

## Tests

- `backend/test/grpc-clause-analysis.test.ts`: validation, batch limits,
  auth rejection, health check, deterministic scoring.
- Run: `npm test -- grpc-clause-analysis` from `backend/`.
