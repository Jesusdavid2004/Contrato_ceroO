import type { Pool } from 'pg';
import { ReviewRequest } from '../../domain/entities/ReviewRequest';
import type { ReviewRequestsRepository } from '../../domain/repositories/ReviewRequestsRepository';

interface ReviewRow {
  id: string;
  contract_id: string;
  user_id: string;
  status: string;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toReview(row: ReviewRow): ReviewRequest {
  return new ReviewRequest({
    id: row.id,
    contractId: row.contract_id,
    userId: row.user_id,
    status: row.status as ReviewRequest['status'],
    note: row.note,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

const SELECT_COLUMNS = 'id, contract_id, user_id, status, note, created_at, updated_at';

export class PostgresReviewRequestsRepository implements ReviewRequestsRepository {
  constructor(private readonly pool: Pool) {}

  public async open(input: { id: string; contractId: string; userId: string; note?: string | null }): Promise<{ review: ReviewRequest; created: boolean }> {
    const inserted = await this.pool.query(
      `INSERT INTO review_requests (id, contract_id, user_id, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (contract_id) WHERE status IN ('pending', 'in_review') DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.contractId, input.userId, input.note ?? null],
    );
    if (inserted.rows.length > 0) {
      return { review: toReview(inserted.rows[0] as ReviewRow), created: true };
    }
    const existing = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM review_requests
       WHERE contract_id = $1 AND status IN ('pending', 'in_review')`,
      [input.contractId],
    );
    if (existing.rows.length === 0) {
      throw new Error('Review request conflicted but no open request exists.');
    }
    return { review: toReview(existing.rows[0] as ReviewRow), created: false };
  }

  public async latestForContract(contractId: string): Promise<ReviewRequest | null> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM review_requests
       WHERE contract_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [contractId],
    );
    if (res.rows.length === 0) return null;
    return toReview(res.rows[0] as ReviewRow);
  }

  public async findById(id: string): Promise<ReviewRequest | null> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM review_requests WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return toReview(res.rows[0] as ReviewRow);
  }

  public async setStatus(id: string, status: ReviewRequest['status']): Promise<ReviewRequest | null> {
    const res = await this.pool.query(
      `UPDATE review_requests SET status = $2, updated_at = NOW()
       WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id, status],
    );
    if (res.rows.length === 0) return null;
    return toReview(res.rows[0] as ReviewRow);
  }
}

export class InMemoryReviewRequestsRepository implements ReviewRequestsRepository {
  private readonly reviews = new Map<string, ReviewRequest>();

  public async open(input: { id: string; contractId: string; userId: string; note?: string | null }): Promise<{ review: ReviewRequest; created: boolean }> {
    const open = [...this.reviews.values()].find(
      (review) => review.contractId === input.contractId
        && (review.status === 'pending' || review.status === 'in_review'),
    );
    if (open) return { review: open, created: false };
    const review = new ReviewRequest({
      id: input.id,
      contractId: input.contractId,
      userId: input.userId,
      note: input.note ?? null,
    });
    this.reviews.set(review.id, review);
    return { review, created: true };
  }

  public async latestForContract(contractId: string): Promise<ReviewRequest | null> {
    const matching = [...this.reviews.values()].filter((review) => review.contractId === contractId);
    if (matching.length === 0) return null;
    return matching.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  public async findById(id: string): Promise<ReviewRequest | null> {
    return this.reviews.get(id) ?? null;
  }

  public async setStatus(id: string, status: ReviewRequest['status']): Promise<ReviewRequest | null> {
    const current = this.reviews.get(id);
    if (!current) return null;
    const updated = new ReviewRequest({
      id: current.id,
      contractId: current.contractId,
      userId: current.userId,
      status,
      note: current.note,
      createdAt: current.createdAt,
      updatedAt: new Date(),
    });
    this.reviews.set(id, updated);
    return updated;
  }
}
