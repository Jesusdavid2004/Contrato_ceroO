import { randomUUID } from 'node:crypto';
import {
  AssistantMessage,
  type AssistantCitation,
} from '../../domain/entities/AssistantMessage';
import {
  AssistantQuotaExceededError,
  ClauseNotFoundError,
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';
import type { AssistantConversationRepository } from '../../domain/repositories/AssistantConversationRepository';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { FactsRepository } from '../../domain/repositories/FactsRepository';
import type { LegalUpdatesRepository } from '../../domain/repositories/LegalUpdatesRepository';
import {
  buildAssistantContext,
  extractValidCitations,
  normalizeCitationMarkers,
  stripUnknownCitations,
  type AssistantSource,
  type LegalUpdateSummary,
} from '../../domain/services/AssistantContext';
import type { AssistantProvider, AssistantTokenListener } from '../../domain/services/AssistantProvider';
import type { LegalContextProvider, LegalContextProvision } from '../../domain/services/LegalContextProvider';
import { temasForContractType } from '../../domain/services/LegalTopics';
import { logger } from '../../shared/logger';

export const ASSISTANT_HISTORY_LIMIT = 8;
export const LEGAL_UPDATE_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_CONTEXT_UPDATES = 3;

export interface AskAssistantInput {
  contractId: string;
  userId: string;
  question: string;
  /** Optional clause the question is about; must belong to the contract. */
  clauseId?: string;
  onToken?: AssistantTokenListener;
}

export interface AskAssistantOutput {
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toCitation(source: AssistantSource): AssistantCitation {
  return {
    sourceId: source.id,
    kind: source.kind,
    label: source.label,
    quote: source.quote,
    sourceUrl: source.sourceUrl,
    verifiedAt: source.verifiedAt,
  };
}

export class AskAssistantUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly factsRepository: FactsRepository,
    private readonly conversations: AssistantConversationRepository,
    private readonly assistant: AssistantProvider,
    private readonly dailyMessageLimit: number,
    private readonly legalContext?: LegalContextProvider,
    private readonly legalUpdates?: LegalUpdatesRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: AskAssistantInput): Promise<AskAssistantOutput> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (contract.status !== 'READY') throw new ContractNotReadyError(input.contractId);

    if (input.clauseId && !contract.clauses.some((clause) => clause.id === input.clauseId)) {
      throw new ClauseNotFoundError(input.clauseId);
    }

    const now = this.clock();
    const used = await this.conversations.countUserMessagesSince(input.userId, startOfUtcDay(now));
    if (used >= this.dailyMessageLimit) throw new AssistantQuotaExceededError(this.dailyMessageLimit);

    const [facts, history, provisions, updates] = await Promise.all([
      this.factsRepository.getFacts(contract.id),
      this.conversations.listByContract(contract.id, ASSISTANT_HISTORY_LIMIT),
      this.retrieveProvisions(contract.jurisdiction, contract.contractType, input.question),
      this.recentUpdates(contract.contractType, now),
    ]);

    const sources = buildAssistantContext({
      question: input.question,
      focusClauseId: input.clauseId,
      clauses: contract.clauses,
      facts,
      provisions,
      updates,
    });
    const reply = await this.assistant.reply({
      locale: contract.locale,
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      question: input.question,
      history: history.map((message) => ({ role: message.role, content: message.content })),
      sources,
    }, input.onToken);

    const replyText = normalizeCitationMarkers(reply.text);
    const citedIds = extractValidCitations(replyText, sources);
    const citations = sources.filter((source) => citedIds.includes(source.id)).map(toCitation);
    const userMessage = new AssistantMessage({
      id: `msg-${randomUUID()}`,
      contractId: contract.id,
      userId: input.userId,
      role: 'user',
      content: input.question,
      createdAt: now,
    });
    const assistantMessage = new AssistantMessage({
      id: `msg-${randomUUID()}`,
      contractId: contract.id,
      userId: input.userId,
      role: 'assistant',
      content: stripUnknownCitations(replyText, sources),
      citations,
      grounded: citations.length > 0,
      createdAt: new Date(now.getTime() + 1),
    });
    await this.conversations.append(userMessage);
    await this.conversations.append(assistantMessage);

    logger.info('Assistant question answered', {
      model: reply.usage.model,
      sourceCount: sources.length,
      citationCount: citations.length,
    });
    return { userMessage, assistantMessage };
  }

  private async retrieveProvisions(
    jurisdiction: string,
    contractType: string,
    question: string,
  ): Promise<LegalContextProvision[]> {
    if (!this.legalContext) return [];
    try {
      return await this.legalContext.retrieve(
        jurisdiction,
        [{ id: 'question', text: question }],
        { contractType },
      );
    } catch (error) {
      logger.warn('Assistant legal retrieval failed; continuing without legal context', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return [];
    }
  }

  private async recentUpdates(contractType: string, now: Date): Promise<LegalUpdateSummary[]> {
    const temas = temasForContractType(contractType);
    if (!this.legalUpdates || temas.length === 0) return [];
    const updates = await this.legalUpdates.listRecent({
      temas,
      since: new Date(now.getTime() - LEGAL_UPDATE_LOOKBACK_DAYS * MS_PER_DAY),
      limit: MAX_CONTEXT_UPDATES,
    });
    return updates.map((update) => ({
      id: update.id,
      kind: update.kind,
      title: update.title,
      tema: update.tema,
      sourceUrl: update.sourceUrl,
      detectedAt: update.detectedAt.toISOString(),
    }));
  }
}
