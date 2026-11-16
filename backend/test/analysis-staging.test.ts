import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EncryptedFileStaging } from '../src/infrastructure/staging/EncryptedFileStaging';
import { InMemoryStaging } from '../src/infrastructure/staging/InMemoryStaging';

describe('Analysis staging', () => {
  let dir = '';
  const key = crypto.randomBytes(32);
  const payload = Buffer.from('%PDF-1.4 staged bytes');

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staging-test-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('cifra en disco y recupera los mismos bytes', async () => {
    const staging = new EncryptedFileStaging(dir, key);
    const ref = await staging.stage('staging-key-1', { buffer: payload, mimeType: 'application/pdf' }, 60_000);
    expect(ref.uri).toBe('staging:staging-key-1');

    const raw = await fs.readFile(path.join(dir, 'staging-key-1.json'), 'utf8');
    expect(raw).not.toContain('%PDF-1.4 staged bytes');

    const fetched = await staging.fetch(ref.uri);
    expect(fetched?.buffer.equals(payload)).toBe(true);
    expect(fetched?.mimeType).toBe('application/pdf');
  });

  it('vence por TTL y purga sin la llave', async () => {
    const staging = new EncryptedFileStaging(dir, key);
    const ref = await staging.stage('old-key', { buffer: payload, mimeType: 'application/pdf' }, 1);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await staging.fetch(ref.uri)).toBeNull();
    const other = await staging.stage('old-key-2', { buffer: payload, mimeType: 'application/pdf' }, 1);
    void other;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await staging.purgeExpired()).toBeGreaterThanOrEqual(1);
  });

  it('no entrega nada si el archivo fue manipulado', async () => {
    const staging = new EncryptedFileStaging(dir, key);
    const ref = await staging.stage('safe-key', { buffer: payload, mimeType: 'application/pdf' }, 60_000);
    const filePath = path.join(dir, 'safe-key.json');
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as { data: string };
    parsed.data = Buffer.from('tampered').toString('base64');
    await fs.writeFile(filePath, JSON.stringify(parsed));
    expect(await staging.fetch(ref.uri)).toBeNull();
  });

  it('rechaza llaves cortas y claves inseguras', async () => {
    expect(() => new EncryptedFileStaging(dir, crypto.randomBytes(16))).toThrow();
    const staging = new EncryptedFileStaging(dir, key);
    await expect(staging.stage('../escape', { buffer: payload, mimeType: 'x' }, 1000)).rejects.toThrow();
    expect(await staging.fetch('https://evil')).toBeNull();
    await expect(staging.remove('staging:missing')).resolves.toBeUndefined();
  });

  it('el adaptador en memoria respeta la misma semantica', async () => {
    const staging = new InMemoryStaging();
    const ref = await staging.stage('mem-key', { buffer: payload, mimeType: 'image/png' }, 60_000);
    expect((await staging.fetch(ref.uri))?.buffer.equals(payload)).toBe(true);
    const expired = await staging.stage('mem-old', { buffer: payload, mimeType: 'image/png' }, 1);
    void expired;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await staging.purgeExpired()).toBe(1);
    await staging.remove(ref.uri);
    expect(await staging.fetch(ref.uri)).toBeNull();
  });
});
