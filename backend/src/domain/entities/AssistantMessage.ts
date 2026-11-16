export type AssistantRole = 'user' | 'assistant';

/** `update`: an official source changed. `news`: a press item, never presented as law. */
export type AssistantSourceKind = 'clause' | 'fact' | 'legal' | 'update' | 'news';

export interface AssistantCitation {
  sourceId: string;
  kind: AssistantSourceKind;
  label: string;
  quote: string;
  sourceUrl?: string;
  verifiedAt?: string;
}

export interface AssistantMessageProps {
  id: string;
  contractId: string;
  userId: string;
  role: AssistantRole;
  content: string;
  citations?: AssistantCitation[];
  /** False when the reply could not be backed by any source in the contract context. */
  grounded?: boolean;
  createdAt?: Date;
}

/** One turn of the per-contract conversation. Immutable once created. */
export class AssistantMessage {
  public readonly id: string;
  public readonly contractId: string;
  public readonly userId: string;
  public readonly role: AssistantRole;
  public readonly content: string;
  public readonly citations: AssistantCitation[];
  public readonly grounded: boolean;
  public readonly createdAt: Date;

  constructor(props: AssistantMessageProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.userId = props.userId;
    this.role = props.role;
    this.content = props.content;
    this.citations = props.citations ?? [];
    this.grounded = props.grounded ?? props.role === 'user';
    this.createdAt = props.createdAt ?? new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      role: this.role,
      content: this.content,
      citations: this.citations.map((citation) => ({
        source_id: citation.sourceId,
        kind: citation.kind,
        label: citation.label,
        quote: citation.quote,
        source_url: citation.sourceUrl ?? null,
        verified_at: citation.verifiedAt ?? null,
      })),
      grounded: this.grounded,
      created_at: this.createdAt.toISOString(),
    };
  }
}
