import type { Response } from 'express';
import { DomainError } from '../../domain/exceptions/DomainError';
import { logger } from '../../shared/logger';

export const SSE_CONTENT_TYPE = 'text/event-stream';

export type SseEventName = 'token' | 'done' | 'error';

export function openSse(res: Response): void {
  res.status(200).set({
    'Content-Type': `${SSE_CONTENT_TYPE}; charset=utf-8`,
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

export function sendSse(res: Response, event: SseEventName, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Maps an error raised after the stream opened to a translatable error event (no internals leaked). */
export function sendSseError(res: Response, error: unknown): void {
  if (error instanceof DomainError) {
    sendSse(res, 'error', { code: error.code, message_key: error.messageKey });
    return;
  }
  logger.error('Unhandled streaming error', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  sendSse(res, 'error', { code: 'InternalServerError', message_key: 'errors.internal_error' });
}

export function wantsEventStream(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? '').includes(SSE_CONTENT_TYPE);
}
