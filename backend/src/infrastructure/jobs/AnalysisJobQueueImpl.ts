import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  AnalysisJob,
  AnalysisJobQueue,
  EnqueueAnalysisJob,
} from '../../domain/services/AnalysisJobs';

interface JobRow {
  id: string;
  contract_id: string;
  user_id: string;
  staging_key: string;
  mime_type: string;
  status: string;
  attempts: number | string;
  max_attempts: number | string;
  run_after: Date | string;
  lease_owner: string | null;
  lease_expires_at: Date | string | null;
  error_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const ACTIVE = `status IN ('queued', 'running')`;

function toJob(row: JobRow): AnalysisJob {
  return {
    id: row.id,
    contractId: row.contract_id,
    userId: row.user_id,
    stagingKey: row.staging_key,
    mimeType: row.mime_type,
    status: row.status as AnalysisJob['status'],
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: new Date(row.run_after),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
    errorKey: row.error_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const SELECT_ALL = `id, contract_id, user_id, staging_key, mime_type, status,
  attempts, max_attempts, run_after, lease_owner, lease_expires_at,
  error_key, created_at, updated_at`;

export class PostgresAnalysisJobQueue implements AnalysisJobQueue {
  constructor(private readonly pool: Pool) {}

  public async enqueue(input: EnqueueAnalysisJob): Promise<AnalysisJob> {
    const inserted = await this.pool.query(
      `INSERT INTO analysis_jobs (id, contract_id, user_id, staging_key, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contract_id) WHERE ${ACTIVE} DO NOTHING
       RETURNING ${SELECT_ALL}`,
      [`job-${randomUUID()}`, input.contractId, input.userId, input.stagingKey, input.mimeType],
    );
    if (inserted.rows.length > 0) return toJob(inserted.rows[0] as JobRow);
    const existing = await this.pool.query(
      `SELECT ${SELECT_ALL} FROM analysis_jobs WHERE contract_id = $1 AND ${ACTIVE}`,
      [input.contractId],
    );
    if (existing.rows.length === 0) {
      throw new Error('Analysis job conflicted but no active job exists.');
    }
    return toJob(existing.rows[0] as JobRow);
  }

  public async claimNext(owner: string, leaseMs: number, now: Date = new Date()): Promise<AnalysisJob | null> {
    const res = await this.pool.query(
      `WITH next AS (
         SELECT id FROM analysis_jobs
         WHERE (status = 'queued' AND run_after <= NOW())
            OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < NOW())
         ORDER BY created_at ASC LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE analysis_jobs j
       SET status = 'running', lease_owner = $1, lease_expires_at = $2, updated_at = NOW()
       FROM next WHERE j.id = next.id
       RETURNING ${SELECT_ALL.split(',').map((column) => `j.${column.trim()}`).join(', ')}`,
      [owner, new Date(now.getTime() + leaseMs)],
    );
    if (res.rows.length === 0) return null;
    return toJob(res.rows[0] as JobRow);
  }

  public async complete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE analysis_jobs
       SET status = 'done', lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  public async fail(id: string, errorKey: string | null, retryAt: Date | null): Promise<void> {
    await this.pool.query(
      `UPDATE analysis_jobs
       SET status = CASE WHEN $3::timestamptz IS NULL THEN 'failed' ELSE 'queued' END,
           attempts = attempts + 1,
           run_after = COALESCE($3::timestamptz, run_after),
           lease_owner = NULL,
           lease_expires_at = NULL,
           error_key = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, errorKey, retryAt],
    );
  }

  public async cancelForContract(contractId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE analysis_jobs
       SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE contract_id = $1 AND ${ACTIVE}`,
      [contractId],
    );
    return res.rowCount ?? 0;
  }
}

export class InMemoryAnalysisJobQueue implements AnalysisJobQueue {
  private readonly jobs = new Map<string, AnalysisJob>();

  private activeFor(contractId: string): AnalysisJob | undefined {
    return [...this.jobs.values()].find(
      (job) => job.contractId === contractId && (job.status === 'queued' || job.status === 'running'),
    );
  }

  public async enqueue(input: EnqueueAnalysisJob): Promise<AnalysisJob> {
    const existing = this.activeFor(input.contractId);
    if (existing) return { ...existing };
    const now = new Date();
    const job: AnalysisJob = {
      id: `job-${randomUUID()}`,
      contractId: input.contractId,
      userId: input.userId,
      stagingKey: input.stagingKey,
      mimeType: input.mimeType,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      runAfter: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorKey: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }

  public async claimNext(owner: string, leaseMs: number, now: Date = new Date()): Promise<AnalysisJob | null> {
    const candidate = [...this.jobs.values()]
      .filter((job) =>
        (job.status === 'queued' && job.runAfter.getTime() <= now.getTime())
        || (job.status === 'running' && job.leaseExpiresAt !== null && job.leaseExpiresAt.getTime() < now.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!candidate) return null;
    candidate.status = 'running';
    candidate.leaseOwner = owner;
    candidate.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    candidate.updatedAt = now;
    return { ...candidate };
  }

  public async complete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'done';
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = new Date();
  }

  public async fail(id: string, errorKey: string | null, retryAt: Date | null): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.attempts += 1;
    job.errorKey = errorKey;
    if (retryAt) {
      job.status = 'queued';
      job.runAfter = retryAt;
    } else {
      job.status = 'failed';
    }
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = new Date();
  }

  public async cancelForContract(contractId: string): Promise<number> {
    let cancelled = 0;
    for (const job of this.jobs.values()) {
      if (job.contractId === contractId && (job.status === 'queued' || job.status === 'running')) {
        job.status = 'cancelled';
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        job.updatedAt = new Date();
        cancelled += 1;
      }
    }
    return cancelled;
  }
}
