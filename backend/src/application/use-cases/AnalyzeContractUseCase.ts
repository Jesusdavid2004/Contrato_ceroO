import { createHash, randomUUID } from 'node:crypto';
import { Clause } from '../../domain/entities/Clause';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { AIUsageRepository } from '../../domain/repositories/AIUsageRepository';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  DailyQuotaExceededError,
  TextExtractionFailedError,
} from '../../domain/exceptions/index';
import { DomainError } from '../../domain/exceptions/DomainError';
import type { AIProvider, ClassifiedClauseDTO } from '../../domain/services/AIProvider';
import type { LegalContextProvider, LegalContextProvision } from '../../domain/services/LegalContextProvider';
import type {
  AIClassificationCache,
  ClauseSegmenter,
  TextExtractor,
} from '../../domain/services/InfrastructureInterfaces';
import { Contract } from '../../domain/entities/Contract';
import { config } from '../../shared/config';
import { logger } from '../../shared/logger';

const MAX_CLAUSES_PER_BATCH = 8;
const SMART_RECHECK_CONFIDENCE = 0.6;
const PROMPT_VERSION = 'clause-classification-v2';
export interface AnalyzeContractInput {
  contractId: string;
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
}

export class AnalyzeContractUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly textExtractor: TextExtractor,
    private readonly clauseSegmenter: ClauseSegmenter,
    private readonly aiProvider: AIProvider,
    private readonly usageRepository: AIUsageRepository,
    private readonly cache: AIClassificationCache,
    private readonly clock: () => Date = () => new Date(),
    private readonly legalContextProvider?: LegalContextProvider,
  ) {}

  public async execute(input: AnalyzeContractInput): Promise<void> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);

    const now = this.clock();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    try {
      const reserved = await this.usageRepository.reserveDailyAnalysis(
        input.userId,
        config.DAILY_AI_QUOTA,
        dayStart,
        now,
      );
      if (!reserved) throw new DailyQuotaExceededError(config.DAILY_AI_QUOTA);
      contract.markAnalyzing();
      await this.contractRepository.save(contract);

      const text = await this.textExtractor.extractText(input.fileBuffer, input.mimeType);
      const segmented = await this.clauseSegmenter.segment(text);
      if (segmented.length === 0) {
        throw new TextExtractionFailedError('No contract clauses could be segmented.');
      }
      const clauses: Clause[] = [];

      for (let start = 0; start < segmented.length; start += MAX_CLAUSES_PER_BATCH) {
        const batch = segmented.slice(start, start + MAX_CLAUSES_PER_BATCH);
        const ids = batch.map(() => `clause-${randomUUID()}`);
        const clauseInputs = batch.map((clause, index) => ({ id: ids[index], text: clause.text }));
        const legalContext = this.legalContextProvider
          ? await this.legalContextProvider.retrieve(contract.jurisdiction, clauseInputs)
          : undefined;
        const cacheKey = this.createCacheKey(
          contract,
          batch.map((clause) => clause.text),
          ids,
          legalContext,
        );
        const cached = await this.cache.get(cacheKey);
        let classified: ClassifiedClauseDTO[];
        if (cached) {
          classified = cached.map((item, index) => ({ ...item, clause_id: ids[index] }));
        } else {
          const result = await this.classifyWithUsage(
            contract,
            clauseInputs,
            undefined,
            'classification',
            legalContext,
          );
          classified = result.clauses;

          const uncertain = classified.filter(
            (clause) => clause.confidence < SMART_RECHECK_CONFIDENCE,
          );
          if (uncertain.length > 0) {
            const recheck = await this.classifyWithUsage(
              contract,
              uncertain.map((clause) => ({
                id: clause.clause_id,
                text: batch[ids.indexOf(clause.clause_id)].text,
              })),
              'smart',
              'low-confidence-recheck',
              legalContext,
            );
            const recheckedById = new Map(recheck.clauses.map((clause) => [clause.clause_id, clause]));
            classified = classified.map((clause) => recheckedById.get(clause.clause_id) || clause);
          }

          await this.cache.set(cacheKey, classified.map((item, index) => ({
            ...item,
            clause_id: String(index),
          })));
        }

        for (let index = 0; index < batch.length; index += 1) {
          const classification = classified[index];
          clauses.push(new Clause({
            id: ids[index],
            contractId: contract.id,
            orderIndex: batch[index].orderIndex,
            originalText: batch[index].text,
            riskLevel: classification.risk_level,
            confidence: classification.confidence,
            plainExplanation: classification.plain_explanation,
            whyRisky: classification.why_risky,
            legalBasis: classification.legal_basis,
            suggestedChange: classification.suggested_change,
          }));
        }
      }

      contract.setClauses(clauses);
      contract.markReady();
      await this.contractRepository.save(contract);
    } catch (error) {
      contract.markFailed(error instanceof DomainError ? error.messageKey : 'errors.analysis_failed');
      await this.contractRepository.save(contract);
      throw error;
    }
  }

  private async classifyWithUsage(
    contract: Contract,
    clauses: Array<{ id: string; text: string }>,
    tier: 'fast' | 'smart' = 'fast',
    operation: string,
    legalContext?: LegalContextProvision[],
  ) {
    const startedAt = this.clock().getTime();
    const result = await this.aiProvider.classifyClauses({
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      locale: contract.locale,
      clauses,
      legalContext,
    }, tier);
    await this.usageRepository.recordUsage(
      contract.ownerId,
      result.usage.model,
      result.usage.inputTokens + result.usage.outputTokens,
      operation,
      Math.max(0, this.clock().getTime() - startedAt),
      this.clock(),
    );
    return result;
  }

  private createCacheKey(
    contract: Contract,
    clauseTexts: string[],
    clauseIds: string[],
    legalContext?: LegalContextProvision[],
  ): string {
    const clauseIndexes = new Map(clauseIds.map((id, index) => [id, index]));
    const content = JSON.stringify({
      promptVersion: PROMPT_VERSION,
      locale: contract.locale,
      jurisdiction: contract.jurisdiction,
      contractType: contract.contractType,
      clauseTexts,
      legalContext: legalContext?.map(({ clauseId, sourceName, sourceUrl, reference, text }) => ({
        clauseIndex: clauseIndexes.get(clauseId),
        sourceName,
        sourceUrl,
        reference,
        text,
      })),
    });
    return createHash('sha256').update(content).digest('hex');
  }
}
