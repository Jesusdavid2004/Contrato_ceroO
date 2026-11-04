import { describe, expect, it, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCoverageReport, loadLegalCorpus } from '../src/infrastructure/legal/corpusLoader';

const VALID_ITEM = {
  id: 'co-test-art1',
  jurisdiction: 'CO',
  sourceName: 'Ley de prueba',
  sourceUrl: 'https://example.test/ley',
  reference: 'Ley 1 de 2000, Art. 1',
  text: 'Texto de prueba.',
  tema: 'arriendo',
  vigenciaDesde: '2000-01-01',
  fuenteVerificadaEn: '2026-11-03',
};

async function writeCorpus(files: Record<string, unknown>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'corpus-'));
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), JSON.stringify(content));
  }
  return dir;
}

describe('loadLegalCorpus', () => {
  let dir = '';

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = '';
  });

  it('loads and validates a multi-file corpus, tagging each item with its file', async () => {
    dir = await writeCorpus({
      'manifest.json': { version: 1, files: [{ file: 'CO-A.json', tema: 'arriendo' }] },
      'CO-A.json': [{ ...VALID_ITEM }, { ...VALID_ITEM, id: 'co-test-art2', reference: 'Ley 1, Art. 2' }],
    });
    const items = await loadLegalCorpus(dir);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'co-test-art1', tema: 'arriendo', file: 'CO-A.json' });
  });

  it('rejects duplicate ids across files, naming both files', async () => {
    dir = await writeCorpus({
      'manifest.json': {
        version: 1,
        files: [{ file: 'A.json', tema: 'arriendo' }, { file: 'B.json', tema: 'consumo' }],
      },
      'A.json': [{ ...VALID_ITEM }],
      'B.json': [{ ...VALID_ITEM, tema: 'consumo' }],
    });
    await expect(loadLegalCorpus(dir)).rejects.toThrow(/already defined in A\.json/);
  });

  it('rejects items whose tema does not match the manifest entry', async () => {
    dir = await writeCorpus({
      'manifest.json': { version: 1, files: [{ file: 'A.json', tema: 'arriendo' }] },
      'A.json': [{ ...VALID_ITEM, tema: 'laboral' }],
    });
    await expect(loadLegalCorpus(dir)).rejects.toThrow(/tema 'laboral'.*'arriendo'/);
  });

  it('rejects non-CO jurisdictions and malformed files with the file name in the error', async () => {
    dir = await writeCorpus({
      'manifest.json': { version: 1, files: [{ file: 'A.json', tema: 'arriendo' }, { file: 'B.json', tema: 'arriendo' }] },
      'A.json': [{ ...VALID_ITEM, jurisdiction: 'MX' }],
      'B.json': [{ ...VALID_ITEM, id: 'x', vigenciaDesde: 'no-a-date' }],
    });
    await expect(loadLegalCorpus(dir)).rejects.toThrow(/jurisdiction/);
  });

  it('rejects a missing manifest with a clear path', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'corpus-empty-'));
    await expect(loadLegalCorpus(dir)).rejects.toThrow(/manifest\.json/);
  });

  it('rejects unknown extra fields (strict schema keeps the corpus auditable)', async () => {
    dir = await writeCorpus({
      'manifest.json': { version: 1, files: [{ file: 'A.json', tema: 'arriendo' }] },
      'A.json': [{ ...VALID_ITEM, unexpectedField: 'oops' }],
    });
    await expect(loadLegalCorpus(dir)).rejects.toThrow(/A\.json\[0\]/);
  });
});

describe('buildCoverageReport', () => {
  it('aggregates counts and verification dates per file', () => {
    const report = buildCoverageReport(
      [
        { ...VALID_ITEM, id: 'a1', file: 'CO-A.json', fuenteVerificadaEn: '2026-11-03', vigenciaDesde: '2003-07-10' },
        { ...VALID_ITEM, id: 'a2', file: 'CO-A.json', fuenteVerificadaEn: '2026-11-01', vigenciaDesde: '2003-07-10' },
        { ...VALID_ITEM, id: 'b1', tema: 'consumo', file: 'CO-B.json', fuenteVerificadaEn: '2026-11-03', vigenciaDesde: '2011-10-12' },
      ],
      '2026-11-03T00:00:00.000Z',
    );
    expect(report.total).toBe(3);
    expect(report.files).toEqual([
      { file: 'CO-A.json', tema: 'arriendo', count: 2, minFuenteVerificadaEn: '2026-11-01', vigenciaDesdeMin: '2003-07-10', vigenciaDesdeMax: '2003-07-10' },
      { file: 'CO-B.json', tema: 'consumo', count: 1, minFuenteVerificadaEn: '2026-11-03', vigenciaDesdeMin: '2011-10-12', vigenciaDesdeMax: '2011-10-12' },
    ]);
  });
});
