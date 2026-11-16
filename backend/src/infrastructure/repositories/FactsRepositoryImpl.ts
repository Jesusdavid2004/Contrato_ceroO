import type { Pool } from 'pg';
import type {
  FactsRepository,
  StoredContractFact,
} from '../../domain/repositories/FactsRepository';
import type { FactKey } from '../../domain/services/ContractFacts';

function toStored(row: {
  key: string;
  value: string | null;
  status: string;
  evidence_clause_id: string | null;
  evidence_quote: string | null;
}): StoredContractFact {
  return {
    key: row.key as FactKey,
    value: row.value,
    status: row.status as StoredContractFact['status'],
    evidenceClauseId: row.evidence_clause_id,
    evidenceQuote: row.evidence_quote,
  };
}

export class PostgresFactsRepository implements FactsRepository {
  constructor(private readonly pool: Pool) {}

  public async saveFacts(contractId: string, facts: StoredContractFact[]): Promise<void> {
    for (const fact of facts) {
      await this.pool.query(
        `INSERT INTO contract_facts (contract_id, key, value, status, evidence_clause_id, evidence_quote)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (contract_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           status = EXCLUDED.status,
           evidence_clause_id = EXCLUDED.evidence_clause_id,
           evidence_quote = EXCLUDED.evidence_quote,
           updated_at = NOW()`,
        [contractId, fact.key, fact.value, fact.status, fact.evidenceClauseId, fact.evidenceQuote],
      );
    }
  }

  public async getFacts(contractId: string): Promise<StoredContractFact[]> {
    const res = await this.pool.query(
      `SELECT key, value, status, evidence_clause_id, evidence_quote
       FROM contract_facts WHERE contract_id = $1 ORDER BY key ASC`,
      [contractId],
    );
    return res.rows.map(toStored);
  }

  public async updateFact(
    contractId: string,
    key: FactKey,
    value: string | null,
    status: 'confirmed' | 'corrected',
  ): Promise<StoredContractFact | null> {
    const res = await this.pool.query(
      `UPDATE contract_facts
       SET value = $3, status = $4, updated_at = NOW()
       WHERE contract_id = $1 AND key = $2
       RETURNING key, value, status, evidence_clause_id, evidence_quote`,
      [contractId, key, value, status],
    );
    if (res.rows.length === 0) return null;
    return toStored(res.rows[0]);
  }
}

export class InMemoryFactsRepository implements FactsRepository {
  private readonly facts = new Map<string, StoredContractFact[]>();

  public async saveFacts(contractId: string, facts: StoredContractFact[]): Promise<void> {
    this.facts.set(contractId, facts.map((fact) => ({ ...fact })));
  }

  public async getFacts(contractId: string): Promise<StoredContractFact[]> {
    return (this.facts.get(contractId) ?? []).map((fact) => ({ ...fact }));
  }

  public async updateFact(
    contractId: string,
    key: FactKey,
    value: string | null,
    status: 'confirmed' | 'corrected',
  ): Promise<StoredContractFact | null> {
    const facts = this.facts.get(contractId);
    if (!facts) return null;
    const index = facts.findIndex((fact) => fact.key === key);
    if (index < 0) return null;
    const updated = { ...facts[index], value, status };
    facts[index] = updated;
    return { ...updated };
  }
}
