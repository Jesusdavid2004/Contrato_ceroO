import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { PdfGenerator } from '../../domain/services/InfrastructureInterfaces';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  ObjectionLetterNotFoundError,
} from '../../domain/exceptions/index';

export interface ObjectionLetterPdf {
  contractTitle: string;
  buffer: Buffer;
}

export class DownloadObjectionLetterPdfUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly pdfGenerator: PdfGenerator,
  ) {}

  public async execute(input: { contractId: string; userId: string }): Promise<ObjectionLetterPdf> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);

    const letter = await this.contractRepository.getObjectionLetter(contract.id);
    if (!letter) throw new ObjectionLetterNotFoundError(contract.id);

    const buffer = await this.pdfGenerator.generateObjectionLetterPdf(letter.content, {
      title: contract.title,
      locale: letter.locale,
    });
    return { contractTitle: contract.title, buffer };
  }
}
