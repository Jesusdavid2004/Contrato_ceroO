export interface ObjectionLetterProps {
  id?: string;
  contractId: string;
  locale: string;
  content: string;
  createdAt?: Date;
}

export class ObjectionLetter {
  public readonly id?: string;
  public readonly contractId: string;
  public readonly locale: string;
  public readonly content: string;
  public readonly createdAt: Date;

  constructor(props: ObjectionLetterProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.locale = props.locale;
    this.content = props.content;
    this.createdAt = props.createdAt || new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      locale: this.locale,
      content: this.content,
      created_at: this.createdAt.toISOString(),
    };
  }
}
