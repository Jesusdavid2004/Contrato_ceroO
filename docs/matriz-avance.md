# Matriz de avance — instrucción OpenCode (rama feat/realtime-jobs)

Relacion requisito → repo → commit → prueba. Solo hechos verificados;
lo no ejecutado va en Pendientes. Repos: `Contrato_ceroO` = backend,
`Contrato_cero_fronent` = frontend.

## Backend (Contrato_ceroO)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Definir API antes de pantallas (OpenAPI + protocolo) | Hecho | `985e0e2` Documenta el protocolo WebSocket… | `openapi.yaml` parsea (13 paths, `createRealtimeTicket`); `docs/websocket-protocol.md` |
| Transporte unico: `ws` en Express, sin SSE/gRPC nuevo | Hecho | `76280bb` Agrega dependencia ws… | `npm run type-check` + `npm run build` pasan |
| Esquema Zod del protocolo (envelope, cliente/servidor) | Hecho | `223254c` + `3d66d72` | `test/realtime-progress.test.ts` (parse en cada mensaje) |
| Ticket de un solo uso via HTTP autenticado | Hecho | `fe8f89d` | 401 sin Bearer; reuso → 401 en upgrade |
| Servidor WS: Origin, heartbeat, limites, bufferedAmount | Hecho | `220ee61` | Origen malo → 403; ping → pong; subscription limit |
| Bus en memoria + secuencia por contrato | Hecho | `87f47dc` | Orden y secuencia 0,1 en test dedicado |
| Worker/rutas publican tras commit (sin bloquear) | Hecho | `4f2d3f5` | Suite 144/144; evento UPLOADED en upload real |
| Outbox Postgres + reintentos + recuperacion | Hecho (codigo) | `e83253c` | **No verificado contra Postgres real**: sin DB local; migracion `1700000000006` pendiente de `migrate:up` en dev |
| Cierre de sockets al borrar cuenta | Hecho | `4f2d3f5` | Cierre `4401` en test |
| Matriz de avance | Hecho | este commit | — |

## Frontend (Contrato_cero_fronent)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Cliente WS robusto (ticket, backoff+jitter, dedup, seq, fallback HTTP) | Pendiente | — | — |
| Sustituir polling por WS en subida | Pendiente | — | — |

## Pendientes honestos

- **Bloqueo de entorno**: `analysis_event_outbox` no probada contra Postgres
  (no hay DB local corriendo; `migrate:up` + `publishPending` real pendientes).
- **Multi-instancia**: explícitamente no soportada (bus/outbox single-publisher,
  tickets en memoria). Sin Redis/Kafka por decisión documentada.
- **Siguientes fases sin empezar**: migración Next.js + 5 patrones de rendering,
  contexto/cobertura, extracción por página, carta selectiva, chat con citas,
  diff, agenda `.ics`, informe/revisión humana, staging cifrado con TTL,
  retención total, hardening E2E y despliegue Railway.
- Push a `origin` no realizado (decisión: solo commits locales).
