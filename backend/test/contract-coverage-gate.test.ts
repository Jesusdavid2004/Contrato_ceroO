import { describe, it, expect } from 'vitest';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { InMemoryStaging } from '../src/infrastructure/staging/InMemoryStaging';
import { stagingUriFor } from '../src/domain/services/AnalysisStaging';
import { Contract } from '../src/domain/entities/Contract';
import { OutOfCoverageError } from '../src/domain/exceptions/index';

function testContract(id: string, contractType: 'LEASE' | 'SERVICE', jurisdiction: 'CO' | 'US'): Contract {
  return new Contract({
    id,
    ownerId: 'user-1',
    title: 'Test',
    fileName: 'test.pdf',
    contractType,
    jurisdiction,
    locale: 'es',
  });
}

describe('Coverage gate', () => {
  it('fuera de cobertura falla explicito sin IA, sin cuota y limpia staging', async () => {
    const repository = new InMemoryContractRepository();
    const staging = new InMemoryStaging();
    const contract = testContract('contract-ooc', 'SERVICE', 'US');
    await repository.save(contract);
    await staging.stage(contract.id, { buffer: Buffer.from('bytes'), mimeType: 'application/pdf' }, 60_000);

    let aiCalls = 0;
    let retrieveCalls = 0;
    let reserveCalls = 0;
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => { throw new Error('must not extract'); } },
      { segment: async () => { throw new Error('must not segment'); } },
      {
        classifyClauses: async () => {
          aiCalls += 1;
          throw new Error('AI must not run out of coverage');
        },
        generateObjectionLetter: async () => '',
      },
      {
        reserveDailyAnalysis: async () => {
          reserveCalls += 1;
          return true;
        },
        recordUsage: async () => undefined,
      },
      new InMemoryAIClassificationCache(),
      () => new Date('2026-11-10T00:00:00.000Z'),
      {
        retrieve: async () => {
          retrieveCalls += 1;
          return [];
        },
      },
      undefined,
      staging,
    );

    await expect(useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      stagingKey: contract.id,
      mimeType: 'application/pdf',
    })).rejects.toBeInstanceOf(OutOfCoverageError);

    const failed = await repository.findById(contract.id);
    expect(failed?.status).toBe('FAILED');
    expect(failed?.failureReason).toBe('errors.out_of_coverage');
    expect(aiCalls).toBe(0);
    expect(retrieveCalls).toBe(0);
    expect(reserveCalls).toBe(0);
    expect(await staging.fetch(stagingUriFor(contract.id))).toBeNull();
  });

  it('en cobertura experimental recupera contexto legal de su jurisdiccion', async () => {
    const repository = new InMemoryContractRepository();
    const contract = testContract('contract-cov', 'LEASE', 'CO');
    await repository.save(contract);

    const retrieved: Array<{ jurisdiction: string; count: number }> = [];
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => 'El canon mensual es de $500.000.' },
      { segment: async () => [{ orderIndex: 1, text: 'El canon mensual es de $500.000.' }] },
      {
        classifyClauses: async (input) => ({
          clauses: input.clauses.map((item) => ({
            clause_id: item.id,
            risk_level: 'low' as const,
            confidence: 0.9,
            plain_explanation: 'Sin riesgo evidente.',
            why_risky: null,
            legal_basis: [],
            suggested_change: null,
          })),
          usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
        }),
        generateObjectionLetter: async () => '',
      },
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
      () => new Date('2026-11-10T00:00:00.000Z'),
      {
        retrieve: async (jurisdiction, clauses) => {
          retrieved.push({ jurisdiction, count: clauses.length });
          return [];
        },
      },
    );

    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('x'),
      mimeType: 'application/pdf',
    });

    expect((await repository.findById(contract.id))?.status).toBe('READY');
    expect(retrieved).toEqual([{ jurisdiction: 'CO', count: 1 }]);
  });
});
