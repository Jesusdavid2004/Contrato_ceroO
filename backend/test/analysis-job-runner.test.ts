import { describe, it, expect } from 'vitest';
import { AnalysisJobRunner } from '../src/infrastructure/jobs/AnalysisJobRunner';
import { InMemoryAnalysisJobQueue } from '../src/infrastructure/jobs/AnalysisJobQueueImpl';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { Contract } from '../src/domain/entities/Contract';
import { ContractNotFoundError } from '../src/domain/exceptions/index';

function leaseContract(id = 'contract-run-1'): Contract {
  return new Contract({
    id,
    ownerId: 'user-1',
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
  });
}

describe('AnalysisJobRunner', () => {
  it('ejecuta y completa con los bytes del staging', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const contracts = new InMemoryContractRepository();
    await contracts.save(leaseContract());
    const seen: Array<{ stagingKey: string; mimeType: string }> = [];
    const runner = new AnalysisJobRunner(
      queue,
      contracts,
      async (input) => {
        seen.push({ stagingKey: input.stagingKey ?? '', mimeType: input.mimeType });
      },
      { ownerId: 'w-test' },
    );
    await queue.enqueue({ contractId: 'contract-run-1', userId: 'user-1', stagingKey: 'contract-run-1', mimeType: 'application/pdf' });
    expect(await runner.runOnce()).toBe('done');
    expect(seen).toEqual([{ stagingKey: 'contract-run-1', mimeType: 'application/pdf' }]);
    expect(await runner.runOnce()).toBe('idle');
  });

  it('reintenta con backoff y declara fallo terminal tras el maximo', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const contracts = new InMemoryContractRepository();
    await contracts.save(leaseContract());
    let now = new Date();
    let calls = 0;
    const runner = new AnalysisJobRunner(
      queue,
      contracts,
      async () => {
        calls += 1;
        throw new Error('transient');
      },
      { ownerId: 'w-test', clock: () => now },
    );
    await queue.enqueue({ contractId: 'contract-run-1', userId: 'user-1', stagingKey: 'k', mimeType: 'application/pdf' });

    expect(await runner.runOnce()).toBe('retried');
    expect(await runner.runOnce()).toBe('idle');
    now = new Date(now.getTime() + 6_000);
    expect(await runner.runOnce()).toBe('retried');
    now = new Date(now.getTime() + 11_000);
    expect(await runner.runOnce()).toBe('failed');
    expect(await runner.runOnce()).toBe('idle');
    expect(calls).toBe(3);
  });

  it('cancela sin resucitar cuando el contrato fue borrado', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const contracts = new InMemoryContractRepository();
    let calls = 0;
    const runner = new AnalysisJobRunner(
      queue,
      contracts,
      async () => {
        calls += 1;
      },
      { ownerId: 'w-test' },
    );
    await queue.enqueue({ contractId: 'contract-gone', userId: 'user-1', stagingKey: 'k', mimeType: 'application/pdf' });
    expect(await runner.runOnce()).toBe('cancelled');
    expect(calls).toBe(0);
    expect(await contracts.findById('contract-gone')).toBeNull();
  });

  it('sobrevive a una caida tras persistir: reintenta y completa', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const contracts = new InMemoryContractRepository();
    const contract = leaseContract();
    await contracts.save(contract);
    let now = new Date();
    let calls = 0;
    const runner = new AnalysisJobRunner(
      queue,
      contracts,
      async (input) => {
        calls += 1;
        const found = await contracts.findById(input.contractId);
        if (!found) throw new ContractNotFoundError(input.contractId);
        if (calls === 1) {
          found.markReady();
          await contracts.save(found);
          throw new Error('crash after persist');
        }
      },
      { ownerId: 'w-test', clock: () => now },
    );
    await queue.enqueue({ contractId: contract.id, userId: 'user-1', stagingKey: 'k', mimeType: 'application/pdf' });
    expect(await runner.runOnce()).toBe('retried');
    now = new Date(now.getTime() + 6_000);
    expect(await runner.runOnce()).toBe('done');
    expect((await contracts.findById(contract.id))?.status).toBe('READY');
    expect(calls).toBe(2);
  });
});
