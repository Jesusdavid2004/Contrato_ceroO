import { LegalProvision } from '../entities/LegalProvision';

export interface LegalProvisionRepository {
  findTopRelevant(
    jurisdiction: string,
    queryEmbedding: number[],
    limit?: number,
  ): Promise<LegalProvision[]>;
  saveMany(provisions: LegalProvision[]): Promise<void>;
  countByJurisdiction(jurisdiction: string): Promise<number>;
}
