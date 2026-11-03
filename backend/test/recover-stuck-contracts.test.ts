import { describe, expect, it } from 'vitest';
import { Contract } from '../src/domain/entities/Contract';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import {
  RecoverStuckContractsUseCase,
  STUCK_JOB_FAILURE_KEY,
} from '../src/application/use-cases/RecoverStuckContractsUseCase';

const TIMEOUT_MS = 10 * 60 * 1000;
const T0 = new Date('2026-11-03T00:00:00.000Z');

function lease(id: string, status: 'UPLOADED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED' = 'UPLOADED'): Contract {
  return new Contract({
    id,
    ownerId: 'user-1',
    title: `Contract ${id}`,
    fileName: `${id}.pdf`,
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    status,
    uploadedAt: T0,
  });
}

describe('RecoverStuckContractsUseCase', () => {
  it('marks old EXTRACTING/ANALYZING contracts FAILED with the interrupted key', async () => {
    let now = T0;
    const repo = new InMemoryContractRepository(() => now);
    await repo.save(lease('stuck-extracting', 'EXTRACTING'));
    await repo.save(lease('stuck-analyzing', 'ANALYZING'));
    now = new Date(T0.getTime() + TIMEOUT_MS + 1000);

    const recovered = await new RecoverStuckContractsUseCase(repo, TIMEOUT_MS, () => now).execute();

    expect(recovered).toBe(2);
    expect((await repo.findById('stuck-extracting'))?.status).toBe('FAILED');
    expect((await repo.findById('stuck-extracting'))?.failureReason).toBe(STUCK_JOB_FAILURE_KEY);
    expect((await repo.findById('stuck-analyzing'))?.status).toBe('FAILED');
  });

  it('leaves fresh, finished, and already-failed contracts untouched', async () => {
    let now = T0;
    const repo = new InMemoryContractRepository(() => now);
    await repo.save(lease('fresh', 'ANALYZING'));
    await repo.save(lease('ready', 'READY'));
    await repo.save(lease('failed', 'FAILED'));
    now = new Date(T0.getTime() + TIMEOUT_MS - 1000);

    const recovered = await new RecoverStuckContractsUseCase(repo, TIMEOUT_MS, () => now).execute();

    expect(recovered).toBe(0);
    expect((await repo.findById('fresh'))?.status).toBe('ANALYZING');
    expect((await repo.findById('ready'))?.status).toBe('READY');
    expect((await repo.findById('failed'))?.status).toBe('FAILED');
  });

  it('recovers nothing when the queue is empty', async () => {
    const repo = new InMemoryContractRepository(() => T0);
    const recovered = await new RecoverStuckContractsUseCase(repo, TIMEOUT_MS, () => T0).execute();
    expect(recovered).toBe(0);
  });
});
