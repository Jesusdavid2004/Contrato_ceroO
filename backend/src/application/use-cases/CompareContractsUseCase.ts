import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import {
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';
import { compareClauses } from '../../domain/services/ClauseDiff';

export interface ContractDiffSegment {
  type: 'same' | 'add' | 'del';
  text: string;
}

export interface ContractComparison {
  baseContractId: string;
  otherContractId: string;
  added: Array<{ id: string; orderIndex: number; text: string }>;
  removed: Array<{ id: string; orderIndex: number; text: string }>;
  modified: Array<{
    baseClauseId: string;
    otherClauseId: string;
    similarity: number;
    textDiff: ContractDiffSegment[];
  }>;
  unchanged: number;
  truncated: boolean;
  limitations: string[];
}

/**
 * Comparacion determinista entre dos contratos propios: alinea clausulas,
 * clasifica anadidos/eliminaciones/modificaciones y propaga limites de
 * lectura (revision pendiente). Sin equivalencia juridica ni mezcla de
 * usuarios.
 */
export class CompareContractsUseCase {
  constructor(private readonly contractRepository: ContractRepository) {}

  public async execute(input: {
    baseContractId: string;
    otherContractId: string;
    userId: string;
  }): Promise<ContractComparison> {
    const base = await this.contractRepository.findById(input.baseContractId);
    if (!base) throw new ContractNotFoundError(input.baseContractId);
    const other = await this.contractRepository.findById(input.otherContractId);
    if (!other) throw new ContractNotFoundError(input.otherContractId);
    if (base.ownerId !== input.userId) throw new ContractOwnershipError(input.baseContractId);
    if (other.ownerId !== input.userId) throw new ContractOwnershipError(input.otherContractId);
    if (base.status !== 'READY') throw new ContractNotReadyError(input.baseContractId);
    if (other.status !== 'READY') throw new ContractNotReadyError(input.otherContractId);

    const result = compareClauses(
      base.clauses.map((clause) => ({ id: clause.id, orderIndex: clause.orderIndex, text: clause.originalText })),
      other.clauses.map((clause) => ({ id: clause.id, orderIndex: clause.orderIndex, text: clause.originalText })),
    );

    const limitations: string[] = [];
    const baseReview = base.clauses.filter((clause) => clause.requiresReview).length;
    const otherReview = other.clauses.filter((clause) => clause.requiresReview).length;
    if (baseReview > 0) {
      limitations.push(`${baseReview} base clause(s) still require review; their matches may be unreliable.`);
    }
    if (otherReview > 0) {
      limitations.push(`${otherReview} compared clause(s) still require review; their matches may be unreliable.`);
    }
    if (result.truncated) {
      limitations.push('Some clause pairs exceeded the detail limit; their word diff was omitted.');
    }

    return {
      baseContractId: base.id,
      otherContractId: other.id,
      added: result.added.map((clause) => ({ id: clause.id, orderIndex: clause.orderIndex, text: clause.text })),
      removed: result.removed.map((clause) => ({ id: clause.id, orderIndex: clause.orderIndex, text: clause.text })),
      modified: result.modified.map((entry) => ({
        baseClauseId: entry.base.id,
        otherClauseId: entry.other.id,
        similarity: Math.round(entry.similarity * 1000) / 1000,
        textDiff: entry.textDiff,
      })),
      unchanged: result.unchanged,
      truncated: result.truncated,
      limitations,
    };
  }
}
