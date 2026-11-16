import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AnalysisStaging,
  FetchedStagedAnalysis,
  StagedAnalysisInput,
  StagedAnalysisRef,
} from '../../domain/services/AnalysisStaging';
import { stagingUriFor } from '../../domain/services/AnalysisStaging';
import { logger } from '../../shared/logger';

const STAGING_VERSION = 1;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

interface StagingFile {
  version: number;
  expiresAt: string;
  mimeType: string;
  iv: string;
  authTag: string;
  data: string;
}

/**
 * Staging cifrado en disco (AES-256-GCM, IV aleatorio por archivo).
 * Metadatos (vencimiento, mime) en claro para purgar sin la llave;
 * los bytes solo existen cifrados. Adaptador local para desarrollo;
 * no anunciarlo como almacenamiento distribuido.
 */
export class EncryptedFileStaging implements AnalysisStaging {
  constructor(
    private readonly directory: string,
    private readonly key: Buffer,
  ) {
    if (key.length !== 32) {
      throw new Error('EncryptedFileStaging requires a 32-byte key.');
    }
  }

  public async stage(key: string, input: StagedAnalysisInput, ttlMs: number): Promise<StagedAnalysisRef> {
    this.assertSafeKey(key);
    const expiresAt = new Date(Date.now() + ttlMs);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(input.buffer),
      cipher.final(),
    ]);
    const file: StagingFile = {
      version: STAGING_VERSION,
      expiresAt: expiresAt.toISOString(),
      mimeType: input.mimeType,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      data: ciphertext.toString('base64'),
    };
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(this.filePath(key), JSON.stringify(file), { mode: 0o600 });
    return { uri: stagingUriFor(key), expiresAt };
  }

  public async fetch(uri: string): Promise<FetchedStagedAnalysis | null> {
    const key = this.keyFromUri(uri);
    if (!key) return null;
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath(key), 'utf8');
    } catch {
      return null;
    }
    let file: StagingFile;
    try {
      file = JSON.parse(raw) as StagingFile;
      if (file.version !== STAGING_VERSION || typeof file.data !== 'string') return null;
    } catch {
      await this.remove(uri);
      return null;
    }
    if (Number.isNaN(Date.parse(file.expiresAt)) || new Date(file.expiresAt).getTime() <= Date.now()) {
      await this.remove(uri);
      return null;
    }
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(file.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(file.authTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(file.data, 'base64')),
        decipher.final(),
      ]);
      return { buffer: plaintext, mimeType: file.mimeType };
    } catch {
      // Manipulacion o llave incorrecta: se elimina y no se entrega nada.
      await this.remove(uri);
      return null;
    }
  }

  public async remove(uri: string): Promise<void> {
    const key = this.keyFromUri(uri);
    if (!key) return;
    try {
      await fs.unlink(this.filePath(key));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ENOENT') {
        logger.warn('Staging remove failed', { errorName: 'UnknownError' });
      }
    }
  }

  public async purgeExpired(now: Date = new Date()): Promise<number> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.directory);
    } catch {
      return 0;
    }
    let purged = 0;
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.directory, entry), 'utf8');
        const file = JSON.parse(raw) as Partial<StagingFile>;
        if (!file.expiresAt || Number.isNaN(Date.parse(file.expiresAt))) continue;
        if (new Date(file.expiresAt).getTime() <= now.getTime()) {
          await fs.unlink(path.join(this.directory, entry));
          purged += 1;
        }
      } catch {
        continue;
      }
    }
    return purged;
  }

  private assertSafeKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw new Error('Staging key contains unsafe characters.');
    }
  }

  private keyFromUri(uri: string): string | null {
    if (!uri.startsWith('staging:')) return null;
    const key = uri.slice('staging:'.length);
    return KEY_PATTERN.test(key) ? key : null;
  }

  private filePath(key: string): string {
    return path.join(this.directory, `${key}.json`);
  }
}
