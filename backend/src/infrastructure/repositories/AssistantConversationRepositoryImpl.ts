import type { Pool } from 'pg';
import {
  AssistantMessage,
  type AssistantCitation,
  type AssistantRole,
} from '../../domain/entities/AssistantMessage';
import type { AssistantConversationRepository } from '../../domain/repositories/AssistantConversationRepository';

interface AssistantMessageRow {
  id: string;
  contract_id: string;
  user_id: string;
  role: string;
  content: string;
  citations: AssistantCitation[];
  grounded: boolean;
  created_at: Date | string;
}

function toMessage(row: AssistantMessageRow): AssistantMessage {
  return new AssistantMessage({
    id: row.id,
    contractId: row.contract_id,
    userId: row.user_id,
    role: row.role as AssistantRole,
    content: row.content,
    citations: row.citations,
    grounded: row.grounded,
    createdAt: new Date(row.created_at),
  });
}

export class PostgresAssistantConversationRepository implements AssistantConversationRepository {
  constructor(private readonly pool: Pool) {}

  public async append(message: AssistantMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO assistant_messages (id, contract_id, user_id, role, content, citations, grounded, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        message.id,
        message.contractId,
        message.userId,
        message.role,
        message.content,
        JSON.stringify(message.citations),
        message.grounded,
        message.createdAt,
      ],
    );
  }

  public async listByContract(contractId: string, limit: number): Promise<AssistantMessage[]> {
    const result = await this.pool.query(
      `SELECT id, contract_id, user_id, role, content, citations, grounded, created_at
       FROM (
         SELECT * FROM assistant_messages WHERE contract_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2
       ) recent
       ORDER BY created_at ASC, id ASC`,
      [contractId, limit],
    );
    return (result.rows as AssistantMessageRow[]).map(toMessage);
  }

  public async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM assistant_messages
       WHERE user_id = $1 AND role = 'user' AND created_at >= $2`,
      [userId, since],
    );
    return (result.rows[0] as { total: number }).total;
  }

  public async deleteByContract(contractId: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM assistant_messages WHERE contract_id = $1',
      [contractId],
    );
    return result.rowCount ?? 0;
  }
}

export class InMemoryAssistantConversationRepository implements AssistantConversationRepository {
  private readonly messages: AssistantMessage[] = [];

  public async append(message: AssistantMessage): Promise<void> {
    this.messages.push(message);
  }

  public async listByContract(contractId: string, limit: number): Promise<AssistantMessage[]> {
    return this.messages.filter((message) => message.contractId === contractId).slice(-limit);
  }

  public async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.messages.filter(
      (message) => message.userId === userId && message.role === 'user' && message.createdAt >= since,
    ).length;
  }

  public async deleteByContract(contractId: string): Promise<number> {
    let removed = 0;
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      if (this.messages[index].contractId === contractId) {
        this.messages.splice(index, 1);
        removed += 1;
      }
    }
    return removed;
  }
}
