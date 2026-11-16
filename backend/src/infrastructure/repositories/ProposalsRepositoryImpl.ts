import type { Pool } from 'pg';
import { ClauseProposal } from '../../domain/entities/ClauseProposal';
import type {
  CreateProposalInput,
  ProposalsRepository,
} from '../../domain/repositories/ProposalsRepository';

interface ProposalRow {
  id: string;
  contract_id: string;
  clause_id: string;
  original_text: string;
  proposed_text: string;
  reason: string;
  status: string;
  version: number;
  created_at: Date | string;
}

function toProposal(row: ProposalRow): ClauseProposal {
  return new ClauseProposal({
    id: row.id,
    contractId: row.contract_id,
    clauseId: row.clause_id,
    originalText: row.original_text,
    proposedText: row.proposed_text,
    reason: row.reason,
    status: row.status as ClauseProposal['status'],
    version: Number(row.version),
    createdAt: new Date(row.created_at),
  });
}

const SELECT_COLUMNS = `id, contract_id, clause_id, original_text, proposed_text,
  reason, status, version, created_at`;

export class PostgresProposalsRepository implements ProposalsRepository {
  constructor(private readonly pool: Pool) {}

  public async create(input: CreateProposalInput & { id: string }): Promise<ClauseProposal> {
    const res = await this.pool.query(
      `INSERT INTO clause_proposals
        (id, contract_id, clause_id, original_text, proposed_text, reason, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.id,
        input.contractId,
        input.clauseId,
        input.originalText,
        input.proposedText,
        input.reason,
        input.version,
      ],
    );
    return toProposal(res.rows[0] as ProposalRow);
  }

  public async listByContract(contractId: string): Promise<ClauseProposal[]> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM clause_proposals
       WHERE contract_id = $1 ORDER BY created_at ASC, id ASC`,
      [contractId],
    );
    return (res.rows as ProposalRow[]).map(toProposal);
  }

  public async findById(id: string): Promise<ClauseProposal | null> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM clause_proposals WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return toProposal(res.rows[0] as ProposalRow);
  }

  public async maxVersionForClause(clauseId: string): Promise<number> {
    const res = await this.pool.query(
      'SELECT COALESCE(MAX(version), 0) AS max_version FROM clause_proposals WHERE clause_id = $1',
      [clauseId],
    );
    return Number((res.rows[0] as { max_version: number | string }).max_version);
  }

  public async update(
    id: string,
    patch: { proposedText?: string; reason?: string; status?: ClauseProposal['status'] },
  ): Promise<ClauseProposal | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const res = await this.pool.query(
      `UPDATE clause_proposals
       SET proposed_text = $2, reason = $3, status = $4
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        id,
        patch.proposedText ?? current.proposedText,
        patch.reason ?? current.reason,
        patch.status ?? current.status,
      ],
    );
    if (res.rows.length === 0) return null;
    return toProposal(res.rows[0] as ProposalRow);
  }
}

export class InMemoryProposalsRepository implements ProposalsRepository {
  private readonly proposals = new Map<string, ClauseProposal>();

  public async create(input: CreateProposalInput & { id: string }): Promise<ClauseProposal> {
    const proposal = new ClauseProposal({
      id: input.id,
      contractId: input.contractId,
      clauseId: input.clauseId,
      originalText: input.originalText,
      proposedText: input.proposedText,
      reason: input.reason,
      status: 'draft',
      version: input.version,
    });
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  public async listByContract(contractId: string): Promise<ClauseProposal[]> {
    return [...this.proposals.values()]
      .filter((proposal) => proposal.contractId === contractId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async findById(id: string): Promise<ClauseProposal | null> {
    return this.proposals.get(id) ?? null;
  }

  public async maxVersionForClause(clauseId: string): Promise<number> {
    let max = 0;
    for (const proposal of this.proposals.values()) {
      if (proposal.clauseId === clauseId && proposal.version > max) max = proposal.version;
    }
    return max;
  }

  public async update(
    id: string,
    patch: { proposedText?: string; reason?: string; status?: ClauseProposal['status'] },
  ): Promise<ClauseProposal | null> {
    const current = this.proposals.get(id);
    if (!current) return null;
    const updated = new ClauseProposal({
      id: current.id,
      contractId: current.contractId,
      clauseId: current.clauseId,
      originalText: current.originalText,
      proposedText: patch.proposedText ?? current.proposedText,
      reason: patch.reason ?? current.reason,
      status: patch.status ?? current.status,
      version: current.version,
      createdAt: current.createdAt,
    });
    this.proposals.set(id, updated);
    return updated;
  }
}
