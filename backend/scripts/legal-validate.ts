import {
  buildCoverageReport,
  loadLegalCorpus,
  resolveCorpusDir,
  type CorpusCoverageReport,
} from '../src/infrastructure/legal/corpusLoader';
import { logger } from '../src/shared/logger';

export interface LegalValidationResult {
  coverage: CorpusCoverageReport;
  corpusDir: string;
}

/**
 * Valida el corpus curado sin base de datos ni embeddings: esquema,
 * jurisdiccion, coherencia manifest-tema y duplicados. Pensado para CI y
 * revision de fuentes antes de importar.
 */
export async function validateLegalCorpus(
  corpusDir?: string,
  jurisdiction = 'CO',
): Promise<LegalValidationResult> {
  const dir = corpusDir ?? resolveCorpusDir();
  const items = await loadLegalCorpus(dir, jurisdiction);
  return {
    coverage: buildCoverageReport(items, new Date().toISOString(), jurisdiction),
    corpusDir: dir,
  };
}

const isMain = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/legal-validate.js')
  || (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('dist/scripts/legal-validate.js');

if (isMain) {
  const jurisdiction = process.argv[2] ?? 'CO';
  validateLegalCorpus(undefined, jurisdiction)
    .then((result) => {
      logger.info('Legal corpus valid', {
        jurisdiction,
        total: result.coverage.total,
        files: result.coverage.files.map((file) => `${file.file} (${file.tema}, ${file.count})`),
      });
      process.stdout.write(`${JSON.stringify(result.coverage, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      logger.error('Legal corpus invalid', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exitCode = 1;
    });
}
