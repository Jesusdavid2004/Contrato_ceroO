import { UnsupportedFileTypeError, FileTooLargeError } from '../../domain/exceptions/index';

export interface ValidatedFile {
  detectedMime: 'application/pdf' | 'image/png' | 'image/jpeg';
  buffer: Buffer;
  sizeBytes: number;
}

export class FileValidator {
  private static readonly MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Checks file buffer header against known magic bytes:
   * - PDF: 25 50 44 46 2D (%PDF-)
   * - PNG: 89 50 4E 47 0D 0A 1A 0A
   * - JPEG: FF D8 FF
   */
  public static validate(buffer: Buffer, originalName?: string): ValidatedFile {
    if (!buffer || buffer.length === 0) {
      throw new UnsupportedFileTypeError('empty_file');
    }

    if (buffer.length > this.MAX_SIZE_BYTES) {
      throw new FileTooLargeError(10);
    }

    const detectedMime = this.detectMagicBytes(buffer);
    if (!detectedMime) {
      throw new UnsupportedFileTypeError(originalName || 'unknown');
    }

    return {
      detectedMime,
      buffer,
      sizeBytes: buffer.length,
    };
  }

  private static detectMagicBytes(buffer: Buffer): ValidatedFile['detectedMime'] | null {
    if (buffer.length < 12) return null;

    // PDF: %PDF-
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return 'application/pdf';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    return null;
  }
}
