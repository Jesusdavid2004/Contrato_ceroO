import { randomUUID } from 'node:crypto';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { ReviewRequestsRepository } from '../../domain/repositories/ReviewRequestsRepository';
import { ReviewRequest, type ReviewStatus } from '../../domain/entities/ReviewRequest';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  ReviewNotFoundError,
  ReviewStateError,
} from '../../domain/exceptions/index';

const FORWARD_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending: ['in_review', 'reviewed'],
  in_review: ['reviewed'],
  reviewed: [],
};

export class RequestReviewUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly reviewsRepository: ReviewRequestsRepository,
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
    note?: string;
  }): Promise<{ review: ReviewRequest; created: boolean }> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    return this.reviewsRepository.open({
      id: `review-${randomUUID()}`,
      contractId: contract.id,
      userId: input.userId,
      note: input.note?.trim() ? input.note.trim() : null,
    });
  }
}

export class UpdateReviewUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly reviewsRepository: ReviewRequestsRepository,
  ) {}

  public async execute(input: {
    reviewId: string;
    userId: string;
    status: ReviewStatus;
  }): Promise<ReviewRequest> {
    const review = await this.reviewsRepository.findById(input.reviewId);
    if (!review) throw new ReviewNotFoundError(input.reviewId);
    const contract = await this.contractRepository.findById(review.contractId);
    if (!contract) throw new ContractNotFoundError(review.contractId);
    // Sin rol de revisor aun: solo el propietario mueve estados (limitacion
    // documentada; el acceso externo queda pendiente de rol revocable).
    if (contract.ownerId !== input.userId || review.userId !== input.userId) {
      throw new ContractOwnershipError(review.contractId);
    }
    if (!FORWARD_TRANSITIONS[review.status].includes(input.status)) {
      throw new ReviewStateError(`Cannot move review from ${review.status} to ${input.status}.`);
    }
    const updated = await this.reviewsRepository.setStatus(review.id, input.status);
    if (!updated) throw new ReviewNotFoundError(review.id);
    return updated;
  }
}
