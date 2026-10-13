import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { LegalProvision } from '../src/domain/entities/LegalProvision';
import { HuggingFaceLocalEmbeddingProvider } from '../src/infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import { PostgresLegalProvisionRepository } from '../src/infrastructure/repositories/LegalProvisionRepositoryImpl';
import { config } from '../src/shared/config';
import { logger } from '../src/shared/logger';
import { pool } from '../src/infrastructure/database/pool';

const provisionSchema = z.object({
  id: z.string().min(1),
  jurisdiction: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  reference: z.string().min(1),
  text: z.string().min(1),
}).strict();
const corpusSchema = z.array(provisionSchema).min(10).max(20);
const JURISDICTION = 'CO';

async function seedLegalProvisions(): Promise<void> {
  const sourcePath = path.resolve(__dirname, '../../data/legal/CO.json');
  const rawCorpus: unknown = JSON.parse(await readFile(sourcePath, 'utf8'));
  const corpus = corpusSchema.parse(rawCorpus);
  if (corpus.some((provision) => provision.jurisdiction !== JURISDICTION)) {
    throw new Error(`The ${sourcePath} corpus must contain only ${JURISDICTION} provisions.`);
  }

  const embedder = new HuggingFaceLocalEmbeddingProvider(
    path.resolve(process.cwd(), config.EMBEDDING_CACHE_DIR),
  );
  const provisions: LegalProvision[] = [];
  for (const item of corpus) {
    provisions.push(new LegalProvision({
      ...item,
      embedding: await embedder.embed(
      `${item.reference}. ${item.text}`,
      'document',
      ),
    }));
  }

  const repository = new PostgresLegalProvisionRepository(pool);
  await repository.saveMany(provisions);
  logger.info('Curated legal provisions seeded', {
    jurisdiction: JURISDICTION,
    count: provisions.length,
    sourcePath,
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
