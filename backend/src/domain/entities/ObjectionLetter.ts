export type LetterPurpose = 'clarification' | 'adjustment' | 'other';
export type LetterTone = 'respectful' | 'formal' | 'firm';

export interface ObjectionLetterProps {
  id?: string;
  contractId: string;
  locale: string;
  content: string;
  recipient?: string | null;
  purpose?: LetterPurpose;
  tone?: LetterTone;
  selectedClauseIds?: string[];
  createdAt?: Date;
}

export class ObjectionLetter {
  public readonly id?: string;
  public readonly contractId: string;
  public readonly locale: string;
  public readonly content: string;
  public readonly recipient: string | null;
  public readonly purpose: LetterPurpose;
  public readonly tone: LetterTone;
  public readonly selectedClauseIds: string[];
  public readonly createdAt: Date;

  constructor(props: ObjectionLetterProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.locale = props.locale;
    this.content = props.content;
    this.recipient = props.recipient ?? null;
    this.purpose = props.purpose ?? 'clarification';
    this.tone = props.tone ?? 'respectful';
    this.selectedClauseIds = props.selectedClauseIds ?? [];
    this.createdAt = props.createdAt || new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      locale: this.locale,
      content: this.content,
      recipient: this.recipient,
      purpose: this.purpose,
      tone: this.tone,
      selected_clause_ids: this.selectedClauseIds,
      created_at: this.createdAt.toISOString(),
    };
  }
}
