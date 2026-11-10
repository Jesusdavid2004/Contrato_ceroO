import type { ReviewRequest, ReviewStatus } from '../entities/ReviewRequest';

export interface ReviewRequestsRepository {
  /** Idempotente: solicitud abierta duplicada retorna la existente. */
  open(input: { id: string; contractId: string; userId: string; note?: string | null }): Promise<{ review: ReviewRequest; created: boolean }>;
  latestForContract(contractId: string): Promise<ReviewRequest | null>;
  findById(id: string): Promise<ReviewRequest | null>;
  setStatus(id: string, status: ReviewStatus): Promise<ReviewRequest | null>;
}
