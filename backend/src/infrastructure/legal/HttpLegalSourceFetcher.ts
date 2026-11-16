import { readdirSync, readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { LegalSourceUnavailableError } from '../../domain/exceptions/index';
import type { LegalFeedEntry, LegalSourceFetcher } from '../../domain/services/LegalSources';
import { logger } from '../../shared/logger';

export const LEGAL_FETCH_TIMEOUT_MS = 25_000;
export const LEGAL_FETCH_MAX_BYTES = 4 * 1024 * 1024;
export const LEGAL_FETCH_MAX_REDIRECTS = 3;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const USER_AGENT = 'ContratoClaroLegalRadar/1.0 (change detection for public legal texts)';
const CA_DIRECTORY = 'ca';

export interface HttpGetOptions {
  timeoutMs: number;
  maxBytes: number;
}

export interface HttpGetResult {
  status: number;
  body: Uint8Array;
}

/** Minimal GET port so tests never touch the network. Must follow redirects itself. */
export type HttpGet = (url: string, options: HttpGetOptions) => Promise<HttpGetResult>;

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

/** Public CA certificates shipped next to the corpus (see data/legal/ca/README.md). */
export function loadExtraCaCertificates(corpusDir: string): string[] {
  const directory = path.join(corpusDir, CA_DIRECTORY);
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith('.pem'))
      .map((file) => readFileSync(path.join(directory, file), 'utf8'));
  } catch {
    return [];
  }
}

/**
 * HTTPS GET with full certificate verification. The trust store is Node's
 * bundled roots plus the shipped extra CAs; verification is never disabled.
 */
export function createNodeHttpsGet(extraCa: readonly string[] = []): HttpGet {
  const ca = [...tls.rootCertificates, ...extraCa];
  const get = (url: string, options: HttpGetOptions, redirectsLeft: number): Promise<HttpGetResult> =>
    new Promise((resolve, reject) => {
      const request = https.get(
        url,
        { ca, timeout: options.timeoutMs, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9' } },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (status >= HTTP_REDIRECT_MIN && status <= HTTP_REDIRECT_MAX && location) {
            response.resume();
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            get(new URL(location, url).toString(), options, redirectsLeft - 1).then(resolve, reject);
            return;
          }
          const chunks: Buffer[] = [];
          let received = 0;
          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > options.maxBytes) {
              request.destroy(new Error('Response too large'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => resolve({ status, body: new Uint8Array(Buffer.concat(chunks)) }));
          response.on('error', reject);
        },
      );
      request.on('timeout', () => request.destroy(new Error('Request timed out')));
      request.on('error', reject);
    });
  return (url, options) => get(url, options, LEGAL_FETCH_MAX_REDIRECTS);
}

export class HttpLegalSourceFetcher implements LegalSourceFetcher {
  constructor(private readonly httpGet: HttpGet = createNodeHttpsGet()) {}

  public async fetchPageText(url: string): Promise<string> {
    return htmlToText(await this.download(url));
  }

  public async fetchFeedEntries(url: string): Promise<LegalFeedEntry[]> {
    return parseRssEntries(await this.download(url));
  }

  private async download(url: string): Promise<string> {
    if (!url.startsWith('https://')) throw new LegalSourceUnavailableError(url);
    let result: HttpGetResult;
    try {
      result = await this.httpGet(url, { timeoutMs: LEGAL_FETCH_TIMEOUT_MS, maxBytes: LEGAL_FETCH_MAX_BYTES });
    } catch (error) {
      logger.warn('Legal source request failed', {
        url,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      throw new LegalSourceUnavailableError(url);
    }
    if (result.status < HTTP_OK_MIN || result.status > HTTP_OK_MAX || result.body.byteLength === 0) {
      logger.warn('Legal source returned an unusable response', { url, status: result.status, size: result.body.byteLength });
      throw new LegalSourceUnavailableError(url);
    }
    return new TextDecoder('utf-8').decode(result.body);
  }
}
