export interface TextExtractor {
  extractText(buffer: Buffer, mimeType: string): Promise<string>;
}

export interface SegmentedClause {
  orderIndex: number;
  text: string;
}

export interface ClauseSegmenter {
  segment(text: string): Promise<SegmentedClause[]>;
}

export interface FileStorage {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export interface PdfGenerator {
  generateObjectionLetterPdf(letterText: string, metadata: { title: string; locale: string }): Promise<Buffer>;
}

export interface Clock {
  now(): Date;
}
