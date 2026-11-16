import { describe, it, expect, vi } from 'vitest';
import { AskAssistantUseCase } from '../src/application/use-cases/AskAssistantUseCase';
import { Clause } from '../src/domain/entities/Clause';
import { Contract } from '../src/domain/entities/Contract';
import { LegalUpdate } from '../src/domain/entities/LegalUpdate';
import {
  AssistantQuotaExceededError,
  ClauseNotFoundError,
  ContractNotFoundError,
  ContractNotReadyError,
  ContractOwnershipError,
} from '../src/domain/exceptions/index';
import type { AssistantProvider, AssistantRequest } from '../src/domain/services/AssistantProvider';
import type { LegalUpdatesRepository } from '../src/domain/repositories/LegalUpdatesRepository';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { InMemoryAssistantConversationRepository } from '../src/infrastructure/repositories/AssistantConversationRepositoryImpl';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function readyContract(ownerId = 'owner-1', status: 'READY' | 'ANALYZING' = 'READY'): Contract {
  return new Contract({
    id: 'contract-1',
    ownerId,
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    status,
    clauses: [new Clause({
      id: 'c1', orderIndex: 1, originalText: 'El canon sube cada mes sin limite.',
      riskLevel: 'high', confidence: 0.9, plainExplanation: 'Aumento ilimitado del canon.',
    })],
  });
}

async function setup(options: { reply?: string; limit?: number; contract?: Contract; updates?: LegalUpdate[] } = {}) {
  const contracts = new InMemoryContractRepository();
  await contracts.save(options.contract ?? readyContract());
  const conversations = new InMemoryAssistantConversationRepository();
  const requests: AssistantRequest[] = [];
  const assistant: AssistantProvider = {
    reply: vi.fn(async (request, onToken) => {
      requests.push(request);
      const text = options.reply ?? 'El canon no puede subir sin limite [S1] ni segun [S99].';
      onToken?.(text);
      return { text, usage: { model: 'fake', inputTokens: 1, outputTokens: 1 } };
    }),
  };
  const updatesRepo: LegalUpdatesRepository = {
    saveIfNew: async () => true,
    listRecent: async () => options.updates ?? [],
    getSourceState: async () => null,
    listSourceStates: async () => [],
    saveSourceState: async () => undefined,
  };
  const useCase = new AskAssistantUseCase(
    contracts, new InMemoryFactsRepository(), conversations, assistant,
    options.limit ?? 5, undefined, updatesRepo, () => NOW,
  );
  return { useCase, conversations, assistant, requests };
}

const ask = (question = 'El canon puede subir cada mes?', userId = 'owner-1') => ({
  contractId: 'contract-1', userId, question,
});

describe('AskAssistantUseCase', () => {
  it('answers with citations that exist in the context pack and drops invented ones', async () => {
    const { useCase } = await setup();
    const { assistantMessage } = await useCase.execute(ask());
    expect(assistantMessage.citations.map((citation) => citation.sourceId)).toEqual(['S1']);
    expect(assistantMessage.content).not.toContain('[S99]');
    expect(assistantMessage.grounded).toBe(true);
  });

  it('accepts grouped citation markers from the model', async () => {
    const { useCase } = await setup({ reply: 'El canon sube sin limite [S1, S99].' });
    const { assistantMessage } = await useCase.execute(ask());
    expect(assistantMessage.citations.map((citation) => citation.sourceId)).toEqual(['S1']);
    expect(assistantMessage.content).toBe('El canon sube sin limite [S1].');
  });

  it('marks an answer without valid citations as ungrounded', async () => {
    const { useCase } = await setup({ reply: 'No tengo informacion.' });
    const { assistantMessage } = await useCase.execute(ask());
    expect(assistantMessage.grounded).toBe(false);
    expect(assistantMessage.citations).toEqual([]);
  });

  it('forwards streamed tokens to the listener', async () => {
    const { useCase } = await setup();
    const tokens: string[] = [];
    await useCase.execute({ ...ask(), onToken: (piece) => tokens.push(piece) });
    expect(tokens.join('')).toContain('[S1]');
  });

  it('persists the exchange and feeds it back as history on the next question', async () => {
    const { useCase, requests, conversations } = await setup();
    await useCase.execute(ask('Primera pregunta'));
    await useCase.execute(ask('Segunda pregunta'));
    expect(requests[1].history.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(await conversations.listByContract('contract-1', 10)).toHaveLength(4);
  });

  it('rejects a user who does not own the contract before calling the model', async () => {
    const { useCase, assistant } = await setup();
    await expect(useCase.execute(ask('Hola?', 'intruder'))).rejects.toBeInstanceOf(ContractOwnershipError);
    expect(assistant.reply).not.toHaveBeenCalled();
  });

  it('puts the focus clause in the context and rejects a clause of another contract', async () => {
    const { useCase, requests } = await setup();
    await useCase.execute({ ...ask('Explica esta clausula'), clauseId: 'c1' });
    expect(requests[0].sources[0].label).toBe('clause:c1');
    await expect(useCase.execute({ ...ask(), clauseId: 'not-in-contract' })).rejects.toBeInstanceOf(ClauseNotFoundError);
  });

  it('rejects unknown and not-ready contracts', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute({ ...ask(), contractId: 'missing' })).rejects.toBeInstanceOf(ContractNotFoundError);
    const pending = await setup({ contract: readyContract('owner-1', 'ANALYZING') });
    await expect(pending.useCase.execute(ask())).rejects.toBeInstanceOf(ContractNotReadyError);
  });

  it('enforces the daily message quota', async () => {
    const { useCase } = await setup({ limit: 1 });
    await useCase.execute(ask());
    await expect(useCase.execute(ask())).rejects.toBeInstanceOf(AssistantQuotaExceededError);
  });

  it('includes recent legal updates for the contract topic in the sources', async () => {
    const update = new LegalUpdate({
      id: 'u1', sourceId: 's1', tema: 'arriendo', title: 'Nuevo decreto de arriendo',
      sourceUrl: 'https://example.test/u1', contentHash: 'h', detectedAt: new Date('2026-11-10T00:00:00.000Z'),
    });
    const { useCase, requests } = await setup({ updates: [update] });
    await useCase.execute(ask());
    expect(requests[0].sources.some((source) => source.kind === 'update')).toBe(true);
  });
});
