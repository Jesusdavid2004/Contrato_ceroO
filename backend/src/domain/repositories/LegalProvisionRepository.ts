import { LegalProvision } from '../entities/LegalProvision';

export interface LegalProvisionRepository {
  findTopRelevant(jurisdiction: string, queryText: string, limit?: number): Promise<LegalProvision[]>;
  saveMany(provisions: LegalProvision[]): Promise<void>;
  countByJurisdiction(jurisdiction: string): Promise<number>;
}
