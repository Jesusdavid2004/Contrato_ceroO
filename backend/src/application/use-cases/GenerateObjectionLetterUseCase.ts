import { ObjectionLetter } from '../../domain/entities/ObjectionLetter';
import type { AIProvider } from '../../domain/services/AIProvider';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import {
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';
import { NoFlaggedClausesError } from '../../domain/exceptions/index';

export class GenerateObjectionLetterUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly aiProvider: AIProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: { contractId: string; userId: string }): Promise<ObjectionLetter> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (contract.status !== 'READY') throw new ContractNotReadyError(input.contractId);

    const flaggedClauses = contract.flaggedClauses();
    if (flaggedClauses.length === 0) throw new NoFlaggedClausesError();

    const content = await this.aiProvider.generateObjectionLetter({
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      locale: contract.locale,
      flaggedClauses: flaggedClauses.map((clause) => ({
        id: clause.id,
        text: clause.originalText,
        riskLevel: clause.riskLevel,
        plainExplanation: clause.plainExplanation,
        whyRisky: clause.whyRisky,
        legalBasis: clause.legalBasis,
        suggestedChange: clause.suggestedChange,
      })),
    });
    const letter = new ObjectionLetter({
      contractId: contract.id,
      locale: contract.locale,
      content,
      createdAt: this.clock(),
    });
    await this.contractRepository.saveObjectionLetter(letter);
    return letter;
  }
}
