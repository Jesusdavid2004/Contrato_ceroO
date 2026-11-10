import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Versioned, multi-file legal corpus loader.
 *
 * A `manifest.json` inside the corpus directory lists one JSON file per legal
 * domain (e.g. arriendo, consumo). Each file validates against
 * `corpusItemSchema`; items also carry a curation `tema` plus validity
 * metadata so the frontend can show *which* law domain each citation comes
 * from and *when* it was last verified against an official source.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const corpusItemSchema = z.object({
  id: z.string().min(1),
  jurisdiction: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  reference: z.string().min(1),
  text: z.string().min(1),
  tema: z.string().min(1),
  vigenciaDesde: z.string().regex(ISO_DATE, 'vigenciaDesde must be YYYY-MM-DD'),
  fuenteVerificadaEn: z.string().regex(ISO_DATE, 'fuenteVerificadaEn must be YYYY-MM-DD'),
}).strict();

export const manifestSchema = z.object({
  version: z.literal(1),
  files: z.array(z.object({
    file: z.string().min(1),
    tema: z.string().min(1),
  })).min(1),
}).strict();

export type CorpusItemInput = z.infer<typeof corpusItemSchema>;

export interface LoadedCorpusItem extends CorpusItemInput {
  /** Corpus file the item was loaded from (relative to the corpus root). */
  file: string;
}

export interface CorpusFileReport {
  file: string;
  tema: string;
  count: number;
  minFuenteVerificadaEn: string;
  vigenciaDesdeMin: string;
  vigenciaDesdeMax: string;
}

export interface CorpusCoverageReport {
  generatedAt: string;
  jurisdiction: string;
  total: number;
  files: CorpusFileReport[];
}

/**
 * Localiza el corpus curado tanto en desarrollo (backend/data/legal) como en
 * dist/ y en la imagen Docker (WORKDIR con data copiada). Sin esto el seed
 * falla porque tsc no copia JSON al compilar.
 */
export function resolveCorpusDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data/legal'),
    path.resolve(__dirname, '..', '..', '..', 'data/legal'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(path.join(candidate, 'manifest.json'))) return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Legal corpus not found. Tried: ${candidates.join(', ')}.`,
  );
}

function minOf(values: string[]): string {
  return values.slice().sort()[0];
}

function maxOf(values: string[]): string {
  const sorted = values.slice().sort();
  return sorted[sorted.length - 1];
}

export function buildCoverageReport(
  items: LoadedCorpusItem[],
  generatedAt: string = new Date().toISOString(),
  jurisdiction = 'CO',
): CorpusCoverageReport {
  const byFile = new Map<string, LoadedCorpusItem[]>();
  for (const item of items) {
    const group = byFile.get(item.file) ?? [];
    group.push(item);
    byFile.set(item.file, group);
  }
  const files: CorpusFileReport[] = [...byFile.entries()].map(([file, group]) => ({
    file,
    tema: group[0].tema,
    count: group.length,
    minFuenteVerificadaEn: minOf(group.map((item) => item.fuenteVerificadaEn)),
    vigenciaDesdeMin: minOf(group.map((item) => item.vigenciaDesde)),
    vigenciaDesdeMax: maxOf(group.map((item) => item.vigenciaDesde)),
  }));
  return { generatedAt, jurisdiction, total: items.length, files };
}

export async function loadLegalCorpus(
  baseDir: string,
  jurisdiction = 'CO',
): Promise<LoadedCorpusItem[]> {
  const manifestPath = path.join(baseDir, 'manifest.json');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Legal corpus manifest not found or invalid JSON at ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const manifestParse = manifestSchema.safeParse(manifestRaw);
  if (!manifestParse.success) {
    throw new Error(`Invalid legal corpus manifest at ${manifestPath}: ${manifestParse.error.message}`);
  }

  const items: LoadedCorpusItem[] = [];
  const seenIds = new Map<string, string>();
  for (const entry of manifestParse.data.files) {
    const filePath = path.join(baseDir, entry.file);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Legal corpus file not found or invalid JSON at ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!Array.isArray(raw)) {
      throw new Error(`Legal corpus file ${entry.file} must contain a JSON array.`);
    }
    if (raw.length === 0) {
      throw new Error(`Legal corpus file ${entry.file} must contain at least one provision.`);
    }
    raw.forEach((candidate: unknown, index: number) => {
      const parsed = corpusItemSchema.safeParse(candidate);
      if (!parsed.success) {
        throw new Error(
          `Invalid legal provision at ${entry.file}[${index}]: ${parsed.error.message}`,
        );
      }
      if (parsed.data.jurisdiction !== jurisdiction) {
        throw new Error(
          `Legal provision ${parsed.data.id} in ${entry.file} has jurisdiction '${parsed.data.jurisdiction}', expected '${jurisdiction}'.`,
        );
      }
      if (parsed.data.tema !== entry.tema) {
        throw new Error(
          `Legal provision ${parsed.data.id} in ${entry.file} declares tema '${parsed.data.tema}' but the manifest assigns tema '${entry.tema}'.`,
        );
      }
      const firstSeen = seenIds.get(parsed.data.id);
      if (firstSeen !== undefined) {
        throw new Error(
          `Duplicate legal provision id '${parsed.data.id}' in ${entry.file} (already defined in ${firstSeen}).`,
        );
      }
      seenIds.set(parsed.data.id, entry.file);
      items.push({ ...parsed.data, file: entry.file });
    });
  }
  return items;
}
