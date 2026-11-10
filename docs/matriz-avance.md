# Matriz de avance — instrucción OpenCode (rama feat/realtime-jobs)

Relacion requisito → repo → commit → prueba. Solo hechos verificados;
lo no ejecutado va en Pendientes. Repos: `Contrato_ceroO` = backend,
`Contrato_cero_fronent` = frontend.

## Backend — fase 1 (tiempo real)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Definir API antes de pantallas (OpenAPI + protocolo) | Hecho | `985e0e2` | `openapi.yaml` parsea (17 paths); `docs/websocket-protocol.md` |
| Transporte unico: `ws` en Express, sin SSE/gRPC nuevo | Hecho | `76280bb` | `type-check` + `build` pasan |
| Esquema Zod del protocolo (envelope, cliente/servidor) | Hecho | `223254c` + `3d66d72` | `realtime-progress.test.ts` (parse en cada mensaje) |
| Ticket de un solo uso via HTTP autenticado | Hecho | `fe8f89d` | 401 sin Bearer; reuso → 401 en upgrade |
| Servidor WS: Origin, heartbeat, limites, bufferedAmount | Hecho | `220ee61` + `cf23eeb` | Origen malo → 403; ping → pong; subscription limit |
| Bus en memoria + secuencia por contrato | Hecho | `87f47dc` | Orden y secuencia 0,1 en test dedicado |
| Worker/rutas publican tras commit (sin bloquear) | Hecho | `4f2d3f5` | Evento UPLOADED en upload real |
| Outbox Postgres + reintentos + recuperacion | Hecho (codigo) | `e83253c` | Sin PG real; migracion `...006` pendiente de `migrate:up` |
| Cierre de sockets al borrar cuenta | Hecho | `4f2d3f5` | Cierre `4401` en test |

## Backend — fase 2 (contexto, evidencia, staging)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Politica de cobertura (experimental CO+LEASE, resto unsupported, version) | Hecho | `91e9fab` | `coverage-policy.test.ts` 3/3 |
| Contexto en contrato (rol, cobertura, version) + frontera Zod | Hecho | `10420ee` | `contract-context.test.ts` 5/5 |
| Persistencia contexto en Postgres + migracion `...007` + OpenAPI | Hecho (codigo) | `095dff5` | Smoke de migracion; PG real pendiente |
| Evidencia: offsets del segmentador, nulos honestos, migracion `...008` | Hecho (codigo) | `9e5d4b2` | `contract-evidence.test.ts` 4/4; PG pendiente |
| Staging cifrado con TTL (AES-GCM, purga, llave por env) | Hecho | `beb8bab` | `analysis-staging.test.ts` 5/5 |
| Staging en subida/worker/borrado + `errors.staging_expired` | Hecho | `243a48c` + frontend `01dd4d0` | `analysis-staging-wiring.test.ts` 3/3 |

## Backend — fase jobs (cola durable)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Cola en PG con leases, idempotencia y reintentos | Hecho | `f323105` + `b87ef98` | `analysis-jobs.test.ts` 4/4; migracion `...013` en PG real |
| Runner (done/reintento/terminal/cancelacion, sin resurreccion) | Hecho | `c00fe36` + `2345b8a` | `analysis-job-runner.test.ts` 4/4 |
| Cableado ruta/borrado + retiro del worker en memoria | Hecho | `f2b2d96` + `c00fe36` | Suite 189/189 |
| Roundtrip PG de la cola | Hecho | este ciclo | `analysis-jobs-pg.test.ts` 3/3 real |
| Suite backend | Verde | — | 189/189 (+9 PG condicionales) |

