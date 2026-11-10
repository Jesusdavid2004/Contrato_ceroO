import { z } from 'zod';

/**
 * Protocolo del canal de progreso en tiempo real (schemaVersion 1).
 * Ver docs/websocket-protocol.md. Por el socket solo viajan eventos
 * pequenos de progreso y notificaciones; jamas PDFs ni resultados
 * completos. Todo el payload se valida con Zod en ambas fronteras.
 */
export const REALTIME_SCHEMA_VERSION = 1 as const;

const contractIdSchema = z.string().min(1).max(128);

export const clientMessageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), contractId: contractIdSchema }),
  z.object({ action: z.literal('unsubscribe'), contractId: contractIdSchema }),
  z.object({ action: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverEventTypeSchema = z.enum([
  'snapshot',
  'stage',
  'completed',
  'failed',
  'notification',
  'error',
  'pong',
]);

export type ServerEventType = z.infer<typeof serverEventTypeSchema>;

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(REALTIME_SCHEMA_VERSION),
  type: serverEventTypeSchema,
  contractId: contractIdSchema.optional(),
  jobId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type RealtimeEvent = z.infer<typeof eventEnvelopeSchema>;

const stageStatusSchema = z.enum(['UPLOADED', 'EXTRACTING', 'ANALYZING']);

export const snapshotPayloadSchema = z.object({
  status: z.enum(['UPLOADED', 'EXTRACTING', 'ANALYZING', 'READY', 'FAILED']),
  failureMessageKey: z.string().nullable(),
});

export const stagePayloadSchema = z.object({
  status: stageStatusSchema,
});

export const completedPayloadSchema = z.object({
  status: z.literal('READY'),
  globalRiskScore: z.number().min(0).max(100),
});

export const failedPayloadSchema = z.object({
  status: z.literal('FAILED'),
  failureMessageKey: z.string().nullable(),
});

export const notificationPayloadSchema = z.object({
  kind: z.string().min(1).max(64),
  messageKey: z.string().min(1).max(128),
});

export const errorPayloadSchema = z.object({
  code: z.string().min(1).max(64),
  messageKey: z.string().min(1).max(128),
});

export const pongPayloadSchema = z.object({});

export function payloadSchemaFor(type: ServerEventType): z.ZodType<unknown> {
  switch (type) {
    case 'snapshot':
      return snapshotPayloadSchema;
    case 'stage':
      return stagePayloadSchema;
    case 'completed':
      return completedPayloadSchema;
    case 'failed':
      return failedPayloadSchema;
    case 'notification':
      return notificationPayloadSchema;
    case 'error':
      return errorPayloadSchema;
    case 'pong':
      return pongPayloadSchema;
  }
}

/** Valida envelope + payload correspondiente; lanza ZodError si no cumple. */
export function parseServerEvent(value: unknown): RealtimeEvent {
  const envelope = eventEnvelopeSchema.parse(value);
  payloadSchemaFor(envelope.type).parse(envelope.payload);
  return envelope;
}
