import { TextExtractionFailedError } from '../../domain/exceptions/index';
import type {
  AIClauseSegmenter,
  SegmentedClause,
  VisionTranscriber,
} from '../../domain/services/InfrastructureInterfaces';
import { RegexClauseSegmenter } from '../services/RegexClauseSegmenter';

export class OfflineDocumentProcessor implements VisionTranscriber, AIClauseSegmenter {
  private readonly fallbackSegmenter = new RegexClauseSegmenter();

  public async transcribeImage(): Promise<string> {
    throw new TextExtractionFailedError(
      'Image transcription requires ANTHROPIC_API_KEY; offline mode supports text-based PDFs.',
    );
  }

  public async segment(text: string): Promise<SegmentedClause[]> {
    return this.fallbackSegmenter.segment(text);
  }
}
