# Matriz de avance — instrucción OpenCode (rama feat/realtime-jobs)

Relacion requisito → repo → commit → prueba. Solo hechos verificados;
lo no ejecutado va en Pendientes. Repos: `Contrato_ceroO` = backend,
`Contrato_cero_fronent` = frontend.

## Backend (Contrato_ceroO) — fase 2 parcial

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Politica de cobertura (experimental CO+LEASE, resto unsupported, version) | Hecho | `91e9fab` | `coverage-policy.test.ts` 3/3 |
| Contexto en contrato (rol, cobertura, version) + frontera Zod | Hecho (memoria) | `10420ee` | `contract-context.test.ts` 4/4 |
| Persistencia contexto en Postgres + migracion `...007` + OpenAPI | Hecho (codigo) | `095dff5` | Smoke de migracion; ejecucion real en PG pendiente |
| Evidencia: offsets del segmentador, nulos honestos, migracion `...008` | Hecho (codigo) | `9e5d4b2` | `contract-evidence.test.ts` 4/4; PG pendiente |
| Staging cifrado con TTL (AES-GCM, purga, llave por env) | Hecho | `beb8bab` | `analysis-staging.test.ts` 5/5 |
| Staging en subida/worker/borrado + `errors.staging_expired` | Hecho | `243a48c` + frontend `01dd4d0` | `analysis-staging-wiring.test.ts` 3/3; suite 164/164 |
| Matriz de avance | Hecho | este commit | — |

## Frontend (Contrato_cero_fronent)

| Requisito | Estado | Commit | Prueba |
|---|---|---|---|
| Cliente WS robusto (ticket, backoff+jitter, dedup, seq, fallback HTTP) | Pendiente | — | — |
| Sustituir polling por WS en subida | Pendiente | — | — |

## Pendientes honestos

- **Bloqueo de entorno**: migraciones `...006` (outbox), `...007` (contexto) y
  `...008` (evidencia) no ejecutadas contra Postgres real (sin DB local);
  `migrate:up` + `publishPending` real + roundtrip de repositorio pendientes.
- **Comportamiento fuera de cobertura**: registrado pero sin bifurcar el
  analisis a lectura limitada (siguiente incremento).
- **Extraccion por pagina**: `page_number` siempre null; pagerender pendiente.
- **Cola duradera de jobs**: outbox de eventos hecho; la cola de trabajos en
  PG con leases (y worker separado) sigue pendiente; staging ya deja los
  bytes disponibles para ella.
- **Multi-instancia**: explícitamente no soportada (bus/outbox single-publisher,
  tickets y staging efimero en memoria en tests, llave efimera en dev).
- **Siguientes fases sin empezar**: migración Next.js + 5 patrones de rendering,
  cobertura/fuentes/RAG por scope, resumen/propuestas, carta selectiva, chat
  con citas, diff, agenda `.ics`, informe/revisión humana, staging cifrado con TTL,
  retención total, hardening E2E y despliegue Railway.
- Push a `origin` no realizado (decisión: solo commits locales).
