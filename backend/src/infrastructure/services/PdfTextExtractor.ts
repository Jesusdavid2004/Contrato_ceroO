import { PDFParse, VerbosityLevel } from 'pdf-parse';
import { FileTooManyPagesError, TextExtractionFailedError } from '../../domain/exceptions/index';
import type { TextExtractor, VisionTranscriber } from '../../domain/services/InfrastructureInterfaces';
import { logger } from '../../shared/logger';
import { FileValidator } from './FileValidator';

export const MAX_CONTRACT_PAGES = 40;
export const MIN_AVERAGE_TEXT_CHARACTERS_PER_PAGE = 200;
const MIN_MEANINGFUL_TEXT_CHARACTERS = 20;
const PDF_RENDER_WIDTH = 1600;
const MAX_CONCURRENT_PAGE_TRANSCRIPTIONS = 4;

export class PdfTextExtractor implements TextExtractor {
  constructor(private readonly visionTranscriber: VisionTranscriber) {}

  public async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    const validatedFile = FileValidator.validate(buffer);

    if (mimeType !== validatedFile.detectedMime) {
      throw new TextExtractionFailedError('Uploaded file type does not match its binary content.');
    }

    if (validatedFile.detectedMime !== 'application/pdf') {
      return this.extractImageText(validatedFile.buffer, validatedFile.detectedMime);
    }

    return this.extractPdfText(validatedFile.buffer);
  }

  private async extractImageText(
    buffer: Buffer,
    mimeType: 'image/png' | 'image/jpeg',
  ): Promise<string> {
    return this.requireMeaningfulText(await this.visionTranscriber.transcribeImage(buffer, mimeType));
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      verbosity: VerbosityLevel.ERRORS,
      stopAtErrors: true,
    });

    try {
      const documentInfo = await parser.getInfo();
      if (documentInfo.total > MAX_CONTRACT_PAGES) {
        throw new FileTooManyPagesError(MAX_CONTRACT_PAGES);
      }
      if (documentInfo.total === 0) {
        throw new TextExtractionFailedError();
      }

      const result = await parser.getText();
      const text = result.pages.map((page) => page.text).join('\n\n').trim();
      const averageCharactersPerPage = this.countMeaningfulCharacters(text) / result.total;
      if (averageCharactersPerPage >= MIN_AVERAGE_TEXT_CHARACTERS_PER_PAGE) {
        return this.requireMeaningfulText(text);
      }

      const screenshots = await parser.getScreenshot({
        desiredWidth: PDF_RENDER_WIDTH,
        imageBuffer: true,
        imageDataUrl: false,
      });
      const transcribedPages: string[] = [];
      for (
        let startIndex = 0;
        startIndex < screenshots.pages.length;
        startIndex += MAX_CONCURRENT_PAGE_TRANSCRIPTIONS
      ) {
        const pageBatch = screenshots.pages.slice(
          startIndex,
          startIndex + MAX_CONCURRENT_PAGE_TRANSCRIPTIONS,
        );
        transcribedPages.push(
          ...(await Promise.all(
            pageBatch.map((page) =>
              this.visionTranscriber.transcribeImage(Buffer.from(page.data), 'image/png'),
            ),
          )),
        );
      }

      return this.requireMeaningfulText(transcribedPages.join('\n\n'));
    } catch (error) {
      if (error instanceof FileTooManyPagesError || error instanceof TextExtractionFailedError) {
        throw error;
      }
      logger.error('Contract text extraction failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new TextExtractionFailedError();
    } finally {
      await parser.destroy();
    }
  }

  private requireMeaningfulText(text: string): string {
    const normalizedText = text.trim();
    if (this.countMeaningfulCharacters(normalizedText) < MIN_MEANINGFUL_TEXT_CHARACTERS) {
      throw new TextExtractionFailedError();
    }
    return normalizedText;
  }

  private countMeaningfulCharacters(text: string): number {
    return text.replace(/\s/g, '').length;
  }
}
