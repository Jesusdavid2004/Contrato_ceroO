import { ObjectionLetter, type LetterPurpose, type LetterTone } from '../../domain/entities/ObjectionLetter';
import type { AIProvider } from '../../domain/services/AIProvider';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import {
  ClauseNotFoundError,
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
  ObjectionLetterNotFoundError,
} from '../../domain/exceptions/index';
import { NoFlaggedClausesError } from '../../domain/exceptions/index';

export class GenerateObjectionLetterUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly aiProvider: AIProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
    clauseIds?: string[];
    recipient?: string;
    purpose?: LetterPurpose;
    tone?: LetterTone;
  }): Promise<ObjectionLetter> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (contract.status !== 'READY') throw new ContractNotReadyError(input.contractId);

    let candidates = contract.flaggedClauses();
    let selectedIds = candidates.map((clause) => clause.id);
    if (input.clauseIds !== undefined) {
      const knownIds = new Set(contract.clauses.map((clause) => clause.id));
      for (const id of input.clauseIds) {
        if (!knownIds.has(id)) throw new ClauseNotFoundError(id);
      }
      candidates = contract.clauses.filter((clause) => input.clauseIds?.includes(clause.id));
      selectedIds = candidates.map((clause) => clause.id);
    }
    if (candidates.length === 0) throw new NoFlaggedClausesError();

    const content = await this.aiProvider.generateObjectionLetter({
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      locale: contract.locale,
      flaggedClauses: candidates.map((clause) => ({
        id: clause.id,
        text: clause.originalText,
        riskLevel: clause.riskLevel,
        plainExplanation: clause.plainExplanation,
        whyRisky: clause.whyRisky,
        legalBasis: clause.legalBasis,
        suggestedChange: clause.suggestedChange,
      })),
      letterOptions: {
        recipient: input.recipient,
        purpose: input.purpose ?? 'clarification',
        tone: input.tone ?? 'respectful',
      },
    });
    const letter = new ObjectionLetter({
      contractId: contract.id,
      locale: contract.locale,
      content,
      recipient: input.recipient?.trim() ? input.recipient.trim() : null,
      purpose: input.purpose ?? 'clarification',
      tone: input.tone ?? 'respectful',
      selectedClauseIds: selectedIds,
      createdAt: this.clock(),
    });
    await this.contractRepository.saveObjectionLetter(letter);
    // Re-read so the response carries the persisted id (SERIAL in Postgres,
    // generated in memory), which the API contract requires.
    const saved = await this.contractRepository.getObjectionLetter(contract.id);
    if (!saved) throw new ObjectionLetterNotFoundError(contract.id);
    return saved;
  }
}
