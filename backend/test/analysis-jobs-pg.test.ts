import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresAnalysisJobQueue } from '../src/infrastructure/jobs/AnalysisJobQueueImpl';

// Condicional a PG_TEST_URL (base de desarrollo). Migraciones via CLI.
const PG_URL = process.env.PG_TEST_URL;

describe.runIf(PG_URL)('Analysis job queue (Postgres)', () => {
  const pool = new Pool({ connectionString: PG_URL });
  const suffix = Date.now();
  const userId = `pg-job-user-${suffix}`;
  const contractId = `contract-pg-job-${suffix}`;

  beforeAll(async () => {
    await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [userId, `${userId}@example.test`, 'hash', 'Pg Job User'],
    );
    await pool.query(
      `INSERT INTO contracts (id, user_id, title, file_name, contract_type, jurisdiction, locale, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [contractId, userId, 'Lease', 'lease.pdf', 'LEASE', 'CO', 'es', 'UPLOADED'],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM contracts WHERE id = $1', [contractId]).catch(() => undefined);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
    await pool.end();
  });

  it('encola idempotente y reclama con lease', async () => {
    const queue = new PostgresAnalysisJobQueue(pool);
    const input = { contractId, userId, stagingKey: contractId, mimeType: 'application/pdf' };
    const first = await queue.enqueue(input);
    expect(first.status).toBe('queued');
    expect((await queue.enqueue(input)).id).toBe(first.id);

    const claimed = await queue.claimNext('w-pg', 60_000);
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.leaseOwner).toBe('w-pg');
    expect(await queue.claimNext('w-other', 60_000)).toBeNull();
    await queue.complete(first.id);
  });

  it('reintenta, agota y cancela', async () => {
    const queue = new PostgresAnalysisJobQueue(pool);
    const job = await queue.enqueue({ contractId, userId, stagingKey: contractId, mimeType: 'application/pdf' });
    const claimed = await queue.claimNext('w-pg', 60_000);
    expect(claimed?.id).toBe(job.id);
    await queue.fail(job.id, 'errors.analysis_failed', new Date(Date.now() + 60_000));
    expect(await queue.cancelForContract(contractId)).toBe(1);
    expect(await queue.claimNext('w-pg', 60_000)).toBeNull();
  });

  it('recupera leases vencidos de un worker caido', async () => {
    const queue = new PostgresAnalysisJobQueue(pool);
    const job = await queue.enqueue({ contractId, userId, stagingKey: contractId, mimeType: 'application/pdf' });
    const claimed = await queue.claimNext('crashed-worker', -1000);
    expect(claimed?.id).toBe(job.id);
    const reclaimed = await queue.claimNext('new-worker', 60_000);
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.leaseOwner).toBe('new-worker');
    await queue.complete(job.id);
  });
});
