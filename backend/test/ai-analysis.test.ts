import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { Contract } from '../src/domain/entities/Contract';
import type {
  AIModelTier,
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ObjectionLetterRequest,
} from '../src/domain/services/AIProvider';
import type { LegalContextProvider, LegalContextProvision } from '../src/domain/services/LegalContextProvider';
import type { AIUsageRepository } from '../src/domain/repositories/AIUsageRepository';
import { LegalProvision } from '../src/domain/entities/LegalProvision';
import { DailyQuotaExceededError } from '../src/domain/exceptions/index';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { AnthropicAIProvider } from '../src/infrastructure/ai/AnthropicAIProvider';
import { PostgresLegalContextProvider } from '../src/infrastructure/services/PostgresLegalContextProvider';

class RecordingAIProvider implements AIProvider {
  public readonly calls: Array<{
    tier: AIModelTier;
    clauseCount: number;
    legalContext?: LegalContextProvision[];
  }> = [];

  public async classifyClauses(
    request: ClassifyClausesRequest,
    tier: AIModelTier = 'fast',
  ): Promise<ClauseClassificationResult> {
    this.calls.push({
      tier,
      clauseCount: request.clauses.length,
      legalContext: request.legalContext,
    });
    return {
      clauses: request.clauses.map((clause) => ({
        clause_id: clause.id,
        risk_level: 'high',
        confidence: tier === 'fast' ? 0.4 : 0.9,
        plain_explanation: 'A one-sided change may disadvantage the signer.',
        why_risky: 'Only one party can change the term.',
        legal_basis: [],
        suggested_change: 'Require written agreement from both parties.',
      })),
      usage: { model: `test-${tier}`, inputTokens: 11, outputTokens: 7 },
    };
  }

  public async generateObjectionLetter(_request: ObjectionLetterRequest): Promise<string> {
    return 'Test letter';
  }
}

function createContract(id: string, ownerId = 'user-1'): Contract {
  return new Contract({
    id,
    ownerId,
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'en',
  });
}

describe('AnalyzeContractUseCase', () => {
  it('classifies twenty clauses in batches of eight and rechecks low confidence clauses', async () => {
    const repository = new InMemoryContractRepository();
    const contract = createContract('contract-1');
    await repository.save(contract);
    const provider = new RecordingAIProvider();
    const usageRepository = new InMemoryAIUsageRepository();
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => 'contract text' },
      {
        segment: async () => Array.from({ length: 20 }, (_, index) => ({
          orderIndex: index + 1,
          text: `Clause ${index + 1} grants one party a unilateral change right.`,
        })),
      },
      provider,
      usageRepository,
      new InMemoryAIClassificationCache(),
      () => new Date('2026-10-13T10:00:00.000Z'),
    );

    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });

    const result = await repository.findById(contract.id);
    expect(result?.status).toBe('READY');
    expect(result?.clauses).toHaveLength(20);
    expect(result?.clauses.every((clause) => clause.confidence === 0.9)).toBe(true);
    expect(provider.calls.filter((call) => call.tier === 'fast').map((call) => call.clauseCount))
      .toEqual([8, 8, 4]);
    expect(provider.calls.filter((call) => call.tier === 'smart').map((call) => call.clauseCount))
      .toEqual([8, 8, 4]);
  });

  it('does not call the provider or extract text when the daily quota is exhausted', async () => {
    const repository = new InMemoryContractRepository();
    const contract = createContract('contract-quota');
    await repository.save(contract);
    let providerCalls = 0;
    const provider: AIProvider = {
      classifyClauses: async () => {
        providerCalls += 1;
        throw new Error('Provider must not be called');
      },
      generateObjectionLetter: async () => '',
    };
    const usageRepository: AIUsageRepository = {
      reserveDailyAnalysis: async () => false,
      recordUsage: async () => undefined,
    };
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => { throw new Error('Extraction must not run'); } },
      { segment: async () => [] },
      provider,
      usageRepository,
      new InMemoryAIClassificationCache(),
    );

    await expect(useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    })).rejects.toBeInstanceOf(DailyQuotaExceededError);
    expect(providerCalls).toBe(0);
    expect((await repository.findById(contract.id))?.status).toBe('FAILED');
  });

  it('reuses cached classifications for identical clauses without reusing contract clause ids', async () => {
    const cache = new InMemoryAIClassificationCache();
    const provider = new RecordingAIProvider();
    const analyze = async (contractId: string) => {
      const repository = new InMemoryContractRepository();
      const contract = createContract(contractId);
      await repository.save(contract);
      const useCase = new AnalyzeContractUseCase(
        repository,
        { extractText: async () => 'contract text' },
        { segment: async () => [{ orderIndex: 1, text: 'Identical clause text with sufficient length.' }] },
        provider,
        new InMemoryAIUsageRepository(),
        cache,
      );
      await useCase.execute({
        contractId,
        userId: contract.ownerId,
        fileBuffer: Buffer.from('test'),
        mimeType: 'application/pdf',
      });
      return repository.findById(contractId);
    };

    const first = await analyze('contract-cache-a');
    const callsAfterFirstAnalysis = provider.calls.length;
    const second = await analyze('contract-cache-b');
    expect(callsAfterFirstAnalysis).toBe(2);
    expect(provider.calls).toHaveLength(callsAfterFirstAnalysis);
    expect(first?.clauses[0].id).not.toBe(second?.clauses[0].id);
  });

  it('passes retrieved legal context to the initial classification and confidence re-check', async () => {
    const repository = new InMemoryContractRepository();
    const contract = createContract('contract-rag');
    await repository.save(contract);
    const provider = new RecordingAIProvider();
    const legalContextProvider: LegalContextProvider = {
      retrieve: async (_jurisdiction, clauses) => clauses.map((clause) => ({
        clauseId: clause.id,
        sourceName: 'Official legal source',
        sourceUrl: 'https://example.gov.co/law',
        reference: 'Law 1, article 2',
        text: 'A consumer clause must be clear.',
      })),
    };
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => 'contract text' },
      { segment: async () => [{ orderIndex: 1, text: 'The provider may change any term.' }] },
      provider,
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
      undefined,
      legalContextProvider,
    );

    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });

    expect(provider.calls.map((call) => call.tier)).toEqual(['fast', 'smart']);
    expect(provider.calls[0].legalContext).toEqual(provider.calls[1].legalContext);
    expect(provider.calls[0].legalContext?.[0].reference).toBe('Law 1, article 2');
  });
});

