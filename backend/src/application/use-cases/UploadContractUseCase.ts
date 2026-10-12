import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { FileStorage } from '../../domain/services/InfrastructureInterfaces';
import { Contract } from '../../domain/entities/Contract';
import { FileValidator } from '../../infrastructure/services/FileValidator';
import type { ContractType } from '../../domain/value-objects/ContractType';
import type { Jurisdiction } from '../../domain/value-objects/Jurisdiction';
import crypto from 'node:crypto';
import path from 'node:path';

export interface UploadContractInput {
  userId: string;
  fileBuffer: Buffer;
  originalName: string;
  contractType?: ContractType;
  jurisdiction?: Jurisdiction;
  locale?: string;
  title?: string;
}

export class UploadContractUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly fileStorage: FileStorage,
  ) {}

  public async execute(input: UploadContractInput) {
    // 1. Validate magic bytes and size
    const validated = FileValidator.validate(input.fileBuffer, input.originalName);

    // 2. Sanitize filename
    const sanitizedFileName = path.basename(input.originalName || 'contract').replace(/[^\w.-]/g, '_');
    const contractId = `contract-${crypto.randomUUID()}`;

    // 3. Store file according to privacy retention policy (none|7d|30d)
    await this.fileStorage.store(contractId, validated.buffer, validated.detectedMime);

    // 4. Create Contract entity in UPLOADED status
    const contract = new Contract({
      id: contractId,
      ownerId: input.userId,
      title: input.title?.trim() || sanitizedFileName,
      fileName: sanitizedFileName,
      contractType: input.contractType || 'OTHER',
      jurisdiction: input.jurisdiction || 'CO',
      locale: input.locale || 'es',
      status: 'UPLOADED',
      clauses: [],
      uploadedAt: new Date(),
    });

    // 5. Persist to repository
    await this.contractRepository.save(contract);

    return contract.toJSON();
  }
}
