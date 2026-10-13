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

    const ext = this.getExtension(mimeType);
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const targetPath = path.join(this.baseDir, safeFilename);

    await fs.promises.writeFile(targetPath, buffer);
    return `file://${targetPath}`;
  }

  public async get(key: string): Promise<Buffer | null> {
    if (key.startsWith('ephemeral://')) {
      return null;
    }
    const filePath = key.replace('file://', '');
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.promises.readFile(filePath);
  }

  public async delete(key: string): Promise<void> {
    if (key.startsWith('ephemeral://')) {
      return;
    }
    const filePath = key.replace('file://', '');
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
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
      default:
        return '.bin';
    }
  }
}