describe('PostgresLegalContextProvider', () => {
  it('retrieves up to three provisions per clause using query embeddings', async () => {
    const embeddingCalls: Array<{ text: string; purpose: string }> = [];
    const repositoryCalls: Array<{ jurisdiction: string; embedding: number[]; limit?: number }> = [];
    const provider = new PostgresLegalContextProvider(
      {
        findTopRelevant: async (jurisdiction, embedding, limit) => {
          repositoryCalls.push({ jurisdiction, embedding, limit });
          return [new LegalProvision({
            id: 'co-law',
            jurisdiction,
            sourceName: 'Official source',
            sourceUrl: 'https://example.gov.co/law',
            reference: 'Law, article 1',
            text: 'Verified provision summary.',
          })];
        },
        saveMany: async () => undefined,
        countByJurisdiction: async () => 1,
      },
      {
        embed: async (text, purpose) => {
          embeddingCalls.push({ text, purpose });
          return [0.1, 0.2];
        },
      },
    );

    const result = await provider.retrieve('CO', [
      { id: 'clause-1', text: 'Term one' },
      { id: 'clause-2', text: 'Term two' },
    ]);

    expect(embeddingCalls).toEqual([
      { text: 'Term one', purpose: 'query' },
      { text: 'Term two', purpose: 'query' },
    ]);
    expect(repositoryCalls).toHaveLength(2);
    expect(repositoryCalls.every((call) => call.jurisdiction === 'CO' && call.limit === 3)).toBe(true);
    expect(result.map((provision) => provision.clauseId)).toEqual(['clause-1', 'clause-2']);
  });
});

describe('FakeAIProvider', () => {
  it('provides deterministic risk classifications and refuses an empty objection letter', async () => {
    const provider = new FakeAIProvider();
    const result = await provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [
        { id: '1', text: 'El contrato contiene renovación automática anual.' },
        { id: '2', text: 'Las partes acuerdan el domicilio para notificaciones.' },
      ],
    });
    expect(result.clauses.map((clause) => clause.risk_level)).toEqual(['high', 'low']);
    await expect(provider.generateObjectionLetter({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      flaggedClauses: [],
    })).rejects.toThrow();
  });
});

describe('AnthropicAIProvider', () => {
  it('retries one invalid structured response and filters citations absent from context', async () => {
    const client = new Anthropic({ apiKey: 'test-key' });
    let requestCount = 0;
    const response = (
      riskLevel: string,
    ): Anthropic.Messages.Message => ({
      id: `message-${requestCount}`,
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      stop_reason: 'tool_use',
      stop_sequence: null,
      content: [{
        type: 'tool_use',
        id: `tool-${requestCount}`,
        name: 'classify_contract_clauses',
        input: {
          clauses: [{
            clause_id: 'clause-1',
            risk_level: riskLevel,
            confidence: 0.9,
            plain_explanation: 'The term allows a unilateral change.',
            why_risky: 'Only one party controls changes.',
            legal_basis: [
              { reference: 'Article 15', summary: 'Supported provision.' },
              { reference: 'Article 99', summary: 'Unsupported provision.' },
            ],
            suggested_change: 'Require mutual written agreement.',
          }],
        },
      }],
      usage: {
        input_tokens: 5,
        output_tokens: 7,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    });
    const createMessage = vi.spyOn(client.messages, 'create').mockImplementation(async () => {
      requestCount += 1;
      return response(requestCount === 1 ? 'urgent' : 'high');
    });
    const provider = new AnthropicAIProvider(client, {
      fastModel: 'fast-test',
      smartModel: 'smart-test',
      maxTokens: 1024,
      timeoutMs: 1000,
    });

    const result = await provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'en',
      clauses: [{ id: 'clause-1', text: 'One party may change any term.' }],
      legalContext: [
        {
          clauseId: 'clause-1',
          sourceName: 'Source',
          sourceUrl: 'https://example.gov.co/law',
          reference: 'Article 15',
          text: 'Context for clause one.',
        },
        {
          clauseId: 'clause-2',
          sourceName: 'Source',
          sourceUrl: 'https://example.gov.co/law',
          reference: 'Article 99',
          text: 'Context for clause two.',
        },
      ],
    });

    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(result.clauses[0].risk_level).toBe('high');
    expect(result.clauses[0].legal_basis).toEqual([
      { reference: 'Article 15', summary: 'Supported provision.' },
    ]);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(14);
  });
});
