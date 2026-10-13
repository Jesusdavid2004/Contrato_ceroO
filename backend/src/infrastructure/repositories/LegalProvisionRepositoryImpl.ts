import { LegalProvision } from '../../domain/entities/LegalProvision';
import type { LegalProvisionRepository } from '../../domain/repositories/LegalProvisionRepository';
import type { Pool } from 'pg';

const EMBEDDING_DIMENSIONS = 384;
const DEFAULT_RETRIEVAL_LIMIT = 3;
const MAX_RETRIEVAL_LIMIT = 20;

export class PostgresLegalProvisionRepository implements LegalProvisionRepository {
  constructor(private readonly pool: Pool) {}

  public async findTopRelevant(
    jurisdiction: string,
    queryEmbedding: number[],
    limit = DEFAULT_RETRIEVAL_LIMIT,
  ): Promise<LegalProvision[]> {
    this.validateEmbedding(queryEmbedding);
    const boundedLimit = Math.min(
      MAX_RETRIEVAL_LIMIT,
      Math.max(1, Math.floor(limit)),
    );
    const vector = this.toVector(queryEmbedding);
    const result = await this.pool.query(
      `SELECT id, jurisdiction, source_name, source_url, reference, text, created_at
       FROM legal_provisions
       WHERE jurisdiction = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [jurisdiction, vector, boundedLimit],
    );

    return result.rows.map((row) => new LegalProvision({
      id: row.id,
      jurisdiction: row.jurisdiction,
      sourceName: row.source_name,
      sourceUrl: row.source_url || '',
      reference: row.reference,
      text: row.text,
      createdAt: new Date(row.created_at),
    }));
  }

  public async saveMany(provisions: LegalProvision[]): Promise<void> {
    if (provisions.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const provision of provisions) {
        if (!provision.embedding) {
          throw new Error(`Legal provision ${provision.id} is missing its embedding.`);
        }
        this.validateEmbedding(provision.embedding);
        await client.query(
          `INSERT INTO legal_provisions
             (id, jurisdiction, source_name, source_url, reference, text, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
           ON CONFLICT (id) DO UPDATE SET
             jurisdiction = EXCLUDED.jurisdiction,
             source_name = EXCLUDED.source_name,
             source_url = EXCLUDED.source_url,
             reference = EXCLUDED.reference,
             text = EXCLUDED.text,
             embedding = EXCLUDED.embedding`,
          [
            provision.id,
            provision.jurisdiction,
            provision.sourceName,
            provision.sourceUrl,
            provision.reference,
            provision.text,
            this.toVector(provision.embedding),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async countByJurisdiction(jurisdiction: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM legal_provisions WHERE jurisdiction = $1',
      [jurisdiction],
    );
    return Number(result.rows[0].count);
  }

  private validateEmbedding(embedding: number[]): void {
    if (
      embedding.length !== EMBEDDING_DIMENSIONS
      || embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Legal provision embeddings must contain ${EMBEDDING_DIMENSIONS} finite values.`);
    }
  }

  private toVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
