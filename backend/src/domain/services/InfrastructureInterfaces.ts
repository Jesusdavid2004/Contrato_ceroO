import type { ClassifiedClauseDTO } from './AIProvider';

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

export interface HeadingClauseSegmenter extends ClauseSegmenter {
  segmentHeadings(text: string): SegmentedClause[];
}

export interface AIClauseSegmenter {
  segment(text: string): Promise<SegmentedClause[]>;
}

export interface VisionTranscriber {
  transcribeImage(buffer: Buffer, mimeType: 'image/png' | 'image/jpeg'): Promise<string>;
}

export interface AIClassificationCache {
  get(key: string): Promise<ClassifiedClauseDTO[] | null>;
  set(key: string, clauses: ClassifiedClauseDTO[]): Promise<void>;
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
