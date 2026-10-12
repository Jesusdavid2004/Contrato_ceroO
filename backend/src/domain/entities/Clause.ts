import type { RiskLevel } from '../value-objects/RiskLevel';

export interface LegalBasisReference {
  reference: string;
  summary: string;
}

export interface ClauseProps {
  id: string;
  contractId?: string;
  orderIndex: number;
  originalText: string;
  riskLevel: RiskLevel;
  confidence: number;
  plainExplanation: string;
  whyRisky?: string | null;
  legalBasis?: LegalBasisReference[];
  suggestedChange?: string | null;
}

export class Clause {
  public readonly id: string;
  public readonly contractId?: string;
  public readonly orderIndex: number;
  public readonly originalText: string;
  public readonly riskLevel: RiskLevel;
  public readonly confidence: number;
  public readonly plainExplanation: string;
  public readonly whyRisky: string | null;
  public readonly legalBasis: LegalBasisReference[];
  public readonly suggestedChange: string | null;

  constructor(props: ClauseProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.orderIndex = props.orderIndex;
    this.originalText = props.originalText;
    this.riskLevel = props.riskLevel;
    this.confidence = Math.max(0, Math.min(1, props.confidence));
    this.plainExplanation = props.plainExplanation;
    this.whyRisky = props.whyRisky ?? null;
    this.legalBasis = props.legalBasis ?? [];
    this.suggestedChange = props.suggestedChange ?? null;
  }

  public isFlagged(): boolean {
    return this.riskLevel === 'high' || this.riskLevel === 'medium';
  }

  public toJSON() {
    return {
      id: this.id,
      order_index: this.orderIndex,
      original_text: this.originalText,
      risk_level: this.riskLevel,
      confidence: this.confidence,
      plain_explanation: this.plainExplanation,
      why_risky: this.whyRisky,
      legal_basis: this.legalBasis,
      suggested_change: this.suggestedChange,
    };
  }
}
