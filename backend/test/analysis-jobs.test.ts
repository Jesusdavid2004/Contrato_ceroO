import { describe, it, expect } from 'vitest';
import { InMemoryAnalysisJobQueue } from '../src/infrastructure/jobs/AnalysisJobQueueImpl';

function input(contractId = 'contract-jobs-1') {
  return { contractId, userId: 'user-1', stagingKey: contractId, mimeType: 'application/pdf' };
}

describe('AnalysisJobQueue (in memory)', () => {
  it('encola idempotente por contrato activo', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const first = await queue.enqueue(input());
    expect(first.status).toBe('queued');
    expect(first.attempts).toBe(0);
    const second = await queue.enqueue(input());
    expect(second.id).toBe(first.id);
  });

  it('reclama en orden, bloquea mientras corre y recupera leases vencidos', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const now = new Date();
    await queue.enqueue(input('contract-a'));
    await queue.enqueue(input('contract-b'));

    const claimed = await queue.claimNext('w1', 60_000, now);
    expect(claimed?.contractId).toBe('contract-a');
    expect(claimed?.status).toBe('running');
    expect(claimed?.leaseOwner).toBe('w1');

    const second = await queue.claimNext('w2', 60_000, now);
    expect(second?.contractId).toBe('contract-b');

    expect(await queue.claimNext('w3', 60_000, now)).toBeNull();

    // Lease vencido: otro worker lo recupera.
    const later = new Date(now.getTime() + 61_000);
    const reclaimed = await queue.claimNext('w3', 60_000, later);
    expect(reclaimed?.contractId).toBe('contract-a');
    expect(reclaimed?.leaseOwner).toBe('w3');
  });

  it('reintenta con backoff y luego falla terminal', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const job = await queue.enqueue(input());
    const now = new Date();
    await queue.fail(job.id, 'errors.analysis_failed', new Date(now.getTime() + 5_000));
    const retry = await queue.claimNext('w1', 60_000, now);
    expect(retry).toBeNull();
    const due = await queue.claimNext('w1', 60_000, new Date(now.getTime() + 6_000));
    expect(due?.attempts).toBe(1);
    await queue.fail(due?.id ?? '', 'errors.analysis_failed', null);
    expect(await queue.claimNext('w1', 60_000, new Date(now.getTime() + 60_000))).toBeNull();
  });

  it('completa, cancela por contrato y permite reencolar tras terminal', async () => {
    const queue = new InMemoryAnalysisJobQueue();
    const job = await queue.enqueue(input());
    await queue.complete(job.id);
    expect(await queue.cancelForContract(job.contractId)).toBe(0);

    const second = await queue.enqueue(input());
    expect(second.id).not.toBe(job.id);
    expect(await queue.cancelForContract(second.contractId)).toBe(1);
    expect(await queue.claimNext('w1', 60_000)).toBeNull();
  });
});
