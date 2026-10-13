import type { AIUsageRepository } from '../../domain/repositories/AIUsageRepository';
import type { Pool } from 'pg';

export class PostgresAIUsageRepository implements AIUsageRepository {
  constructor(private readonly pool: Pool) {}

  public async reserveDailyAnalysis(
    userId: string,
    dailyLimit: number,
    dayStart: Date,
    createdAt: Date,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM ai_usage
         WHERE user_id = $1 AND operation = 'analysis-reservation' AND created_at >= $2`,
        [userId, dayStart],
      );
      if (countResult.rows[0].count >= dailyLimit) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO ai_usage (user_id, model, tokens_used, operation, latency_ms, created_at)
         VALUES ($1, 'reservation', 0, 'analysis-reservation', 0, $2)`,
        [userId, createdAt],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordUsage(
    userId: string,
    model: string,
    tokensUsed: number,
    operation: string,
    latencyMs: number,
    createdAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_usage (user_id, model, tokens_used, operation, latency_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, model, tokensUsed, operation, latencyMs, createdAt],
    );
  }
}

export class InMemoryAIUsageRepository implements AIUsageRepository {
  private readonly reservations = new Map<string, Date[]>();
  private readonly usage: Array<{
    userId: string;
    model: string;
    tokensUsed: number;
    operation: string;
    latencyMs: number;
    createdAt: Date;
  }> = [];

  public async reserveDailyAnalysis(
    userId: string,
    dailyLimit: number,
    dayStart: Date,
    createdAt: Date,
  ): Promise<boolean> {
    const reservations = this.reservations.get(userId) || [];
    const todayReservations = reservations.filter((date) => date >= dayStart);
    if (todayReservations.length >= dailyLimit) return false;
    this.reservations.set(userId, [...todayReservations, createdAt]);
    return true;
  }

  public async recordUsage(
    userId: string,
    model: string,
    tokensUsed: number,
    operation: string,
    latencyMs: number,
    createdAt: Date,
  ): Promise<void> {
    this.usage.push({ userId, model, tokensUsed, operation, latencyMs, createdAt });
  }
}
