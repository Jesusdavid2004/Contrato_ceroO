# Protocolo WebSocket de ContratoClaro (tiempo real)

Version del protocolo: `schemaVersion: 1`. Transporte: WebSocket estandar
(`ws` en Express, `WebSocket` en el navegador). HTTP/REST se conserva para
todo lo demas: autenticacion, subida, consultas, edicion y descargas. Por el
socket solo viajan eventos pequenos de progreso y notificaciones, nunca PDFs
ni resultados completos.

## 1. Autenticacion (ticket de un solo uso)

El constructor `WebSocket` del navegador no permite cabeceras `Authorization`
arbitrarias, y los tokens duraderos no van en URLs. Por eso:

1. Cliente autenticado pide `POST /api/v1/realtime/ticket` con `Bearer`.
2. El servidor responde `{ ticket, expiresAt }`. El ticket es aleatorio
   (256 bits), de **un solo uso**, atado al `userId`, con TTL de 60 s.
3. El cliente abre `wss://host/api/realtime?ticket=<ticket>`.
4. El servidor valida y **consume** el ticket durante el upgrade. Un ticket
   reutilizado o vencido cierra con codigo `4401`.

Al reconectar se repite el paso 1 (ticket nuevo). La expiracion de la sesion
se maneja renovando el access token por HTTP antes de pedir ticket.

## 2. Origen y transporte

- Se valida `Origin` en el upgrade contra la allowlist (`CORS_ORIGIN` en
  produccion mas localhost en desarrollo). Origen ausente o fuera de lista
  cierra con `4403`. CORS HTTP no protege el socket: la defensa es Origin +
  ticket + WSS.
- WSS obligatorio en produccion (lo provee el ingress/Railway).
- Al eliminar una cuenta se cierran sus conexiones activas.

## 3. Mensajes del cliente

```jsonc
// Suscribirse a un contrato propio (se verifica propiedad en cada suscripcion)
{ "action": "subscribe", "contractId": "<uuid>" }
// Cancelar suscripcion
{ "action": "unsubscribe", "contractId": "<uuid>" }
// Latido de aplicacion (el ping/pong de WS lo maneja el servidor cada 30 s)
{ "action": "ping" }
```

Limites: mensaje maximo 4 KB, maximo 20 suscripciones por conexion,
desconocidos o malformados responden `error` sin cerrar (salvo abuso).

## 4. Mensajes del servidor

Sobre (envelope) comun, validado con Zod en ambos extremos:

| Campo | Tipo | Notas |
|---|---|---|
| `eventId` | uuid | Deduplicacion en cliente |
| `schemaVersion` | `1` | Version del protocolo |
| `type` | enum | `snapshot`, `stage`, `completed`, `failed`, `notification`, `error`, `pong` |
| `contractId` | string? | Presente en eventos de contrato |
| `jobId` | string | `contractId` del analisis (un job por contrato) |
| `sequence` | int >= 0 | Creciente por job; descartar `<=` ultimo visto |
| `occurredAt` | ISO datetime | Reloj del servidor |
| `payload` | objeto | Validado por tipo (ver abajo) |

Tipos y payloads:

- `snapshot`: estado actual tras suscribirse o reconectar.
  `{ status, failureMessageKey }`.
- `stage`: cambio de etapa. `{ status }` con `status` en
  `UPLOADED | EXTRACTING | ANALYZING`.
- `completed`: analisis listo. `{ status: "READY", globalRiskScore }`.
  El cliente descarga el detalle por HTTP.
- `failed`: analisis fallo. `{ status: "FAILED", failureMessageKey }`.
- `notification`: aviso dentro de la app (p. ej. carta lista).
  `{ kind, messageKey }`.
- `error`: `{ code, messageKey }` (p. ej. suscripcion ajena -> `FORBIDDEN`,
  contrato inexistente -> `NOT_FOUND`). No cierra la conexion.
- `pong`: `{}` respuesta a `ping`.

## 5. Persistencia y consistencia

El estado definitivo vive en **PostgreSQL**, no en el socket:

- Cada evento durable se escribe primero en la tabla `analysis_event_outbox`
  (`contract_id, sequence` unico) dentro del flujo del caso de uso.
- Un publicador lee pendientes (`SELECT ... FOR UPDATE SKIP LOCKED`),
  emite al bus y marca `published`. Si el proceso cae entre commit y
  publicacion, el siguiente ciclo lo recupera. Por el socket solo viajan
  identificadores + estado, el snapshot completo se reconstruye desde tablas.
- En modo pruebas/memoria el bus es directo (sin outbox); la semantica
  visible para el cliente es identica.

No se promete entrega exactamente una vez: el cliente deduplica por
`eventId` y tolera repetidos.

## 6. Recuperacion del cliente

1. Pedir ticket nuevo, 2. conectar, 3. re-suscribir, 4. pedir `snapshot`
   implicito (cada `subscribe` responde `snapshot` + el cliente reconcilia
   con `GET /contracts/:id/status` si dudo). Backoff exponencial con jitter,
   tope de intentos y detencion en estado terminal. Si el socket falla, la
   app conserva una consulta HTTP acotada (mismo backoff, maximo 10 min,
   se detiene en `READY`/`FAILED`).

## 7. Proteccion y escalado

- Por conexion: 1 suscripcion inicial implicita? No: solo explicitas, max 20.
- Por usuario: maximo 10 conexiones simultaneas (la 11 cierra la mas vieja).
- `bufferedAmount` > 1 MB o sin `pong` en 90 s: se cierra al cliente lento
  (codigo `4411` / `4408`).
- Rate: maximo 30 mensajes/min por conexion; exceso -> `error RATE_LIMITED`
  y luego cierre `4409`.
- Una sola replica de API/worker por ahora (worker y bus en memoria). No se
  declara escalado horizontal: documentado como limite hasta backplane
  `LISTEN/NOTIFY` (solo ids) + tablas.
