import type { TextExtractor } from '../../domain/services/InfrastructureInterfaces';

export class ExtractContractTextUseCase {
  constructor(private readonly textExtractor: TextExtractor) {}

  public async execute(input: { fileBuffer: Buffer; mimeType: string }): Promise<string> {
    return this.textExtractor.extractText(input.fileBuffer, input.mimeType);
  }
}
