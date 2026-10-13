import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import { Contract } from '../../domain/entities/Contract';
import { Clause } from '../../domain/entities/Clause';
import { ObjectionLetter } from '../../domain/entities/ObjectionLetter';
import type { Pool } from 'pg';

export class PostgresContractRepository implements ContractRepository {
  constructor(private readonly pool: Pool) {}

  public async findById(id: string): Promise<Contract | null> {
    const contractRes = await this.pool.query(
      `SELECT id, user_id, title, file_name, contract_type, jurisdiction, locale,
              status, global_risk_score, uploaded_at, failure_reason
       FROM contracts WHERE id = $1`,
      [id],
    );
    if (contractRes.rows.length === 0) return null;
    const row = contractRes.rows[0];

    const clausesRes = await this.pool.query(
      `SELECT id, contract_id, order_index, original_text, risk_level, confidence,
              plain_explanation, why_risky, legal_basis, suggested_change
       FROM clauses WHERE contract_id = $1 ORDER BY order_index ASC`,
      [id],
    );

    const clauses = clausesRes.rows.map(
      (c) =>
        new Clause({
          id: c.id,
          contractId: c.contract_id,
          orderIndex: c.order_index,
          originalText: c.original_text,
          riskLevel: c.risk_level,
          confidence: Number(c.confidence),
          plainExplanation: c.plain_explanation,
          whyRisky: c.why_risky,
          legalBasis: c.legal_basis || [],
          suggestedChange: c.suggested_change,
        }),
    );

    return new Contract({
      id: row.id,
      ownerId: row.user_id,
      title: row.title,
      fileName: row.file_name,
      contractType: row.contract_type,
      jurisdiction: row.jurisdiction,
      locale: row.locale,
      status: row.status,
      globalRiskScore: row.global_risk_score,
      uploadedAt: new Date(row.uploaded_at),
      failureReason: row.failure_reason,
      clauses,
    });
  }

  public async findByOwnerId(ownerId: string): Promise<Contract[]> {
    const res = await this.pool.query(
      `SELECT id, user_id, title, file_name, contract_type, jurisdiction, locale,
              status, global_risk_score, uploaded_at, failure_reason
       FROM contracts WHERE user_id = $1 ORDER BY uploaded_at DESC`,
      [ownerId],
    );

    return res.rows.map(
      (row) =>
        new Contract({
          id: row.id,
          ownerId: row.user_id,
          title: row.title,
          fileName: row.file_name,
          contractType: row.contract_type,
          jurisdiction: row.jurisdiction,
          locale: row.locale,
          status: row.status,
          globalRiskScore: row.global_risk_score,
          uploadedAt: new Date(row.uploaded_at),
          failureReason: row.failure_reason,
          clauses: [],
        }),
    );
  }

  public async save(contract: Contract): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO contracts (id, user_id, title, file_name, contract_type, jurisdiction,
                               locale, status, global_risk_score, uploaded_at, failure_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           global_risk_score = EXCLUDED.global_risk_score,
           failure_reason = EXCLUDED.failure_reason`,
        [
          contract.id,
          contract.ownerId,
          contract.title,
          contract.fileName,
          contract.contractType,
          contract.jurisdiction,
          contract.locale,
          contract.status,
          contract.globalRiskScore,
          contract.uploadedAt,
          contract.failureReason,
        ],
      );

      // Insert or replace clauses
      if (contract.clauses.length > 0) {
        await client.query('DELETE FROM clauses WHERE contract_id = $1', [contract.id]);
        for (const c of contract.clauses) {
          await client.query(
            `INSERT INTO clauses (id, contract_id, order_index, original_text, risk_level,
                                 confidence, plain_explanation, why_risky, legal_basis, suggested_change)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              c.id,
              contract.id,
              c.orderIndex,
              c.originalText,
              c.riskLevel,
              c.confidence,
              c.plainExplanation,
              c.whyRisky,
              JSON.stringify(c.legalBasis),
              c.suggestedChange,
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async updateStatus(id: string, status: string, failureReason?: string | null): Promise<void> {
    await this.pool.query(
      'UPDATE contracts SET status = $1, failure_reason = $2 WHERE id = $3',
      [status, failureReason ?? null, id],
    );
  }

  public async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM contracts WHERE id = $1', [id]);
  }

  public async saveObjectionLetter(letter: ObjectionLetter): Promise<void> {
    await this.pool.query(
      `INSERT INTO objection_letters (contract_id, locale, content, created_at)
       VALUES ($1, $2, $3, $4)`,
      [letter.contractId, letter.locale, letter.content, letter.createdAt],
    );
  }

  public async getObjectionLetter(contractId: string): Promise<ObjectionLetter | null> {
    const res = await this.pool.query(
      `SELECT id, contract_id, locale, content, created_at
       FROM objection_letters WHERE contract_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [contractId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return new ObjectionLetter({
      id: String(row.id),
      contractId: row.contract_id,
      locale: row.locale,
      content: row.content,
      createdAt: new Date(row.created_at),
    });
  }
}

export class InMemoryContractRepository implements ContractRepository {
  private contracts = new Map<string, Contract>();
  private letters = new Map<string, ObjectionLetter>();

  public async findById(id: string): Promise<Contract | null> {
    return this.contracts.get(id) || null;
  }

  public async findByOwnerId(ownerId: string): Promise<Contract[]> {
    return [...this.contracts.values()].filter((c) => c.ownerId === ownerId);
  }

  public async save(contract: Contract): Promise<void> {
    this.contracts.set(contract.id, contract);
  }

  public async updateStatus(id: string, status: string, failureReason?: string | null): Promise<void> {
    const contract = this.contracts.get(id);
    if (contract) {
      if (status === 'READY') contract.markReady();
      else if (status === 'FAILED') contract.markFailed(failureReason ?? undefined);
    }
  }

  public async delete(id: string): Promise<void> {
    this.contracts.delete(id);
    this.letters.delete(id);
  }

  public async saveObjectionLetter(letter: ObjectionLetter): Promise<void> {
    this.letters.set(letter.contractId, letter);
  }

  public async getObjectionLetter(contractId: string): Promise<ObjectionLetter | null> {
    return this.letters.get(contractId) || null;
  }
}
