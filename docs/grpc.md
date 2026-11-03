# gRPC Clause Analysis Service

Internal service over HTTP/2 (`@grpc/grpc-js` + `@grpc/proto-loader`).
Not exposed publicly. Express calls it through `ClauseAnalysisGrpcClient`.

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
