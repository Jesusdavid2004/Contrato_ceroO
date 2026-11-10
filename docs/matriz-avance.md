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

## Backend — fase 6 (datos, propuestas, carta)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Datos clave con evidencia (reglas documentadas, 9 claves) | Hecho | `9b4f4b2` | `contract-facts.test.ts` 3/3 |
| Persistencia datos + confirmar/corregir con transiciones | Hecho (codigo) | `96169fe` | `contract-facts-api.test.ts` 3/3; migracion `...009` sin PG real |
| Propuestas original/propuesta/motivo con borrador versionado | Hecho (codigo) | `f4204b5` | `clause-proposals.test.ts` 3/3; migracion `...010` sin PG real |
| Carta con hallazgos/destinatario/proposito/tono + trazabilidad | Hecho | `ba23167` | `objection-letter-selection.test.ts` 4/4; migracion `...011` sin PG real |
| Suite backend | Verde | — | 177/177 |

## Frontend (Contrato_cero_fronent, rama feat/realtime-client)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Cliente WS + fallback HTTP | Hecho | `0232237` + `d274af4` | 6/6 socket simulado; suite 26/26 |
| Next.js + 5 patrones + Docker | Hecho | ver matriz del frontend | build + smoke 14/14 + `docker build` OK |
| Mensajes ES/EN fase 6 | Hecho | `1d2abb6` | Paridad 147 claves |

## Pendientes honestos

- **Bloqueo de entorno**: migraciones `...006` a `...011` no ejecutadas
  contra Postgres real (sin DB local); `migrate:up` + roundtrips pendientes.
- **Comportamiento fuera de cobertura**: registrado pero sin bifurcar el
  analisis a lectura limitada.
- **Extraccion por pagina**: `page_number` siempre null; pagerender pendiente.
- **Cola duradera de jobs**: solo outbox de eventos; trabajos en PG con
  leases pendientes (staging ya deja bytes disponibles).
- **Fase 5 restante**: RAG filtrado por scope, gestion de fuentes,
  "requiere revisión", OCR revisable, analisis parcial por pagina.
- **Fases 7-8 sin empezar**: chat con citas, diff, agenda `.ics`,
  informe PDF, revisión humana.
- **Fase 9 parcial**: regresión verde en ambos; falta E2E contra backend
  real, a11y manual y switch Railway (requiere autorización).
- Push a `origin` no realizado (decisión: solo commits locales).
