import type { Pool } from 'pg';
import { LegalUpdate } from '../../domain/entities/LegalUpdate';
import type {
  LegalSourceState,
  LegalUpdatesRepository,
  RecentUpdatesQuery,
} from '../../domain/repositories/LegalUpdatesRepository';

interface LegalUpdateRow {
  id: string;
  source_id: string;
  tema: string;
  kind: string;
  title: string;
  source_url: string;
  content_hash: string;
  detected_at: Date | string;
}

function toUpdate(row: LegalUpdateRow): LegalUpdate {
  return new LegalUpdate({
    id: row.id,
    sourceId: row.source_id,
    tema: row.tema,
    kind: row.kind as LegalUpdate['kind'],
    title: row.title,
    sourceUrl: row.source_url,
    contentHash: row.content_hash,
    detectedAt: new Date(row.detected_at),
  });
}

export class PostgresLegalUpdatesRepository implements LegalUpdatesRepository {
  constructor(private readonly pool: Pool) {}

  public async saveIfNew(update: LegalUpdate): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO legal_updates (id, source_id, tema, kind, title, source_url, content_hash, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_id, content_hash) DO NOTHING`,
      [update.id, update.sourceId, update.tema, update.kind, update.title, update.sourceUrl, update.contentHash, update.detectedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async listRecent(query: RecentUpdatesQuery): Promise<LegalUpdate[]> {
    if (query.temas.length === 0) return [];
    const result = await this.pool.query(
      `SELECT id, source_id, tema, kind, title, source_url, content_hash, detected_at
       FROM legal_updates
       WHERE tema = ANY($1::text[]) AND detected_at >= $2
       ORDER BY detected_at DESC, id DESC
       LIMIT $3`,
      [query.temas, query.since, query.limit],
    );
    return (result.rows as LegalUpdateRow[]).map(toUpdate);
  }

  public async getSourceState(sourceId: string): Promise<LegalSourceState | null> {
    const result = await this.pool.query(
      'SELECT source_id, content_hash, checked_at FROM legal_source_state WHERE source_id = $1',
      [sourceId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as { source_id: string; content_hash: string; checked_at: Date | string };
    return { sourceId: row.source_id, contentHash: row.content_hash, checkedAt: new Date(row.checked_at) };
  }

  public async saveSourceState(state: LegalSourceState): Promise<void> {
    await this.pool.query(
      `INSERT INTO legal_source_state (source_id, content_hash, checked_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_id) DO UPDATE SET content_hash = EXCLUDED.content_hash, checked_at = EXCLUDED.checked_at`,
      [state.sourceId, state.contentHash, state.checkedAt],
    );
  }
}

export class InMemoryLegalUpdatesRepository implements LegalUpdatesRepository {
  private readonly updates: LegalUpdate[] = [];
  private readonly states = new Map<string, LegalSourceState>();

  public async saveIfNew(update: LegalUpdate): Promise<boolean> {
    const exists = this.updates.some(
      (existing) => existing.sourceId === update.sourceId && existing.contentHash === update.contentHash,
    );
    if (exists) return false;
    this.updates.push(update);
    return true;
  }

  public async listRecent(query: RecentUpdatesQuery): Promise<LegalUpdate[]> {
    return this.updates
      .filter((update) => query.temas.includes(update.tema) && update.detectedAt >= query.since)
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, query.limit);
  }

  public async getSourceState(sourceId: string): Promise<LegalSourceState | null> {
    return this.states.get(sourceId) ?? null;
  }

  public async saveSourceState(state: LegalSourceState): Promise<void> {
    this.states.set(state.sourceId, state);
  }
}
