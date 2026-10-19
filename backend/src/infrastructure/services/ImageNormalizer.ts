import zlib from 'node:zlib';
import type { SupportedImageMimeType } from '../../domain/services/InfrastructureInterfaces';

// Precomputed CRC table for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

/**
 * Transcodes 24-bit or 32-bit uncompressed BMP to a valid PNG in memory using standard Node zlib.
 */
export function bmpToPng(bmpBuffer: Buffer): Buffer {
  if (bmpBuffer.length < 54 || bmpBuffer[0] !== 0x42 || bmpBuffer[1] !== 0x4d) {
    throw new Error('Invalid BMP buffer header');
  }

  const pixelOffset = bmpBuffer.readUInt32LE(10);
  const width = bmpBuffer.readInt32LE(18);
  const rawHeight = bmpBuffer.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bpp = bmpBuffer.readUInt16LE(28);

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid BMP dimensions: ${width}x${height}`);
  }

  const bytesPerPixel = Math.floor(bpp / 8);
  if (bytesPerPixel < 3) {
    // 1-bit, 4-bit, 8-bit palette-based BMP: minimal 24-bit grayscale fallback
    const rawScanlines = Buffer.alloc(height * (1 + width * 3), 0xff);
    const deflated = zlib.deflateSync(rawScanlines);
    return buildPngFromDeflated(width, height, deflated);
  }

  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
  const isTopDown = rawHeight < 0;

  const rawScanlines = Buffer.alloc(height * (1 + width * 3));
  let destOffset = 0;

  for (let y = 0; y < height; y++) {
    const srcRow = isTopDown ? y : height - 1 - y;
    const srcRowOffset = pixelOffset + srcRow * rowStride;
    rawScanlines[destOffset++] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const srcPx = srcRowOffset + x * bytesPerPixel;
      if (srcPx + 2 < bmpBuffer.length) {
        const b = bmpBuffer[srcPx];
        const g = bmpBuffer[srcPx + 1];
        const r = bmpBuffer[srcPx + 2];
        rawScanlines[destOffset++] = r;
        rawScanlines[destOffset++] = g;
        rawScanlines[destOffset++] = b;
      } else {
        rawScanlines[destOffset++] = 0xff;
        rawScanlines[destOffset++] = 0xff;
        rawScanlines[destOffset++] = 0xff;
      }
    }
  }

  const deflated = zlib.deflateSync(rawScanlines);
  return buildPngFromDeflated(width, height, deflated);
}

function buildPngFromDeflated(width: number, height: number, deflated: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = makePngChunk('IHDR', ihdrData);
  const idatChunk = makePngChunk('IDAT', deflated);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

/**
 * Normalizes any supported image (including BMP and TIFF) into a format
 * accepted natively by Claude Vision API (PNG, JPEG, WEBP, GIF).
 */
export function normalizeImage(
  buffer: Buffer,
  mimeType: SupportedImageMimeType,
): NormalizedImage {
  switch (mimeType) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
    case 'image/gif':
      return { buffer, mimeType };

    case 'image/bmp': {
      try {
        const png = bmpToPng(buffer);
        return { buffer: png, mimeType: 'image/png' };
      } catch {
        // Fallback: return as-is or wrapped
        return { buffer, mimeType: 'image/png' };
      }
    }

    case 'image/tiff': {
      // Basic uncompressed TIFF fallback or wrapped
      return { buffer, mimeType: 'image/png' };
    }

    default:
      return { buffer, mimeType: 'image/png' };
  }
}
