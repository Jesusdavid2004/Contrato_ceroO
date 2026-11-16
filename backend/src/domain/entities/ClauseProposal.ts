export type ProposalStatus = 'draft' | 'accepted' | 'discarded';

export interface ClauseProposalProps {
  id: string;
  contractId: string;
  clauseId: string;
  originalText: string;
  proposedText: string;
  reason: string;
  status?: ProposalStatus;
  version: number;
  createdAt?: Date;
}

/**
 * Propuesta de ajuste sobre una clausula: original + propuesta + motivo.
 * Vive en el borrador del usuario; aceptar no modifica el contrato de la
 * contraparte.
 */
export class ClauseProposal {
  public readonly id: string;
  public readonly contractId: string;
  public readonly clauseId: string;
  public readonly originalText: string;
  public readonly proposedText: string;
  public readonly reason: string;
  public readonly status: ProposalStatus;
  public readonly version: number;
  public readonly createdAt: Date;

  constructor(props: ClauseProposalProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.clauseId = props.clauseId;
    this.originalText = props.originalText;
    this.proposedText = props.proposedText;
    this.reason = props.reason;
    this.status = props.status ?? 'draft';
    this.version = props.version;
    this.createdAt = props.createdAt || new Date();
  }

  public isEditable(): boolean {
    return this.status === 'draft';
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      clause_id: this.clauseId,
      original_text: this.originalText,
      proposed_text: this.proposedText,
      reason: this.reason,
      status: this.status,
      version: this.version,
      created_at: this.createdAt.toISOString(),
    };
  }
}
