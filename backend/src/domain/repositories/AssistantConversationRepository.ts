import type { AssistantMessage } from '../entities/AssistantMessage';

export interface AssistantConversationRepository {
  append(message: AssistantMessage): Promise<void>;
  /** Oldest first, limited to the most recent `limit` messages. */
  listByContract(contractId: string, limit: number): Promise<AssistantMessage[]>;
  deleteByContract(contractId: string): Promise<number>;
}
