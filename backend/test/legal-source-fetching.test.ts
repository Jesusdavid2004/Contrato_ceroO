import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HttpLegalSourceFetcher,
  htmlToText,
  loadExtraCaCertificates,
  type HttpGet,
  parseRssEntries,
} from '../src/infrastructure/legal/HttpLegalSourceFetcher';
import { loadLegalSourceCatalog } from '../src/infrastructure/legal/sourceCatalogLoader';
import { resolveCorpusDir } from '../src/infrastructure/legal/corpusLoader';
import { LegalSourceUnavailableError } from '../src/domain/exceptions/index';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Nuevo decreto &amp; arriendo - Diario]]></title><link>https://example.test/a</link><guid isPermaLink="false">g-1</guid><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>Sin fecha</title><link>https://example.test/b</link></item>
<item><title></title><link>https://example.test/c</link></item>
</channel></rss>`;

describe('htmlToText', () => {
  it('removes scripts, styles, comments and tags and decodes entities', () => {
    const text = htmlToText('<html><head><style>p{}</style><script>var x=1</script></head><body><!-- c --><p>Art.&nbsp;1 &amp; 2</p></body></html>');
    expect(text).toBe('Art. 1 & 2');
  });
});

describe('parseRssEntries', () => {
  it('parses titles with CDATA and entities, guid and date, and skips incomplete items', () => {
    const entries = parseRssEntries(RSS);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ guid: 'g-1', title: 'Nuevo decreto & arriendo - Diario', link: 'https://example.test/a' });
    expect(entries[0].publishedAt?.toISOString()).toBe('2026-11-10T10:00:00.000Z');
    expect(entries[1].guid).toBe('https://example.test/b');
    expect(entries[1].publishedAt).toBeNull();
  });
});

describe('HttpLegalSourceFetcher', () => {
  const respond = (body: string, status = 200): HttpGet =>
    vi.fn(async () => ({ status, body: new TextEncoder().encode(body) }));

  it('returns visible page text', async () => {
    const fetcher = new HttpLegalSourceFetcher(respond('<p>Hola</p>'));
    expect(await fetcher.fetchPageText('https://example.test/p')).toBe('Hola');
  });

  it('parses feed entries from the downloaded xml', async () => {
    const fetcher = new HttpLegalSourceFetcher(respond(RSS));
    expect(await fetcher.fetchFeedEntries('https://example.test/rss')).toHaveLength(2);
  });

  it('refuses non-https urls without calling the network', async () => {
    const httpGet = respond('x');
    await expect(new HttpLegalSourceFetcher(httpGet).fetchPageText('http://example.test')).rejects.toBeInstanceOf(LegalSourceUnavailableError);
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('maps network errors, error statuses and empty bodies to a typed error', async () => {
    const failing: HttpGet = vi.fn(async () => { throw new Error('down'); });
    for (const httpGet of [failing, respond('nope', 404), respond('')]) {
      await expect(new HttpLegalSourceFetcher(httpGet).fetchPageText('https://example.test')).rejects.toBeInstanceOf(LegalSourceUnavailableError);
    }
  });
});

describe('loadExtraCaCertificates', () => {
  it('loads the shipped public CA chain and returns nothing for a directory without one', () => {
    const certificates = loadExtraCaCertificates(resolveCorpusDir());
    expect(certificates.length).toBeGreaterThan(0);
    expect(certificates[0]).toContain('BEGIN CERTIFICATE');
    expect(loadExtraCaCertificates(os.tmpdir())).toEqual([]);
  });
});

describe('loadLegalSourceCatalog', () => {
  it('loads the shipped catalog with unique https sources for every topic', async () => {
    const sources = await loadLegalSourceCatalog(resolveCorpusDir());
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sources.map((source) => source.id)).size).toBe(sources.length);
    expect(sources.every((source) => source.url.startsWith('https://'))).toBe(true);
    expect(new Set(sources.map((source) => source.tema))).toEqual(new Set(['arriendo', 'consumo']));
  });

  async function catalogWith(content: unknown): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-'));
    await fs.writeFile(path.join(dir, 'sources.json'), JSON.stringify(content));
    return dir;
  }

  it('rejects http urls, unknown fields and duplicate ids', async () => {
    const base = { id: 'a', kind: 'page', tema: 't', title: 'T', url: 'https://example.test' };
    await expect(loadLegalSourceCatalog(await catalogWith({ version: 1, sources: [{ ...base, url: 'http://example.test' }] }))).rejects.toThrow();
    await expect(loadLegalSourceCatalog(await catalogWith({ version: 1, sources: [{ ...base, extra: 1 }] }))).rejects.toThrow();
    await expect(loadLegalSourceCatalog(await catalogWith({ version: 1, sources: [base, base] }))).rejects.toThrow(/Duplicate/);
  });
});
