import {
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { FactsRepository } from '../../domain/repositories/FactsRepository';
import type { LegalUpdatesRepository } from '../../domain/repositories/LegalUpdatesRepository';
import type { RemindersRepository } from '../../domain/repositories/RemindersRepository';
import { buildActionPlan, type ActionStep } from '../../domain/services/ActionPlan';
import { temasForContractType } from '../../domain/services/LegalTopics';
import { buildNarrationScript, type NarrationSegment } from '../../domain/services/NarrationScript';

export const GUIDANCE_UPDATE_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_COUNTED_UPDATES = 50;

export interface ContractGuidance {
  contractId: string;
  locale: string;
  globalRiskScore: number;
  steps: ActionStep[];
  narration: NarrationSegment[];
  pendingLegalUpdates: number;
}

/** Builds the "what should I do now" plan and the narration script for one contract. */
export class GetContractGuidanceUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly factsRepository: FactsRepository,
    private readonly remindersRepository: RemindersRepository,
    private readonly legalUpdates?: LegalUpdatesRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: { contractId: string; userId: string }): Promise<ContractGuidance> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (contract.status !== 'READY') throw new ContractNotReadyError(input.contractId);

    const [facts, reminders, pendingLegalUpdates] = await Promise.all([
      this.factsRepository.getFacts(contract.id),
      this.remindersRepository.listByContract(contract.id),
      this.countRecentUpdates(contract.contractType),
    ]);
    const steps = buildActionPlan({
      clauses: contract.clauses,
      facts,
      hasPendingReminders: reminders.some((reminder) => reminder.status === 'pending'),
      globalRiskScore: contract.globalRiskScore,
    });
    const narration = buildNarrationScript({
      globalRiskScore: contract.globalRiskScore,
      clauses: contract.clauses,
      steps,
      pendingLegalUpdates,
    });
    return {
      contractId: contract.id,
      locale: contract.locale,
      globalRiskScore: contract.globalRiskScore,
      steps,
      narration,
      pendingLegalUpdates,
    };
  }

  private async countRecentUpdates(contractType: string): Promise<number> {
    const temas = temasForContractType(contractType);
    if (!this.legalUpdates || temas.length === 0) return 0;
    const updates = await this.legalUpdates.listRecent({
      temas,
      since: new Date(this.clock().getTime() - GUIDANCE_UPDATE_LOOKBACK_DAYS * MS_PER_DAY),
      limit: MAX_COUNTED_UPDATES,
    });
    return updates.length;
  }
}
