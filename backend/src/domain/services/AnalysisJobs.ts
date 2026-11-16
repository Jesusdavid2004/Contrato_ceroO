/**
 * Cola duradera de trabajos de analisis en PostgreSQL. Reemplaza la cola
 * exclusivamente en memoria: los trabajos sobreviven reinicios mediante
 * leases con expiracion; un unico activo por contrato (idempotencia).
 */
export type AnalysisJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface AnalysisJob {
  id: string;
  contractId: string;
  userId: string;
  stagingKey: string;
  mimeType: string;
  status: AnalysisJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  errorKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueAnalysisJob {
  contractId: string;
  userId: string;
  stagingKey: string;
  mimeType: string;
}

export interface AnalysisJobQueue {
  /** Idempotente: si hay un trabajo activo del contrato, lo retorna. */
  enqueue(input: EnqueueAnalysisJob): Promise<AnalysisJob>;
  /** Reclama el siguiente listo (o con lease vencido) con lease nuevo. */
  claimNext(owner: string, leaseMs: number, now?: Date): Promise<AnalysisJob | null>;
  complete(id: string): Promise<void>;
  /** Suma un intento; retryAt null lo deja terminal. */
  fail(id: string, errorKey: string | null, retryAt: Date | null): Promise<void>;
  /** Cancela activos del contrato (borrado): retorna cancelados. */
  cancelForContract(contractId: string): Promise<number>;
}
