export type EmbeddingPurpose = 'query' | 'document';

export interface TextEmbeddingProvider {
  embed(text: string, purpose: EmbeddingPurpose): Promise<number[]>;
}
