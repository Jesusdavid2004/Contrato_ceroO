import type { AssistantMessage } from '../../domain/entities/AssistantMessage';
import {
  ContractNotFoundError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';
import type { AssistantConversationRepository } from '../../domain/repositories/AssistantConversationRepository';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';

export const ASSISTANT_HISTORY_PAGE_SIZE = 50;

async function requireOwnedContract(
  contracts: ContractRepository,
  contractId: string,
  userId: string,
): Promise<void> {
  const contract = await contracts.findById(contractId);
  if (!contract) throw new ContractNotFoundError(contractId);
  if (contract.ownerId !== userId) throw new ContractOwnershipError(contractId);
}

export class ListAssistantMessagesUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly conversations: AssistantConversationRepository,
  ) {}

  public async execute(input: { contractId: string; userId: string }): Promise<AssistantMessage[]> {
    await requireOwnedContract(this.contractRepository, input.contractId, input.userId);
    return this.conversations.listByContract(input.contractId, ASSISTANT_HISTORY_PAGE_SIZE);
  }
}

export class ClearAssistantConversationUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly conversations: AssistantConversationRepository,
  ) {}

  public async execute(input: { contractId: string; userId: string }): Promise<number> {
    await requireOwnedContract(this.contractRepository, input.contractId, input.userId);
    return this.conversations.deleteByContract(input.contractId);
  }
}
