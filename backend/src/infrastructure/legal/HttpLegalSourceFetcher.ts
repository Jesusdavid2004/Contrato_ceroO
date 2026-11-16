import { LegalSourceUnavailableError } from '../../domain/exceptions/index';
import type { LegalFeedEntry, LegalSourceFetcher } from '../../domain/services/LegalSources';
import { logger } from '../../shared/logger';

export const LEGAL_FETCH_TIMEOUT_MS = 25_000;
export const LEGAL_FETCH_MAX_BYTES = 4 * 1024 * 1024;
const USER_AGENT = 'ContratoClaroLegalRadar/1.0 (+change-detection; contact via repository)';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

/** Visible text of an HTML document: scripts, styles, comments and tags removed. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function tagValue(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!match) return '';
  return decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

/** Parses RSS 2.0 items; atom feeds are out of scope for the curated catalog. */
export function parseRssEntries(xml: string): LegalFeedEntry[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((item) => {
    const title = tagValue(item, 'title');
    const link = tagValue(item, 'link');
    if (!title || !link) return [];
    const published = Date.parse(tagValue(item, 'pubDate'));
    return [{
      guid: tagValue(item, 'guid') || link,
      title,
      link,
      publishedAt: Number.isNaN(published) ? null : new Date(published),
    }];
  });
}

export class HttpLegalSourceFetcher implements LegalSourceFetcher {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  public async fetchPageText(url: string): Promise<string> {
    return htmlToText(await this.download(url));
  }

  public async fetchFeedEntries(url: string): Promise<LegalFeedEntry[]> {
    return parseRssEntries(await this.download(url));
  }

  private async download(url: string): Promise<string> {
    if (!url.startsWith('https://')) throw new LegalSourceUnavailableError(url);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9' },
        signal: AbortSignal.timeout(LEGAL_FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
    } catch (error) {
      logger.warn('Legal source request failed', { url, errorName: error instanceof Error ? error.name : 'UnknownError' });
      throw new LegalSourceUnavailableError(url);
    }
    if (!response.ok) {
      logger.warn('Legal source returned an error status', { url, status: response.status });
      throw new LegalSourceUnavailableError(url);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LEGAL_FETCH_MAX_BYTES) {
      logger.warn('Legal source body rejected', { url, size: bytes.byteLength });
      throw new LegalSourceUnavailableError(url);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}
