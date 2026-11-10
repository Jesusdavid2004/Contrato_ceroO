import { randomUUID } from 'node:crypto';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { AnalysisJobQueue } from '../../domain/services/AnalysisJobs';
import type { AnalyzeContractInput } from '../../application/use-cases/AnalyzeContractUseCase';
import { ContractNotFoundError } from '../../domain/exceptions/index';
import { DomainError } from '../../domain/exceptions/DomainError';
import { logger } from '../../shared/logger';

export type JobRunOutcome = 'idle' | 'done' | 'retried' | 'failed' | 'cancelled';

function backoffMs(attempts: number): number {
  return Math.min(5000 * 2 ** Math.max(0, attempts - 1), 300000);
}

/**
 * Ejecuta trabajos de la cola durable. Sin recuperacion improvisada:
 * leases con expiracion, reintentos acotados con backoff, idempotencia por
 * contrato y cancelacion cuando el contrato ya no existe (nunca resucita
 * datos borrados). No hay apagon elegante aun: ante una caida los leases
 * vencen y otro arranque los reclama (disenado para eso).
 */
export class AnalysisJobRunner {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queue: AnalysisJobQueue,
    private readonly contracts: ContractRepository,
    private readonly analyze: (input: AnalyzeContractInput) => Promise<void>,
    private readonly options: {
      ownerId?: string;
      leaseMs?: number;
      intervalMs?: number;
      maxAttempts?: number;
      clock?: () => Date;
    } = {},
  ) {}

  public start(): () => void {
    if (this.timer) return () => this.stop();
    const intervalMs = this.options.intervalMs ?? 1000;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        logger.error('Analysis job cycle failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, intervalMs);
    this.timer.unref();
    return () => this.stop();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runOnce(): Promise<JobRunOutcome> {
    const now = (this.options.clock ?? (() => new Date()))();
    const owner = this.options.ownerId ?? `worker-${randomUUID()}`;
    const job = await this.queue.claimNext(owner, this.options.leaseMs ?? 10 * 60 * 1000, now);
    if (!job) return 'idle';

    const contract = await this.contracts.findById(job.contractId);
    if (!contract) {
      await this.queue.cancelForContract(job.contractId);
      logger.info('Analysis job cancelled: contract gone', { jobId: job.id });
      return 'cancelled';
    }

    try {
      await this.analyze({
        contractId: job.contractId,
        userId: job.userId,
        stagingKey: job.stagingKey,
        mimeType: job.mimeType,
      });
      await this.queue.complete(job.id);
      return 'done';
    } catch (error) {
      if (error instanceof ContractNotFoundError) {
        await this.queue.cancelForContract(job.contractId);
        return 'cancelled';
      }
      const attempts = job.attempts + 1;
      const maxAttempts = job.maxAttempts > 0 ? job.maxAttempts : 3;
      const errorKey = error instanceof DomainError ? error.messageKey : 'errors.analysis_failed';
      if (attempts >= maxAttempts) {
        await this.queue.fail(job.id, errorKey, null);
        logger.error('Analysis job failed terminally', {
          jobId: job.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        return 'failed';
      }
      await this.queue.fail(job.id, errorKey, new Date(now.getTime() + backoffMs(attempts)));
      return 'retried';
    }
  }
}
