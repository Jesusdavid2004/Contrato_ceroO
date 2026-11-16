import { createHash, randomUUID } from 'node:crypto';
import { LegalUpdate } from '../../domain/entities/LegalUpdate';
import type { LegalProvisionRepository } from '../../domain/repositories/LegalProvisionRepository';
import type { LegalUpdatesRepository } from '../../domain/repositories/LegalUpdatesRepository';
import {
  FEED_ENTRY_MAX_AGE_DAYS,
  MAX_FEED_ENTRIES_PER_SOURCE,
  normalizeForHash,
  type LegalSourceDefinition,
  type LegalSourceFetcher,
} from '../../domain/services/LegalSources';
import { logger } from '../../shared/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_LENGTH = 10;

export interface SourceRefreshResult {
  sourceId: string;
  status: 'baseline' | 'unchanged' | 'changed' | 'failed';
  newUpdates: number;
}

export interface RefreshSummary {
  checked: number;
  newUpdates: number;
  failed: number;
  results: SourceRefreshResult[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Polls the curated official sources and records what changed.
 *
 * - Page: the first fetch stores a baseline (no update, we cannot know what is
 *   "new"); a later hash change creates one `norm_change` update.
 * - Feed: every entry not seen before (by guid hash) and recent enough creates
 *   one `news` update.
 * One failing source never prevents the others from being checked.
 */
export class RefreshLegalSourcesUseCase {
  constructor(
    private readonly sources: readonly LegalSourceDefinition[],
    private readonly fetcher: LegalSourceFetcher,
    private readonly updates: LegalUpdatesRepository,
    private readonly provisions?: LegalProvisionRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(): Promise<RefreshSummary> {
    const results: SourceRefreshResult[] = [];
    for (const source of this.sources) {
      results.push(await this.refreshOne(source));
    }
    return {
      checked: results.length,
      newUpdates: results.reduce((total, result) => total + result.newUpdates, 0),
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
  }

  private async refreshOne(source: LegalSourceDefinition): Promise<SourceRefreshResult> {
    try {
      return source.kind === 'page' ? await this.refreshPage(source) : await this.refreshFeed(source);
    } catch (error) {
      logger.warn('Legal source refresh failed', {
        sourceId: source.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return { sourceId: source.id, status: 'failed', newUpdates: 0 };
    }
  }

  private async refreshPage(source: LegalSourceDefinition): Promise<SourceRefreshResult> {
    const now = this.clock();
    const hash = sha256(normalizeForHash(await this.fetcher.fetchPageText(source.url)));
    const previous = await this.updates.getSourceState(source.id);
    await this.updates.saveSourceState({ sourceId: source.id, contentHash: hash, checkedAt: now });

    if (!previous || previous.contentHash === hash) {
      // The "verified on" date only advances while the official text is unchanged;
      // after a change the curated provisions must be reviewed before being re-stamped.
      await this.stampVerified(source, now);
      return { sourceId: source.id, status: previous ? 'unchanged' : 'baseline', newUpdates: 0 };
    }

    const created = await this.updates.saveIfNew(new LegalUpdate({
      id: `upd-${randomUUID()}`,
      sourceId: source.id,
      tema: source.tema,
      kind: 'norm_change',
      title: source.title,
      sourceUrl: source.url,
      contentHash: hash,
      detectedAt: now,
    }));
    return { sourceId: source.id, status: 'changed', newUpdates: created ? 1 : 0 };
  }

  private async refreshFeed(source: LegalSourceDefinition): Promise<SourceRefreshResult> {
    const now = this.clock();
    const oldest = now.getTime() - FEED_ENTRY_MAX_AGE_DAYS * MS_PER_DAY;
    const entries = (await this.fetcher.fetchFeedEntries(source.url))
      .filter((entry) => entry.link.startsWith('https://'))
      .filter((entry) => entry.publishedAt === null || entry.publishedAt.getTime() >= oldest)
      .slice(0, MAX_FEED_ENTRIES_PER_SOURCE);

    let created = 0;
    for (const entry of entries) {
      const saved = await this.updates.saveIfNew(new LegalUpdate({
        id: `upd-${randomUUID()}`,
        sourceId: source.id,
        tema: source.tema,
        kind: 'news',
        title: entry.title,
        sourceUrl: entry.link,
        contentHash: sha256(entry.guid),
        detectedAt: entry.publishedAt ?? now,
      }));
      if (saved) created += 1;
    }
    await this.updates.saveSourceState({ sourceId: source.id, contentHash: sha256(`feed:${entries.length}`), checkedAt: now });
    return { sourceId: source.id, status: created > 0 ? 'changed' : 'unchanged', newUpdates: created };
  }

  private async stampVerified(source: LegalSourceDefinition, now: Date): Promise<void> {
    if (!this.provisions || !source.verifiesProvisionUrls?.length) return;
    await this.provisions.markSourcesVerified(source.verifiesProvisionUrls, now.toISOString().slice(0, ISO_DATE_LENGTH));
  }
}
