import { UnsupportedFileTypeError, FileTooLargeError } from '../../domain/exceptions/index';

export type SupportedMimeType =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/tiff'
  | 'image/bmp'
  | 'image/gif';

export interface ValidatedFile {
  detectedMime: SupportedMimeType;
  buffer: Buffer;
  sizeBytes: number;
}

export class FileValidator {
  private static readonly MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Checks file buffer header against known magic bytes:
   * - PDF:  %PDF- (25 50 44 46 2D)
   * - PNG:  89 50 4E 47 0D 0A 1A 0A
   * - JPEG: FF D8 FF
   * - WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
   * - TIFF: II* (49 49 2A 00) or MM (4D 4D 00 2A)
   * - BMP:  BM (42 4D)
   * - GIF:  GIF87a / GIF89a (47 49 46 38)
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

  private static detectMagicBytes(buffer: Buffer): SupportedMimeType | null {
    if (buffer.length < 4) return null;

    // PDF: %PDF-
    if (
      buffer.length >= 5 &&
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
      buffer.length >= 8 &&
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

    // WEBP: RIFF at 0..3 and WEBP at 8..11
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }

    // TIFF: II* (little-endian) or MM (big-endian)
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return 'image/tiff';
    }

    // BMP: BM
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return 'image/bmp';
    }

    // GIF: GIF87a or GIF89a
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return 'image/gif';
    }

    return null;
  }
}
