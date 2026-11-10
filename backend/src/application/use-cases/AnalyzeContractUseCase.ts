import { createHash, randomUUID } from 'node:crypto';
import { Clause, REQUIRES_REVIEW_CONFIDENCE, type LegalBasisReference } from '../../domain/entities/Clause';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { AIUsageRepository } from '../../domain/repositories/AIUsageRepository';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  DailyQuotaExceededError,
  OutOfCoverageError,
  StagingExpiredError,
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
import type {
  AnalysisEvent,
  AnalysisEventPublisher,
} from '../../domain/services/AnalysisEventPublisher';
import type { AnalysisStaging } from '../../domain/services/AnalysisStaging';
import { stagingUriFor } from '../../domain/services/AnalysisStaging';
import type { FactsRepository } from '../../domain/repositories/FactsRepository';
import { extractContractFacts } from '../../domain/services/ContractFacts';
import { Contract } from '../../domain/entities/Contract';
import { config } from '../../shared/config';
import { logger } from '../../shared/logger';

const MAX_CLAUSES_PER_BATCH = 8;
const SMART_RECHECK_CONFIDENCE = REQUIRES_REVIEW_CONFIDENCE;
const PROMPT_VERSION = 'clause-classification-v2';
export interface AnalyzeContractInput {
  contractId: string;
  userId: string;
  /** Bytes directos (pruebas y compatibilidad); preferir stagingKey en rutas. */
  fileBuffer?: Buffer;
  /** Llave de staging (`staging:<contractId>`); sobrevive reinicios con TTL. */
  stagingKey?: string;
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
    private readonly eventPublisher?: AnalysisEventPublisher,
    private readonly staging?: AnalysisStaging,
    private readonly factsRepository?: FactsRepository,
  ) {}

  public async execute(input: AnalyzeContractInput): Promise<void> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);

    const now = this.clock();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (contract.coverageStatus === 'unsupported') {
      // Sin conclusiones juridicas locales inventadas: se marca fallo
      // explicito sin consumir cuota ni clasificar.
      contract.markFailed('errors.out_of_coverage');
      await this.contractRepository.save(contract);
      await this.publishEvent({
        contractId: contract.id,
        userId: input.userId,
        jobId: contract.id,
        type: 'failed',
        payload: { status: 'FAILED', failureMessageKey: 'errors.out_of_coverage' },
      });
      await this.cleanupStaging(input.stagingKey);
      throw new OutOfCoverageError(contract.jurisdiction, contract.contractType);
    }
    try {
      const { fileBuffer, mimeType: stagedMimeType } = await this.resolveInputBytes(input);
      const reserved = await this.usageRepository.reserveDailyAnalysis(
        input.userId,
        config.DAILY_AI_QUOTA,
        dayStart,
        now,
      );
      if (!reserved) throw new DailyQuotaExceededError(config.DAILY_AI_QUOTA);
      contract.markAnalyzing();
      await this.contractRepository.save(contract);
      await this.publishEvent({
        contractId: contract.id,
        userId: input.userId,
        jobId: contract.id,
        type: 'stage',
        payload: { status: 'ANALYZING' },
      });

      const text = await this.textExtractor.extractText(fileBuffer, stagedMimeType);
      const segmented = await this.clauseSegmenter.segment(text);
      if (segmented.length === 0) {
        throw new TextExtractionFailedError('No contract clauses could be segmented.');
      }
      const clauses: Clause[] = [];

      for (let start = 0; start < segmented.length; start += MAX_CLAUSES_PER_BATCH) {
        const batch = segmented.slice(start, start + MAX_CLAUSES_PER_BATCH);
        const ids = batch.map(() => `clause-${randomUUID()}`);
        const clauseInputs = batch.map((clause, index) => ({ id: ids[index], text: clause.text }));
        // Sin cobertura el analisis ya fallo arriba: aqui siempre hay alcance.
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
            legalBasis: this.enrichLegalBasis(legalContext, ids[index], classification.legal_basis),
            suggestedChange: classification.suggested_change,
            pageNumber: batch[index].pageNumber ?? null,
            startOffset: batch[index].startOffset ?? null,
            endOffset: batch[index].endOffset ?? null,
          }));
        }
      }

      contract.setClauses(clauses);
      if (this.factsRepository) {
        const facts = extractContractFacts({
          fullText: text,
          clauses: clauses.map((clause) => ({
            id: clause.id,
            startOffset: clause.startOffset,
            endOffset: clause.endOffset,
          })),
        });
        await this.factsRepository.saveFacts(
          contract.id,
          facts.map((fact) => ({ ...fact })),
        );
      }
      contract.markReady();
      await this.contractRepository.save(contract);
      await this.publishEvent({
        contractId: contract.id,
        userId: input.userId,
        jobId: contract.id,
        type: 'completed',
        payload: { status: 'READY', globalRiskScore: contract.globalRiskScore },
      });
      await this.cleanupStaging(input.stagingKey);
    } catch (error) {
      contract.markFailed(error instanceof DomainError ? error.messageKey : 'errors.analysis_failed');
      await this.contractRepository.save(contract);
      await this.publishEvent({
        contractId: input.contractId,
        userId: input.userId,
        jobId: input.contractId,
        type: 'failed',
        payload: { status: 'FAILED', failureMessageKey: contract.failureReason },
      });
      await this.cleanupStaging(input.stagingKey);
      throw error;
    }
  }

  /** Resuelve los bytes: directos si vienen, o del staging con TTL. */
  private async resolveInputBytes(input: AnalyzeContractInput): Promise<{ fileBuffer: Buffer; mimeType: string }> {
    if (input.fileBuffer) {
      return { fileBuffer: input.fileBuffer, mimeType: input.mimeType };
    }
    if (input.stagingKey && this.staging) {
      const staged = await this.staging.fetch(stagingUriFor(input.stagingKey));
      if (staged) return { fileBuffer: staged.buffer, mimeType: staged.mimeType };
    }
    throw new StagingExpiredError();
  }

  /** Borra el staging al terminar; nunca rompe el resultado. */
  private async cleanupStaging(stagingKey?: string): Promise<void> {
    if (!stagingKey || !this.staging) return;
    try {
      await this.staging.remove(stagingUriFor(stagingKey));
    } catch (error) {
      logger.error('Staging cleanup failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  /**
   * Avisa el avance sin bloquear el analisis: si el bus falla se registra
   * y el trabajo continua; el estado definitivo ya quedo persistido.
   */
  private async publishEvent(event: Omit<AnalysisEvent, 'occurredAt'>): Promise<void> {    if (!this.eventPublisher) return;
    try {
      await this.eventPublisher.publish({ ...event, occurredAt: this.clock() });
    } catch (error) {
      logger.error('Analysis event publish failed', {
        contractId: event.contractId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  /**
   * Attaches canonical source URL and domain to each cited basis by joining
   * it back against the retrieved legal context (same clause + reference,
   * case-insensitive). Citations without a context match keep empty strings so
   * the frontend never renders an unverifiable link.
   */
  private enrichLegalBasis(
    legalContext: LegalContextProvision[] | undefined,
    clauseId: string,
    legalBasis: Array<{ reference: string; summary: string }>,
  ): LegalBasisReference[] {
    const normalize = (value: string) => value.trim().toLowerCase();
    return legalBasis.map((basis) => {
      const match = legalContext?.find(
        (provision) => provision.clauseId === clauseId
          && normalize(provision.reference) === normalize(basis.reference),
      );
      return {
        reference: basis.reference,
        summary: basis.summary,
        sourceUrl: match?.sourceUrl ?? '',
        tema: match?.tema ?? '',
        fuenteVerificadaEn: match?.fuenteVerificadaEn,
      };
    });
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
