import { describe, it, expect, vi } from 'vitest';
import { RefreshLegalSourcesUseCase } from '../src/application/use-cases/RefreshLegalSourcesUseCase';
import { LegalSourceUnavailableError } from '../src/domain/exceptions/index';
import type { LegalProvisionRepository } from '../src/domain/repositories/LegalProvisionRepository';
import type {
  LegalFeedEntry,
  LegalSourceDefinition,
  LegalSourceFetcher,
} from '../src/domain/services/LegalSources';
import { InMemoryLegalUpdatesRepository } from '../src/infrastructure/repositories/LegalUpdatesRepositoryImpl';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const page: LegalSourceDefinition = {
  id: 'law-1', kind: 'page', tema: 'arriendo', title: 'Ley 820 de 2003',
  url: 'https://example.test/law', verifiesProvisionUrls: ['https://example.test/provision'],
};
const feed: LegalSourceDefinition = {
  id: 'news-1', kind: 'feed', tema: 'arriendo', title: 'News', url: 'https://example.test/rss',
};

class FakeFetcher implements LegalSourceFetcher {
  public pageText = 'Articulo 1. Texto original.';
  public entries: LegalFeedEntry[] = [];
  public failing = new Set<string>();

  async fetchPageText(url: string): Promise<string> {
    if (this.failing.has(url)) throw new LegalSourceUnavailableError(url);
    return this.pageText;
  }

  async fetchFeedEntries(url: string): Promise<LegalFeedEntry[]> {
    if (this.failing.has(url)) throw new LegalSourceUnavailableError(url);
    return this.entries;
  }
}

function entry(guid: string, ageDays = 1): LegalFeedEntry {
  return { guid, title: `Titulo ${guid}`, link: `https://example.test/${guid}`, publishedAt: new Date(NOW.getTime() - ageDays * DAY_MS) };
}

function build(sources: LegalSourceDefinition[]) {
  const fetcher = new FakeFetcher();
  const updates = new InMemoryLegalUpdatesRepository();
  const markSourcesVerified = vi.fn(async () => 1);
  const provisions = { markSourcesVerified } as unknown as LegalProvisionRepository;
  const useCase = new RefreshLegalSourcesUseCase(sources, fetcher, updates, provisions, () => NOW);
  const recent = () => updates.listRecent({ temas: ['arriendo'], since: new Date(0), limit: 50 });
  return { fetcher, updates, useCase, recent, markSourcesVerified };
}

describe('RefreshLegalSourcesUseCase - pages', () => {
  it('stores a baseline on the first run without creating an update', async () => {
    const { useCase, recent } = build([page]);
    const summary = await useCase.execute();
    expect(summary.results[0].status).toBe('baseline');
    expect(await recent()).toEqual([]);
  });

  it('reports unchanged when only whitespace and case differ', async () => {
    const { useCase, fetcher } = build([page]);
    await useCase.execute();
    fetcher.pageText = '  ARTICULO 1.   texto ORIGINAL. ';
    expect((await useCase.execute()).results[0].status).toBe('unchanged');
  });

  it('creates exactly one norm_change update when the official text changes', async () => {
    const { useCase, fetcher, recent } = build([page]);
    await useCase.execute();
    fetcher.pageText = 'Articulo 1. Texto MODIFICADO por la Ley 9999.';
    const summary = await useCase.execute();
    expect(summary.results[0]).toMatchObject({ status: 'changed', newUpdates: 1 });
    await useCase.execute();
    const updates = await recent();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ kind: 'norm_change', tema: 'arriendo', sourceUrl: page.url });
  });

  it('stamps provision verification only while the source is unchanged', async () => {
    const { useCase, fetcher, markSourcesVerified } = build([page]);
    await useCase.execute();
    await useCase.execute();
    expect(markSourcesVerified).toHaveBeenCalledTimes(2);
    expect(markSourcesVerified).toHaveBeenLastCalledWith(['https://example.test/provision'], '2026-11-16');
    fetcher.pageText = 'texto cambiado';
    await useCase.execute();
    expect(markSourcesVerified).toHaveBeenCalledTimes(2);
  });
});

describe('RefreshLegalSourcesUseCase - feeds', () => {
  it('creates news updates once per entry and skips entries older than the window', async () => {
    const { useCase, fetcher, recent } = build([feed]);
    fetcher.entries = [entry('a'), entry('b'), entry('old', 60)];
    const first = await useCase.execute();
    expect(first.newUpdates).toBe(2);
    const second = await useCase.execute();
    expect(second.newUpdates).toBe(0);
    const updates = await recent();
    expect(updates.map((update) => update.kind)).toEqual(['news', 'news']);
  });

  it('ignores entries whose link is not https', async () => {
    const { useCase, fetcher } = build([feed]);
    fetcher.entries = [{ guid: 'x', title: 'x', link: 'http://example.test/x', publishedAt: NOW }];
    expect((await useCase.execute()).newUpdates).toBe(0);
  });
});

describe('RefreshLegalSourcesUseCase - isolation', () => {
  it('keeps checking other sources when one fails', async () => {
    const { useCase, fetcher } = build([page, feed]);
    fetcher.failing.add(page.url);
    fetcher.entries = [entry('a')];
    const summary = await useCase.execute();
    expect(summary.failed).toBe(1);
    expect(summary.newUpdates).toBe(1);
    expect(summary.results.map((result) => result.status)).toEqual(['failed', 'changed']);
  });
});
