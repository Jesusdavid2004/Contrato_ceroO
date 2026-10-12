import type { RiskLevel } from '../value-objects/RiskLevel.ts';
import type { LegalBasisReference } from '../entities/Clause.ts';

export interface ClassifiedClauseDTO {
  clause_id: string;
  risk_level: RiskLevel;
  confidence: number;
  plain_explanation: string;
  why_risky: string | null;
  legal_basis: LegalBasisReference[];
  suggested_change: string | null;
}

export interface ClassifyClausesRequest {
  contractType: string;
  jurisdiction: string;
  locale: string;
  clauses: Array<{ id: string; text: string }>;
  legalContext?: string;
}

export interface ObjectionLetterRequest {
  contractType: string;
  jurisdiction: string;
  locale: string;
  flaggedClauses: Array<{
    id: string;
    text: string;
    riskLevel: string;
    plainExplanation: string;
    whyRisky: string | null;
    legalBasis: LegalBasisReference[];
    suggestedChange: string | null;
  }>;
}

export interface AIProvider {
  classifyClauses(request: ClassifyClausesRequest): Promise<ClassifiedClauseDTO[]>;
  generateObjectionLetter(request: ObjectionLetterRequest): Promise<string>;
}
