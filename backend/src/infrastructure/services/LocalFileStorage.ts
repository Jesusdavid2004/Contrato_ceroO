import type { FileStorage } from '../../domain/services/InfrastructureInterfaces';
import { config } from '../../shared/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.resolve(process.cwd(), 'storage', 'contracts');
    if (config.CONTRACT_FILE_RETENTION !== 'none' && !fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async store(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (config.CONTRACT_FILE_RETENTION === 'none') {
      // Ephemeral by default: do not store raw contract file
      return `ephemeral://${key}`;
    }

    if (!fs.existsSync(this.baseDir)) {
      await fs.promises.mkdir(this.baseDir, { recursive: true });
    }

    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = this.getExtension(mimeType);
    const safeFilename = `${sanitizedKey}_${crypto.randomUUID()}${ext}`;
    const targetPath = path.join(this.baseDir, safeFilename);

    await fs.promises.writeFile(targetPath, buffer);
    return `file://${targetPath}`;
  }

  public async get(key: string): Promise<Buffer | null> {
    if (key.startsWith('ephemeral://')) {
      return null;
    }
    const filePath = key.startsWith('file://') ? key.replace('file://', '') : key;
    if (fs.existsSync(filePath)) {
      return fs.promises.readFile(filePath);
    }
    const directPath = path.join(this.baseDir, key);
    if (fs.existsSync(directPath)) {
      return fs.promises.readFile(directPath);
    }
    return null;
  }

  public async delete(key: string): Promise<void> {
    if (key.startsWith('ephemeral://')) {
      return;
    }

    // 1. Direct file:// URI or direct filesystem path
    const filePath = key.startsWith('file://') ? key.replace('file://', '') : key;
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
      return;
    }

    // 2. Direct filename in baseDir
    const directPath = path.join(this.baseDir, key);
    if (fs.existsSync(directPath)) {
      await fs.promises.unlink(directPath).catch(() => {});
      return;
    }

    // 3. Contract ID prefix search in baseDir
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (fs.existsSync(this.baseDir)) {
      try {
        const files = await fs.promises.readdir(this.baseDir);
        for (const file of files) {
          if (file.includes(sanitizedKey)) {
            await fs.promises.unlink(path.join(this.baseDir, file)).catch(() => {});
          }
        }
      } catch {
        // Ignore read/unlink errors on cleanup
      }
    }
  }

  private getExtension(mimeType: string): string {
    switch (mimeType) {
      case 'application/pdf':
        return '.pdf';
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'image/tiff':
        return '.tiff';
      case 'image/bmp':
        return '.bmp';
      case 'image/gif':
        return '.gif';
      default:
        return '.bin';
    }
  }
}
