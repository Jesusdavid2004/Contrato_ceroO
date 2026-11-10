import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  AnalysisEvent,
  AnalysisEventPublisher,
} from '../../domain/services/AnalysisEventPublisher';
import type { RealtimeServer } from '../../presentation/realtime/realtimeServer';
import { logger } from '../../shared/logger';

const MAX_APPEND_ATTEMPTS = 4;
const PUBLISH_BATCH_LIMIT = 50;

interface OutboxRow {
  id: string;
  contract_id: string;
  user_id: string;
  job_id: string;
  sequence: number;
  type: string;
  payload: unknown;
  occurred_at: Date | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPublishableType(type: string): type is 'stage' | 'completed' | 'failed' | 'notification' {
  return type === 'stage' || type === 'completed' || type === 'failed' || type === 'notification';
}

/**
 * Outbox duradero en PostgreSQL. Cada evento se inserta con secuencia por
 * contrato (UNIQUE) despues del commit del caso de uso; el publicador los
 * ofrece al socket y los marca. Si el proceso cae entre commit y emision,
 * el siguiente ciclo los recupera. Limite honesto: un solo publicador
 * (una replica de API).
 */
export class PostgresAnalysisEventOutbox implements AnalysisEventPublisher {
  constructor(private readonly pool: Pool) {}

  public async publish(event: AnalysisEvent): Promise<void> {
    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query(
          'SELECT COALESCE(MAX(sequence), -1) AS max_seq FROM analysis_event_outbox WHERE contract_id = $1',
          [event.contractId],
        );
        const maxSeq = current.rows[0] as { max_seq: number | string };
        const sequence = Number(maxSeq.max_seq) + 1;
        await client.query(
          `INSERT INTO analysis_event_outbox
            (id, contract_id, user_id, job_id, sequence, type, payload, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            event.contractId,
            event.userId,
            event.jobId,
            sequence,
            event.type,
            JSON.stringify(event.payload),
            event.occurredAt.toISOString(),
          ],
        );
        await client.query('COMMIT');
        return;
      } catch (error) {
        await client.query('ROLLBACK');
        const code = (error as { code?: string }).code;
        if (code === '23505' && attempt < MAX_APPEND_ATTEMPTS) continue;
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /** Ofrece pendientes al socket y los marca. Retorna procesados. */
  public async publishPending(realtimeServer: RealtimeServer, limit = PUBLISH_BATCH_LIMIT): Promise<number> {
    const selected = await this.pool.query(
      `SELECT id, contract_id, user_id, job_id, sequence, type, payload, occurred_at
       FROM analysis_event_outbox
       WHERE published = FALSE
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    let processed = 0;
    for (const row of selected.rows as OutboxRow[]) {
      try {
        if (!isPublishableType(row.type) || !isRecord(row.payload)) {
          logger.error('Analysis outbox row discarded', { eventId: row.id });
          await this.markPublished(row.id);
          processed += 1;
          continue;
        }
        realtimeServer.publishContractEvent({
          contractId: row.contract_id,
          jobId: row.job_id,
          type: row.type,
          sequence: row.sequence,
          payload: { ...row.payload },
          occurredAt: new Date(row.occurred_at),
        });
        await this.markPublished(row.id);
        processed += 1;
      } catch (error) {
        await this.markAttempt(row.id);
        logger.error('Analysis outbox publish failed', {
          eventId: row.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    return processed;
  }

  private async markPublished(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE analysis_event_outbox SET published = TRUE, attempts = attempts + 1 WHERE id = $1',
      [id],
    );
  }

  private async markAttempt(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE analysis_event_outbox SET attempts = attempts + 1 WHERE id = $1',
      [id],
    );
  }
}

/** Inicia el ciclo de recuperacion; retorna funcion de parada. */
export function startOutboxPublisher(
  pool: Pool,
  realtimeServer: RealtimeServer,
  outbox: PostgresAnalysisEventOutbox,
  intervalMs = 2000,
): () => void {
  const timer = setInterval(() => {
    void outbox.publishPending(realtimeServer)
      .then((recovered) => {
        if (recovered > 0) logger.info('Analysis outbox recovered events', { recovered });
      })
      .catch((error: unknown) => {
        logger.error('Analysis outbox cycle failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
