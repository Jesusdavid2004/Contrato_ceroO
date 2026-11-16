import type { LegalUpdate } from '../entities/LegalUpdate';

export interface LegalSourceState {
  sourceId: string;
  contentHash: string;
  checkedAt: Date;
}

export interface RecentUpdatesQuery {
  temas: readonly string[];
  since: Date;
  limit: number;
}

export interface LegalUpdatesRepository {
  /** Returns false when an update with the same source and hash already exists. */
  saveIfNew(update: LegalUpdate): Promise<boolean>;
  listRecent(query: RecentUpdatesQuery): Promise<LegalUpdate[]>;
  getSourceState(sourceId: string): Promise<LegalSourceState | null>;
  listSourceStates(): Promise<LegalSourceState[]>;
  saveSourceState(state: LegalSourceState): Promise<void>;
}
