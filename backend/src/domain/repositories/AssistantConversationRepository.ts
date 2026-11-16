import type { AssistantMessage } from '../entities/AssistantMessage';

export interface AssistantConversationRepository {
  append(message: AssistantMessage): Promise<void>;
  /** Oldest first, limited to the most recent `limit` messages. */
  listByContract(contractId: string, limit: number): Promise<AssistantMessage[]>;
  /** Counts the user's own questions sent since `since`, across all contracts. */
  countUserMessagesSince(userId: string, since: Date): Promise<number>;
  deleteByContract(contractId: string): Promise<number>;
}
