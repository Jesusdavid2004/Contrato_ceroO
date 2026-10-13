import { describe, expect, it } from 'vitest';
import { FileTooManyPagesError, TextExtractionFailedError } from '../src/domain/exceptions/index';
import type { VisionTranscriber } from '../src/domain/services/InfrastructureInterfaces';
import { ExtractContractTextUseCase } from '../src/application/use-cases/ExtractContractTextUseCase';
import { PdfTextExtractor } from '../src/infrastructure/services/PdfTextExtractor';

const OCR_TEXT =
  'CLAUSULA PRIMERA: El arrendatario pagara el canon mensual dentro de los primeros cinco dias.';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/DqkAAAAASUVORK5CYII=',
  'base64',
);

class RecordingVisionTranscriber implements VisionTranscriber {
  public readonly calls: Array<{ buffer: Buffer; mimeType: 'image/png' | 'image/jpeg' }> = [];
  public result = OCR_TEXT;

  public async transcribeImage(
    buffer: Buffer,
    mimeType: 'image/png' | 'image/jpeg',
  ): Promise<string> {
    this.calls.push({ buffer, mimeType });
    return this.result;
  }
}

function createPdf(pageTexts: string[]): Buffer {
  const pageObjectIds = pageTexts.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pageTexts.length * 2;
  const objects = new Map<number, string>();

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
  );

  pageTexts.forEach((pageText, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const textOperations = pageText
      .split(/\r?\n/)
      .map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) Tj`)
      .join(' T* ');
    const content = textOperations
      ? `BT /F1 10 Tf 20 750 Td ${textOperations} ET`
      : 'q 0 0 0 rg 20 20 1 1 re f Q';

    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    objects.set(
      contentObjectId,
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    );
  });

  objects.set(fontObjectId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let objectId = 1; objectId <= fontObjectId; objectId++) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const crossReferenceOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

describe('PdfTextExtractor', () => {
  it('extracts a text-layer PDF without sending contract text to vision', async () => {
    const text = Array.from(
      { length: 6 },
      (_, index) =>
        `CLAUSULA ${index + 1}: El arrendatario pagara el canon mensual bajo condicion numero ${index + 1} conforme a las condiciones establecidas en el contrato.`,
    ).join('\n');
    const transcriber = new RecordingVisionTranscriber();
    const useCase = new ExtractContractTextUseCase(new PdfTextExtractor(transcriber));

    const result = await useCase.execute({
      fileBuffer: createPdf([text]),
      mimeType: 'application/pdf',
    });

    expect(transcriber.calls).toHaveLength(0);
    expect(result).toContain('CLAUSULA 6');
    expect(result.replace(/\s/g, '').length).toBeGreaterThan(200);
  });

  it('renders sparse PDF pages and transcribes their images in page order', async () => {
    const transcriber = new RecordingVisionTranscriber();
    const extractor = new PdfTextExtractor(transcriber);

    const result = await extractor.extractText(createPdf(['', '']), 'application/pdf');

    expect(result).toBe(`${OCR_TEXT}\n\n${OCR_TEXT}`);
    expect(transcriber.calls).toHaveLength(2);
    expect(transcriber.calls.every((call) => call.mimeType === 'image/png')).toBe(true);
    expect(transcriber.calls.every((call) => call.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))).toBe(true);
  });

  it('uses vision transcription for uploaded PNG photos', async () => {
    const transcriber = new RecordingVisionTranscriber();
    const extractor = new PdfTextExtractor(transcriber);

    await expect(extractor.extractText(PNG_BYTES, 'image/png')).resolves.toBe(OCR_TEXT);
    expect(transcriber.calls).toHaveLength(1);
    expect(transcriber.calls[0].buffer).toEqual(PNG_BYTES);
  });

  it('rejects PDF documents over the page limit', async () => {
    const extractor = new PdfTextExtractor(new RecordingVisionTranscriber());

    await expect(
      extractor.extractText(createPdf(Array.from({ length: 41 }, () => '')), 'application/pdf'),
    ).rejects.toBeInstanceOf(FileTooManyPagesError);
  });

  it('rejects documents when extraction and OCR produce no meaningful text', async () => {
    const transcriber = new RecordingVisionTranscriber();
    transcriber.result = 'short';
    const extractor = new PdfTextExtractor(transcriber);

    await expect(extractor.extractText(PNG_BYTES, 'image/png')).rejects.toBeInstanceOf(
      TextExtractionFailedError,
    );
  });

  it('rejects a client MIME type that differs from the file magic bytes', async () => {
    const extractor = new PdfTextExtractor(new RecordingVisionTranscriber());

    await expect(extractor.extractText(PNG_BYTES, 'image/jpeg')).rejects.toBeInstanceOf(
      TextExtractionFailedError,
    );
  });
});