## Backend — fase 5 (cobertura conductual y revision)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Migraciones `...006`–`...012` ejecutadas en PG 15 local | Hecho | `217a323` | `postgres-roundtrip.test.ts` 6/6 real |
| Bloqueo fuera de cobertura (sin IA/cuota, staging limpio, RAG omitido) | Hecho | `50a71c4` | `contract-coverage-gate.test.ts` 2/2; suite intacta |
| `requires_review` separado de riesgo (umbral 0.6, migracion `...012`) | Hecho | `a52fde5` | evidencia extendida; roundtrip PG; OpenAPI |
| Suite backend | Verde | — | 181/181 (+6 PG condicionales) |

## Backend — fase 6 (datos, propuestas, carta)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Datos clave con evidencia (reglas documentadas, 9 claves) | Hecho | `9b4f4b2` | `contract-facts.test.ts` 3/3 |
| Persistencia datos + confirmar/corregir con transiciones | Hecho | `96169fe` | `contract-facts-api.test.ts` 3/3; migracion `...009` verificada en PG |
| Propuestas original/propuesta/motivo con borrador versionado | Hecho | `f4204b5` | `clause-proposals.test.ts` 3/3; migracion `...010` verificada en PG |
| Carta con hallazgos/destinatario/proposito/tono + trazabilidad | Hecho | `ba23167` | `objection-letter-selection.test.ts` 4/4; migracion `...011` verificada en PG |
| Suite backend | Verde | — | 177/177 |

## Backend — fase 7 (comparacion y preguntas)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Diff determinista (Jaccard + LCS, umbrales documentados) | Hecho | `0fce31a` | `clause-diff.test.ts` 4/4 |
| Comparacion entre propios con limites de lectura | Hecho | `0e63831` | `contract-compare.test.ts` 3/3; OpenAPI 18 paths |
| Preguntas con citas, sin LLM ni persistencia | Hecho | `0e6f04c` | `contract-questions.test.ts` 3/3; OpenAPI 19 paths |
| Suite backend | Verde | — | 199/199 (+9 PG condicionales) |

## Backend — fase 8 (agenda, informe, revision)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Recordatorios idempotentes + `.ics` con zona explicita | Hecho | `0410897` + `917cff5` | `reminders.test.ts` + `reminders-api.test.ts` 5/5 |
| Expediente PDF (contexto, hallazgos, datos, propuestas, fuentes) | Hecho | `886a63a` | `report-review.test.ts` (texto extraido del PDF) |
| Revision pendiente/en/revisada sin pericia simulada | Hecho | `886a63a` | `report-review.test.ts`; migracion `...015` en PG real |
| Migraciones `...014/015` en PG + roundtrip extendido | Hecho | este ciclo | PG 10/10 |
| Suite backend | Verde | — | 206/206 (+10 PG condicionales) |

## Frontend (Contrato_cero_fronent, rama feat/realtime-client)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Cliente WS + fallback HTTP | Hecho | `0232237` + `d274af4` | 6/6 socket simulado; suite 26/26 |
| Next.js + 5 patrones + Docker | Hecho | ver matriz del frontend | build + smoke 14/14 + `docker build` OK |
| Mensajes ES/EN fase 6 | Hecho | `1d2abb6` | Paridad 147 claves |

## Pendientes honestos

- **PG verificado**: migraciones `...006`–`...013` aplicadas y roundtrips
  9/9 en PG 15 local (volumen preservado, servicios detenidos).
- **Cola durable**: operando (leases, backoff, idempotencia, cancelación);
  sin apagón elegante aún (los leases vencen y se reclaman) y sin
  declaración de multi-instancia.
- **Fase 5 restante**: filtro RAG por tema (hoy solo jurisdicción),
  gestión reproducible de fuentes (CLI), OCR revisable con reanálisis,
  análisis parcial por página, pagerender (`page_number` aún null).
- **UI pendiente**: mostrar `requires_review`, cobertura, datos, agenda,
  informe y revisión en el frontend (backend expone todo; locales listos).
- **Fase 9 parcial**: regresión verde en ambos; falta E2E contra backend
  real, a11y manual y switch Railway (requiere autorización).
- Push a `origin` no realizado (decisión: solo commits locales).
