import { describe, it, expect } from 'vitest';
import { GetContractGuidanceUseCase } from '../src/application/use-cases/GetContractGuidanceUseCase';
import {
  ClearAssistantConversationUseCase,
  ListAssistantMessagesUseCase,
} from '../src/application/use-cases/AssistantHistoryUseCases';
import { AssistantMessage } from '../src/domain/entities/AssistantMessage';
import { Clause } from '../src/domain/entities/Clause';
import { Contract } from '../src/domain/entities/Contract';
import { LegalUpdate } from '../src/domain/entities/LegalUpdate';
import { ContractNotFoundError, ContractNotReadyError, ContractOwnershipError } from '../src/domain/exceptions/index';
import type { LegalUpdatesRepository } from '../src/domain/repositories/LegalUpdatesRepository';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { InMemoryRemindersRepository } from '../src/infrastructure/repositories/RemindersRepositoryImpl';
import { InMemoryAssistantConversationRepository } from '../src/infrastructure/repositories/AssistantConversationRepositoryImpl';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function contract(status: 'READY' | 'ANALYZING' = 'READY'): Contract {
  return new Contract({
    id: 'k1', ownerId: 'u1', title: 'T', fileName: 'f.pdf', contractType: 'LEASE',
    jurisdiction: 'CO', locale: 'es', status,
    clauses: [new Clause({
      id: 'c1', orderIndex: 1, originalText: 'Texto', riskLevel: 'high',
      confidence: 0.9, plainExplanation: 'Explicacion',
    })],
  });
}

async function guidanceSetup(status: 'READY' | 'ANALYZING' = 'READY', updateCount = 0) {
  const contracts = new InMemoryContractRepository();
  await contracts.save(contract(status));
  const updates = Array.from({ length: updateCount }, (_, index) => new LegalUpdate({
    id: `u${index}`, sourceId: 's', tema: 'arriendo', title: 't', sourceUrl: 'https://example.test',
    contentHash: `h${index}`, detectedAt: NOW,
  }));
  const updatesRepo: LegalUpdatesRepository = {
    saveIfNew: async () => true,
    listRecent: async () => updates,
    getSourceState: async () => null,
    listSourceStates: async () => [],
    saveSourceState: async () => undefined,
  };
  return new GetContractGuidanceUseCase(
    contracts, new InMemoryFactsRepository(), new InMemoryRemindersRepository(), updatesRepo, () => NOW,
  );
}

describe('GetContractGuidanceUseCase', () => {
  it('returns the action plan and a narration that mentions recent legal updates', async () => {
    const useCase = await guidanceSetup('READY', 2);
    const guidance = await useCase.execute({ contractId: 'k1', userId: 'u1' });
    expect(guidance.steps[0].kind).toBe('resolve_high_risk_clause');
    expect(guidance.pendingLegalUpdates).toBe(2);
    expect(guidance.narration.some((segment) => segment.kind === 'legal_notice')).toBe(true);
    expect(guidance.locale).toBe('es');
  });

  it('enforces ownership and readiness', async () => {
    const useCase = await guidanceSetup();
    await expect(useCase.execute({ contractId: 'k1', userId: 'other' })).rejects.toBeInstanceOf(ContractOwnershipError);
    await expect(useCase.execute({ contractId: 'nope', userId: 'u1' })).rejects.toBeInstanceOf(ContractNotFoundError);
    const pending = await guidanceSetup('ANALYZING');
    await expect(pending.execute({ contractId: 'k1', userId: 'u1' })).rejects.toBeInstanceOf(ContractNotReadyError);
  });
});

describe('assistant history use cases', () => {
  async function historySetup() {
    const contracts = new InMemoryContractRepository();
    await contracts.save(contract());
    const conversations = new InMemoryAssistantConversationRepository();
    await conversations.append(new AssistantMessage({ id: 'm1', contractId: 'k1', userId: 'u1', role: 'user', content: 'hola' }));
    return {
      list: new ListAssistantMessagesUseCase(contracts, conversations),
      clear: new ClearAssistantConversationUseCase(contracts, conversations),
    };
  }

  it('lists the messages of an owned contract', async () => {
    const { list } = await historySetup();
    expect(await list.execute({ contractId: 'k1', userId: 'u1' })).toHaveLength(1);
  });

  it('refuses to list or clear another user conversation', async () => {
    const { list, clear } = await historySetup();
    await expect(list.execute({ contractId: 'k1', userId: 'x' })).rejects.toBeInstanceOf(ContractOwnershipError);
    await expect(clear.execute({ contractId: 'k1', userId: 'x' })).rejects.toBeInstanceOf(ContractOwnershipError);
  });

  it('clears the conversation and reports how many messages were removed', async () => {
    const { list, clear } = await historySetup();
    expect(await clear.execute({ contractId: 'k1', userId: 'u1' })).toBe(1);
    expect(await list.execute({ contractId: 'k1', userId: 'u1' })).toEqual([]);
  });
});
