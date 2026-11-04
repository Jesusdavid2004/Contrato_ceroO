import path from 'node:path';
import { promises as fs } from 'node:fs';
import { HuggingFaceLocalEmbeddingProvider } from '../src/infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import { PostgresLegalProvisionRepository } from '../src/infrastructure/repositories/LegalProvisionRepositoryImpl';
import { LegalProvision } from '../src/domain/entities/LegalProvision';
import {
  buildCoverageReport,
  loadLegalCorpus,
} from '../src/infrastructure/legal/corpusLoader';
import { config } from '../src/shared/config';
import { logger } from '../src/shared/logger';
import { pool } from '../src/infrastructure/database/pool';

const CORPUS_DIRNAME = 'data/legal';

/**
 * Seeds the versioned, multi-domain legal corpus declared in
 * `backend/data/legal/manifest.json`. Every provision is embedded with the
 * local multilingual model (no external API), upserted by id, and summarized
 * into a committed coverage report for the frontend Coverage page.
 */
async function seedLegalProvisions(): Promise<void> {
  const corpusDir = path.resolve(__dirname, '..', CORPUS_DIRNAME);
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
  // Frontend copy: the Coverage page imports this generated file at build time.
  // It is committed so the UI works without running the seed.
  await fs.writeFile(
    path.resolve(__dirname, '../../../frontend/src/data/legal-coverage.json'),
    `${JSON.stringify(coverage, null, 2)}\n`,
    'utf8',
  );

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
