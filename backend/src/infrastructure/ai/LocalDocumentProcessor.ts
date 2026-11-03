import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TextExtractionFailedError } from '../../domain/exceptions/index';
import type {
  AIClauseSegmenter,
  SegmentedClause,
  SupportedImageMimeType,
  VisionTranscriber,
} from '../../domain/services/InfrastructureInterfaces';
import { RegexClauseSegmenter } from '../services/RegexClauseSegmenter';
import { logger } from '../../shared/logger';

/**
 * Offline document processor. No external API calls.
 *
 * Image transcription runs TrOCR (printed text) locally via transformers.js.
 * The model downloads once into the shared cache dir on first use and then
 * works fully offline. Text segmentation reuses the deterministic regex
 * fallback (structure, not intelligence: splitting is not a judgment call).
 */
const OCR_MODEL_ID = 'Xenova/trocr-small-printed';
const MIN_TRANSCRIBED_CHARS = 20;

type ImageToTextPipeline = (image: string) => Promise<Array<{ generated_text?: string }>>;

async function loadOcrPipeline(cacheDir: string): Promise<ImageToTextPipeline> {
  const { pipeline } = await import('@huggingface/transformers');
  return (await pipeline('image-to-text', OCR_MODEL_ID, {
    cache_dir: cacheDir,
  })) as unknown as ImageToTextPipeline;
}

function extensionFor(mimeType: SupportedImageMimeType): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/tiff') return '.tiff';
  if (mimeType === 'image/bmp') return '.bmp';
  return '.png';
}

export class LocalDocumentProcessor implements VisionTranscriber, AIClauseSegmenter {
  private ocrPromise?: Promise<ImageToTextPipeline>;
  private readonly fallbackSegmenter = new RegexClauseSegmenter();

  constructor(private readonly cacheDir: string) {}

  public async transcribeImage(buffer: Buffer, mimeType: SupportedImageMimeType): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `contratoclaro-ocr-${randomUUID()}${extensionFor(mimeType)}`);
    try {
      await fs.promises.writeFile(tmpPath, buffer);
      const transcribe = await this.getPipeline();
      const output = await transcribe(tmpPath);
      const text = output
        .map((item) => item.generated_text ?? '')
        .join('\n')
        .trim();
      if (text.length < MIN_TRANSCRIBED_CHARS) {
        throw new TextExtractionFailedError('local_ocr_empty');
      }
      return text;
    } catch (error) {
      if (error instanceof TextExtractionFailedError) throw error;
      logger.warn('Local OCR transcription failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new TextExtractionFailedError('local_ocr_unavailable');
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
    }
  }

  public async segment(text: string): Promise<SegmentedClause[]> {
    return this.fallbackSegmenter.segment(text);
  }

  private getPipeline(): Promise<ImageToTextPipeline> {
    this.ocrPromise ??= loadOcrPipeline(path.resolve(this.cacheDir)).catch((error: unknown) => {
      this.ocrPromise = undefined;
      throw error;
    });
    return this.ocrPromise;
  }
}
