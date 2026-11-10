import path from 'node:path';
import { promises as fs } from 'node:fs';
import { HuggingFaceLocalEmbeddingProvider } from '../src/infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import { PostgresLegalProvisionRepository } from '../src/infrastructure/repositories/LegalProvisionRepositoryImpl';
import { LegalProvision } from '../src/domain/entities/LegalProvision';
import {
  buildCoverageReport,
  loadLegalCorpus,
  resolveCorpusDir,
} from '../src/infrastructure/legal/corpusLoader';
import { config } from '../src/shared/config';
import { logger } from '../src/shared/logger';
import { pool } from '../src/infrastructure/database/pool';

async function seedLegalProvisions(): Promise<void> {
  const corpusDir = resolveCorpusDir();
  const items = await loadLegalCorpus(corpusDir, 'CO');

  const embedder = new HuggingFaceLocalEmbeddingProvider(
    path.resolve(process.cwd(), config.EMBEDDING_CACHE_DIR),
  );
  const provisions: LegalProvision[] = [];
  for (const item of items) {
    provisions.push(new LegalProvision({
      id: item.id,
      jurisdiction: item.jurisdiction,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      reference: item.reference,
      text: item.text,
      tema: item.tema,
      vigenciaDesde: item.vigenciaDesde,
      fuenteVerificadaEn: item.fuenteVerificadaEn,
      embedding: await embedder.embed(
        `${item.reference}. ${item.text}`,
        'document',
      ),
    }));
  }

  const repository = new PostgresLegalProvisionRepository(pool);
  await repository.saveMany(provisions);

  const coverage = buildCoverageReport(items);
  await fs.writeFile(
    path.join(corpusDir, 'coverage.json'),
    `${JSON.stringify(coverage, null, 2)}\n`,
    'utf8',
  );
  // El frontend vive en otro repositorio: su copia
  // (Contrato_cero_fronent/src/data/legal-coverage.json) se sincroniza a mano
  // copiando backend/data/legal/coverage.json tras este seed.

  logger.info('Curated legal provisions seeded', {
    jurisdiction: 'CO',
    count: provisions.length,
    files: coverage.files.map((file) => `${file.file} (${file.tema}, ${file.count})`),
  });
}

seedLegalProvisions()
  .catch((error: unknown) => {
    logger.error('Failed to seed legal provisions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
