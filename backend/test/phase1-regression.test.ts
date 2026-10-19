import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileValidator } from '../src/infrastructure/services/FileValidator';
import { UnsupportedFileTypeError } from '../src/domain/exceptions/index';
import { bmpToPng, normalizeImage } from '../src/infrastructure/services/ImageNormalizer';
import { LocalFileStorage } from '../src/infrastructure/services/LocalFileStorage';
import { Logger } from '../src/shared/logger';
import { PdfTextExtractor } from '../src/infrastructure/services/PdfTextExtractor';
import type { SupportedImageMimeType, VisionTranscriber } from '../src/domain/services/InfrastructureInterfaces';
import { Contract } from '../src/domain/entities/Contract';

// Mock bytes for testing signatures
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x1a, 0x00, 0x00, 0x00, // Size
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20, // VP8
]);

const TIFF_LE_BYTES = Buffer.from([
  0x49, 0x49, 0x2a, 0x00, // II*
  0x08, 0x00, 0x00, 0x00,
]);

const TIFF_BE_BYTES = Buffer.from([
  0x4d, 0x4d, 0x00, 0x2a, // MM*
  0x00, 0x00, 0x00, 0x08,
]);

const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  0x01, 0x00, 0x01, 0x00,
]);

function createSampleBmp(width = 2, height = 2): Buffer {
  const bytesPerPixel = 3;
  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // Pixel data offset
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // Color planes
  buf.writeUInt16LE(24, 28); // 24 bpp
  buf.writeUInt32LE(0, 30); // BI_RGB (uncompressed)
  buf.writeUInt32LE(pixelDataSize, 34);

  // Fill sample pixels (blue/red checker)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowStride + x * bytesPerPixel;
      buf[offset] = 0xff; // B
      buf[offset + 1] = 0x00; // G
      buf[offset + 2] = 0x00; // R
    }
  }

  return buf;
}

class RecordingMultiFormatTranscriber implements VisionTranscriber {
  public calls: Array<{ buffer: Buffer; mimeType: SupportedImageMimeType }> = [];
  public resultText = 'CLAUSULA PRIMERA: Canon mensual pagadero dentro de los primeros cinco dias de cada mes.';

  public async transcribeImage(buffer: Buffer, mimeType: SupportedImageMimeType): Promise<string> {
    this.calls.push({ buffer, mimeType });
    return this.resultText;
  }
}

describe('Phase 1 Regression: Multi-Format Image and PDF Ingestion', () => {
  it('detects and validates WebP images by magic bytes', () => {
    const validated = FileValidator.validate(WEBP_BYTES, 'document.webp');
    expect(validated.detectedMime).toBe('image/webp');
    expect(validated.sizeBytes).toBe(WEBP_BYTES.length);
  });

  it('detects and validates TIFF images (both Little-Endian and Big-Endian)', () => {
    const valLe = FileValidator.validate(TIFF_LE_BYTES, 'scan_le.tiff');
    expect(valLe.detectedMime).toBe('image/tiff');

    const valBe = FileValidator.validate(TIFF_BE_BYTES, 'scan_be.tif');
    expect(valBe.detectedMime).toBe('image/tiff');
  });

  it('detects and validates BMP images', () => {
    const bmp = createSampleBmp();
    const validated = FileValidator.validate(bmp, 'scan.bmp');
    expect(validated.detectedMime).toBe('image/bmp');
  });

  it('detects and validates GIF images', () => {
    const validated = FileValidator.validate(GIF_BYTES, 'notice.gif');
    expect(validated.detectedMime).toBe('image/gif');
  });

  it('rejects unsupported file formats', () => {
    const randomBinary = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    expect(() => FileValidator.validate(randomBinary, 'file.exe')).toThrow(UnsupportedFileTypeError);
  });

  it('transcodes BMP into valid PNG with identical dimensions', () => {
    const bmp = createSampleBmp(4, 4);
    const png = bmpToPng(bmp);

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    // IHDR width and height at bytes 16-24
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(4);
  });

  it('normalizes BMP to PNG for vision transcriber compatibility', () => {
    const bmp = createSampleBmp(2, 2);
    const normalized = normalizeImage(bmp, 'image/bmp');
    expect(normalized.mimeType).toBe('image/png');
    expect(normalized.buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('extracts text from WebP and BMP using vision transcriber in PdfTextExtractor', async () => {
    const transcriber = new RecordingMultiFormatTranscriber();
    const extractor = new PdfTextExtractor(transcriber);

    const webpText = await extractor.extractText(WEBP_BYTES, 'image/webp');
    expect(webpText).toContain('CLAUSULA PRIMERA');
    expect(transcriber.calls[0].mimeType).toBe('image/webp');

    const bmp = createSampleBmp();
    const bmpText = await extractor.extractText(bmp, 'image/bmp');
    expect(bmpText).toContain('CLAUSULA PRIMERA');
    expect(transcriber.calls[1].mimeType).toBe('image/bmp');
  });
});

describe('Phase 1 Regression: Storage URI Lifecycle and Deletion', () => {
  it('stores and tracks storageUri on Contract entity', () => {
    const contract = new Contract({
      id: 'contract-test-123',
      ownerId: 'user-456',
      title: 'Arrendamiento',
      fileName: 'arrendamiento.pdf',
      storageUri: 'file:///data/storage/contracts/test.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });

    expect(contract.storageUri).toBe('file:///data/storage/contracts/test.pdf');
    expect(contract.toJSON().storage_uri).toBe('file:///data/storage/contracts/test.pdf');
  });

  it('deletes stored contract files when given a file URI, filename, or contract ID', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
    try {
      const storage = new LocalFileStorage(tempDir);
      const testBuffer = Buffer.from('dummy contract content');

      // Emulate retention enabled storage
      const filePath = path.join(tempDir, 'contract_xyz_safe.pdf');
      fs.writeFileSync(filePath, testBuffer);
      expect(fs.existsSync(filePath)).toBe(true);

      // Deleting via file:// URI
      await storage.delete(`file://${filePath}`);
      expect(fs.existsSync(filePath)).toBe(false);

      // Re-create file and test deletion via contract ID search
      const filePath2 = path.join(tempDir, 'contract_abc123_random.pdf');
      fs.writeFileSync(filePath2, testBuffer);
      expect(fs.existsSync(filePath2)).toBe(true);

      await storage.delete('contract_abc123');
      expect(fs.existsSync(filePath2)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 1 Regression: Logger Sensitive Data Redaction', () => {
  it('redacts tokens, passwords, and contract text from log context', () => {
    const logger = new Logger();
    const context = {
      userId: 'usr-123',
      password: 'super-secret-password',
      accessToken: 'jwt.token.here',
      original_text: 'Confidential contract clause content',
      nested: {
        api_key: 'sk-ant-secret',
        clause_text: 'Secret obligation between parties',
        safeProperty: 'visible',
      },
    };

    const sanitized = logger.sanitize(context) as Record<string, unknown>;
    expect(sanitized.userId).toBe('usr-123');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.original_text).toBe('[REDACTED]');

    const nested = sanitized.nested as Record<string, unknown>;
    expect(nested.api_key).toBe('[REDACTED]');
    expect(nested.clause_text).toBe('[REDACTED]');
    expect(nested.safeProperty).toBe('visible');
  });
});
