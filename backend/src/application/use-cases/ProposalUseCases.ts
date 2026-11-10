import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ClauseProposal } from '../../domain/entities/ClauseProposal';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { ProposalsRepository } from '../../domain/repositories/ProposalsRepository';
import {
  ClauseNotFoundError,
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
  ProposalStateError,
} from '../../domain/exceptions/index';

export class CreateClauseProposalUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly proposalsRepository: ProposalsRepository,
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
    clauseId: string;
    proposedText?: string;
    reason: string;
  }): Promise<ClauseProposal> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (contract.status !== 'READY') throw new ContractNotReadyError(input.contractId);

    const clause = contract.clauses.find((item) => item.id === input.clauseId);
    if (!clause) throw new ClauseNotFoundError(input.clauseId);

    const proposedText = (input.proposedText ?? clause.suggestedChange ?? clause.originalText).trim();
    if (!proposedText || proposedText === clause.originalText.trim()) {
      throw new ZodError([{
        code: 'custom',
        path: ['proposed_text'],
        message: 'Proposal must change the original clause text.',
      }]);
    }

    const version = (await this.proposalsRepository.maxVersionForClause(input.clauseId)) + 1;
    try {
      return await this.proposalsRepository.create({
        id: `proposal-${randomUUID()}`,
        contractId: contract.id,
        clauseId: clause.id,
        originalText: clause.originalText,
        proposedText,
        reason: input.reason.trim(),
        version,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        const retryVersion = (await this.proposalsRepository.maxVersionForClause(input.clauseId)) + 1;
        return await this.proposalsRepository.create({
          id: `proposal-${randomUUID()}`,
          contractId: contract.id,
          clauseId: clause.id,
          originalText: clause.originalText,
          proposedText,
          reason: input.reason.trim(),
          version: retryVersion,
        });
      }
      throw error;
    }
  }
}

export class UpdateClauseProposalUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly proposalsRepository: ProposalsRepository,
  ) {}

  public async execute(input: {
    proposalId: string;
    userId: string;
    action?: 'accept' | 'discard';
    proposedText?: string;
    reason?: string;
  }): Promise<ClauseProposal> {
    const proposal = await this.proposalsRepository.findById(input.proposalId);
    if (!proposal) throw new ClauseNotFoundError(input.proposalId);
    const contract = await this.contractRepository.findById(proposal.contractId);
    if (!contract) throw new ContractNotFoundError(proposal.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(proposal.contractId);
    if (!proposal.isEditable()) {
      throw new ProposalStateError(`Proposal ${proposal.id} is already ${proposal.status}.`);
    }

    if (input.action === 'accept' || input.action === 'discard') {
      const updated = await this.proposalsRepository.update(proposal.id, {
        status: input.action === 'accept' ? 'accepted' : 'discarded',
      });
      if (!updated) throw new ClauseNotFoundError(proposal.id);
      return updated;
    }

    const proposedText = input.proposedText?.trim() || proposal.proposedText;
    const reason = input.reason?.trim() || proposal.reason;
    if (!reason) {
      throw new ZodError([{
        code: 'custom',
        path: ['reason'],
        message: 'Proposal reason is required.',
      }]);
    }
    if (proposedText === proposal.originalText.trim()) {
      throw new ZodError([{
        code: 'custom',
        path: ['proposed_text'],
        message: 'Proposal must change the original clause text.',
      }]);
    }
    const updated = await this.proposalsRepository.update(proposal.id, { proposedText, reason });
    if (!updated) throw new ClauseNotFoundError(proposal.id);
    return updated;
  }
}
