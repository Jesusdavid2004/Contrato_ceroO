import type { ClauseProposal } from '../entities/ClauseProposal';

export interface CreateProposalInput {
  contractId: string;
  clauseId: string;
  originalText: string;
  proposedText: string;
  reason: string;
  version: number;
}

export interface ProposalsRepository {
  create(input: CreateProposalInput & { id: string }): Promise<ClauseProposal>;
  listByContract(contractId: string): Promise<ClauseProposal[]>;
  findById(id: string): Promise<ClauseProposal | null>;
  maxVersionForClause(clauseId: string): Promise<number>;
  update(
    id: string,
    patch: { proposedText?: string; reason?: string; status?: ClauseProposal['status'] },
  ): Promise<ClauseProposal | null>;
}
