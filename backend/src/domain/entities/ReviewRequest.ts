export type ReviewStatus = 'pending' | 'in_review' | 'reviewed';

export interface ReviewRequestProps {
  id: string;
  contractId: string;
  userId: string;
  status?: ReviewStatus;
  note?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Solicitud interna de revision humana: prepara el expediente y muestra
 * "pendiente". Sin revisores automaticos ni simulacion de pericia: el acceso
 * de revisores externos queda pendiente de un rol explicito y revocable.
 */
export class ReviewRequest {
  public readonly id: string;
  public readonly contractId: string;
  public readonly userId: string;
  public readonly status: ReviewStatus;
  public readonly note: string | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: ReviewRequestProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.userId = props.userId;
    this.status = props.status ?? 'pending';
    this.note = props.note ?? null;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      user_id: this.userId,
      status: this.status,
      note: this.note,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }
}
