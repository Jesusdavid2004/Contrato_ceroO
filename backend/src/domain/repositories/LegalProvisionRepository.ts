import { LegalProvision } from '../entities/LegalProvision';

export interface LegalProvisionRepository {
  findTopRelevant(
    jurisdiction: string,
    queryEmbedding: number[],
    limit?: number,
  ): Promise<LegalProvision[]>;
  saveMany(provisions: LegalProvision[]): Promise<void>;
  /** Stamps the verification date (YYYY-MM-DD) on every provision citing one of these source urls. */
  markSourcesVerified(sourceUrls: readonly string[], verifiedOn: string): Promise<number>;
  countByJurisdiction(jurisdiction: string): Promise<number>;
}
