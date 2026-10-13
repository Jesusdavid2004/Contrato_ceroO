import path from 'node:path';
import type { TextEmbeddingProvider, EmbeddingPurpose } from '../../domain/services/TextEmbeddingProvider';

const MODEL_ID = 'Xenova/multilingual-e5-small';
const EMBEDDING_DIMENSIONS = 384;
const QUERY_PREFIX = 'query: ';
const DOCUMENT_PREFIX = 'passage: ';

async function loadFeatureExtractor(cacheDir: string) {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline('feature-extraction', MODEL_ID, { cache_dir: cacheDir });
}

type FeatureExtractor = Awaited<ReturnType<typeof loadFeatureExtractor>>;

export class HuggingFaceLocalEmbeddingProvider implements TextEmbeddingProvider {
  private extractorPromise?: Promise<FeatureExtractor>;

  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = path.resolve(cacheDir);
  }

  public async embed(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
    const prefix = purpose === 'query' ? QUERY_PREFIX : DOCUMENT_PREFIX;
    const extractor = await this.getExtractor();
    const output = await extractor(`${prefix}${text}`, { pooling: 'mean', normalize: true });
    try {
      const embedding = Array.from(output.data);
      if (
        embedding.length !== EMBEDDING_DIMENSIONS
        || embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(`Embedding model returned an invalid vector; expected ${EMBEDDING_DIMENSIONS} finite values.`);
      }
      return embedding;
    } finally {
      output.dispose();
    }
  }

  private getExtractor(): Promise<FeatureExtractor> {
    this.extractorPromise ??= loadFeatureExtractor(this.cacheDir).catch((error: unknown) => {
      this.extractorPromise = undefined;
      throw error;
    });
    return this.extractorPromise;
  }
}
