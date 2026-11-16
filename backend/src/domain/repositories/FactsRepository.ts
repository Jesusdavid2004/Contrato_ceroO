import type { ExtractedFactStatus, FactKey } from '../services/ContractFacts';

export type StoredFactStatus = ExtractedFactStatus | 'confirmed' | 'corrected';

export interface StoredContractFact {
  key: FactKey;
  value: string | null;
  status: StoredFactStatus;
  evidenceClauseId: string | null;
  evidenceQuote: string | null;
}

export interface FactsRepository {
  saveFacts(contractId: string, facts: StoredContractFact[]): Promise<void>;
  getFacts(contractId: string): Promise<StoredContractFact[]>;
  updateFact(
    contractId: string,
    key: FactKey,
    value: string | null,
    status: 'confirmed' | 'corrected',
  ): Promise<StoredContractFact | null>;
}
