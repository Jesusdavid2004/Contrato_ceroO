import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { LegalSourceDefinition } from '../../domain/services/LegalSources';

const sourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['page', 'feed']),
  tema: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().startsWith('https://'),
  verifiesProvisionUrls: z.array(z.string().url()).optional(),
}).strict();

const catalogSchema = z.object({
  version: z.literal(1),
  sources: z.array(sourceSchema).min(1),
}).strict();

export const SOURCE_CATALOG_FILE = 'sources.json';

function parseCatalog(content: string, filePath: string): LegalSourceDefinition[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Legal source catalog has invalid JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid legal source catalog at ${filePath}: ${parsed.error.message}`);
  }
  const seen = new Set<string>();
  for (const source of parsed.data.sources) {
    if (seen.has(source.id)) throw new Error(`Duplicate legal source id '${source.id}' in ${filePath}.`);
    seen.add(source.id);
  }
  return parsed.data.sources;
}

/** Loads the curated list of official sources. Unknown fields, duplicate ids and non-https urls are rejected. */
export async function loadLegalSourceCatalog(corpusDir: string): Promise<LegalSourceDefinition[]> {
  const filePath = path.join(corpusDir, SOURCE_CATALOG_FILE);
  return parseCatalog(await fs.readFile(filePath, 'utf8'), filePath);
}

/** Synchronous variant for the composition root, which builds the app synchronously. */
export function loadLegalSourceCatalogSync(corpusDir: string): LegalSourceDefinition[] {
  const filePath = path.join(corpusDir, SOURCE_CATALOG_FILE);
  return parseCatalog(readFileSync(filePath, 'utf8'), filePath);
}
