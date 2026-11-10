import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLegalCorpus } from '../scripts/legal-validate';

function provision(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    jurisdiction: 'CO',
    sourceName: 'Fuente oficial',
    sourceUrl: 'https://example.gov.co/norma',
    reference: `Ley 1, artículo ${id}`,
    text: 'Texto de la norma.',
    tema: 'arriendo',
    vigenciaDesde: '2003-07-10',
    fuenteVerificadaEn: '2026-11-03',
    ...overrides,
  };
}

describe('legal:validate', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'corpus-test-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function writeCorpus(manifest: unknown, files: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), JSON.stringify(content));
    }
  }

  it('valida el corpus y resume cobertura sin base de datos', async () => {
    await writeCorpus(
      { version: 1, files: [{ file: 'CO-A.json', tema: 'arriendo' }] },
      { 'CO-A.json': [provision('a1'), provision('a2')] },
    );
    const result = await validateLegalCorpus(dir, 'CO');
    expect(result.coverage.total).toBe(2);
    expect(result.coverage.files[0]).toMatchObject({ file: 'CO-A.json', tema: 'arriendo', count: 2 });
  });

  it('rechaza tema incoherente, duplicados y otra jurisdiccion', async () => {
    await writeCorpus(
      { version: 1, files: [{ file: 'CO-A.json', tema: 'arriendo' }] },
      { 'CO-A.json': [provision('a1', { tema: 'consumo' })] },
    );
    await expect(validateLegalCorpus(dir, 'CO')).rejects.toThrow(/tema/);

    await writeCorpus(
      { version: 1, files: [{ file: 'CO-A.json', tema: 'arriendo' }] },
      { 'CO-A.json': [provision('dup'), provision('dup')] },
    );
    await expect(validateLegalCorpus(dir, 'CO')).rejects.toThrow(/Duplicate/);

    await writeCorpus(
      { version: 1, files: [{ file: 'CO-A.json', tema: 'arriendo' }] },
      { 'CO-A.json': [provision('mx1', { jurisdiction: 'MX' })] },
    );
    await expect(validateLegalCorpus(dir, 'CO')).rejects.toThrow(/jurisdiction/);
  });

  it('valida el corpus real del repositorio', async () => {
    const real = path.resolve(__dirname, '..', 'data/legal');
    const result = await validateLegalCorpus(real, 'CO');
    expect(result.coverage.total).toBeGreaterThan(0);
    expect(result.coverage.files.map((file) => file.tema).sort()).toEqual(['arriendo', 'consumo']);
  });
});
