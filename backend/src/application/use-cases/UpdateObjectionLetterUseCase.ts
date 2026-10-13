import { ObjectionLetter } from '../../domain/entities/ObjectionLetter';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  ObjectionLetterContentInvalidError,
  ObjectionLetterNotFoundError,
} from '../../domain/exceptions/index';

const MAX_LETTER_WORDS = 350;

export class UpdateObjectionLetterUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
    content: string;
  }): Promise<ObjectionLetter> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);

    const existingLetter = await this.contractRepository.getObjectionLetter(contract.id);
    if (!existingLetter) throw new ObjectionLetterNotFoundError(contract.id);
    if (!input.content.trim() || input.content.trim().split(/\s+/).length > MAX_LETTER_WORDS) {
      throw new ObjectionLetterContentInvalidError();
    }

    const updatedLetter = new ObjectionLetter({
      contractId: contract.id,
      locale: existingLetter.locale,
      content: input.content.trim(),
      createdAt: this.clock(),
    });
    await this.contractRepository.saveObjectionLetter(updatedLetter);
    return updatedLetter;
  }
}
