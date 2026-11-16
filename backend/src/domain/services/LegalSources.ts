/**
 * Legal radar ports and pure helpers.
 *
 * A source is either a `page` (an official text whose change means the norm
 * changed) or a `feed` (a news/announcement feed; each new entry is an update).
 * Fetching lives behind `LegalSourceFetcher` so the use case is testable and
 * the network is never reachable from the domain.
 */

export type LegalSourceKind = 'page' | 'feed';

export interface LegalSourceDefinition {
  id: string;
  kind: LegalSourceKind;
  tema: string;
  title: string;
  url: string;
  /** Corpus provision URLs whose "verified on" date is refreshed when this page is reachable. */
  verifiesProvisionUrls?: string[];
}

export interface LegalFeedEntry {
  /** Stable identifier of the entry (guid or link). */
  guid: string;
  title: string;
  link: string;
  publishedAt: Date | null;
}

export interface LegalSourceFetcher {
  /** Returns the visible text of an official page. Throws a typed error on failure. */
  fetchPageText(url: string): Promise<string>;
  fetchFeedEntries(url: string): Promise<LegalFeedEntry[]>;
}

const WHITESPACE = /\s+/g;

/** Collapses whitespace and lowercases so cosmetic changes never look like a legal change. */
export function normalizeForHash(text: string): string {
  return text.replace(WHITESPACE, ' ').trim().toLowerCase();
}

/** Keeps the feed handling bounded: a feed can never flood the updates table. */
export const MAX_FEED_ENTRIES_PER_SOURCE = 10;
/** Entries older than this are ignored on the first run so the radar starts with fresh news only. */
export const FEED_ENTRY_MAX_AGE_DAYS = 14;
