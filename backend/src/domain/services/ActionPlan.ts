import type { Clause } from '../entities/Clause';
import type { StoredContractFact } from '../repositories/FactsRepository';

/**
 * Deterministic "what should I do now" plan.
 *
 * Priorities, ordering and deadlines come from code only. Steps carry message
 * keys and parameters so the client translates them (no user-facing prose is
 * produced in the backend and the LLM never decides numbers or priorities).
 */

export type ActionStepKind =
  | 'resolve_high_risk_clause'
  | 'negotiate_medium_risk_clause'
  | 'confirm_extracted_fact'
  | 'set_deadline_reminder'
  | 'prepare_objection_letter'
  | 'consult_professional';

export interface ActionStep {
  id: string;
  kind: ActionStepKind;
  /** 1 is the most urgent. Unique and contiguous within a plan. */
  priority: number;
  messageKey: string;
  params: Record<string, string | number>;
  clauseId: string | null;
}

export interface ActionPlanInput {
  clauses: readonly Clause[];
  facts: readonly StoredContractFact[];
  hasPendingReminders: boolean;
  globalRiskScore: number;
}

export const HIGH_RISK_SCORE_THRESHOLD = 60;
export const MAX_CLAUSE_STEPS_PER_LEVEL = 5;
const CLAUSE_EXCERPT_LENGTH = 80;

const STEP_KEYS: Record<ActionStepKind, string> = {
  resolve_high_risk_clause: 'assistant.plan.resolve_high_risk_clause',
  negotiate_medium_risk_clause: 'assistant.plan.negotiate_medium_risk_clause',
  confirm_extracted_fact: 'assistant.plan.confirm_extracted_fact',
  set_deadline_reminder: 'assistant.plan.set_deadline_reminder',
  prepare_objection_letter: 'assistant.plan.prepare_objection_letter',
  consult_professional: 'assistant.plan.consult_professional',
};

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= CLAUSE_EXCERPT_LENGTH ? flat : `${flat.slice(0, CLAUSE_EXCERPT_LENGTH)}…`;
}

function byOrder(a: Clause, b: Clause): number {
  return a.orderIndex - b.orderIndex;
}

function clauseSteps(
  clauses: readonly Clause[],
  level: 'high' | 'medium',
  kind: ActionStepKind,
): Omit<ActionStep, 'priority'>[] {
  return clauses
    .filter((clause) => clause.riskLevel === level)
    .sort(byOrder)
    .slice(0, MAX_CLAUSE_STEPS_PER_LEVEL)
    .map((clause) => ({
      id: `${kind}:${clause.id}`,
      kind,
      messageKey: STEP_KEYS[kind],
      params: {
        position: clause.orderIndex,
        excerpt: excerpt(clause.originalText),
        hasSuggestedChange: clause.suggestedChange ? 1 : 0,
      },
      clauseId: clause.id,
    }));
}

function unconfirmedFactSteps(
  facts: readonly StoredContractFact[],
): Omit<ActionStep, 'priority'>[] {
  return facts
    .filter((fact) => fact.status === 'unconfirmed' && fact.value)
    .map((fact) => ({
      id: `confirm_extracted_fact:${fact.key}`,
      kind: 'confirm_extracted_fact' as const,
      messageKey: STEP_KEYS.confirm_extracted_fact,
      params: { factKey: fact.key },
      clauseId: fact.evidenceClauseId,
    }));
}

export function buildActionPlan(input: ActionPlanInput): ActionStep[] {
  const high = clauseSteps(input.clauses, 'high', 'resolve_high_risk_clause');
  const medium = clauseSteps(input.clauses, 'medium', 'negotiate_medium_risk_clause');
  const flaggedCount = high.length + medium.length;

  const hasEndDate = input.facts.some((fact) => fact.key === 'end_date' && fact.value);
  const needsDeadline = hasEndDate && !input.hasPendingReminders;
  const needsReview = input.clauses.some((clause) => clause.requiresReview);
  const needsProfessional =
    input.globalRiskScore >= HIGH_RISK_SCORE_THRESHOLD || needsReview;

  const drafts: Omit<ActionStep, 'priority'>[] = [
    ...high,
    ...medium,
    ...unconfirmedFactSteps(input.facts),
    ...(needsDeadline
      ? [{
        id: 'set_deadline_reminder',
        kind: 'set_deadline_reminder' as const,
        messageKey: STEP_KEYS.set_deadline_reminder,
        params: {},
        clauseId: null,
      }]
      : []),
    ...(flaggedCount > 0
      ? [{
        id: 'prepare_objection_letter',
        kind: 'prepare_objection_letter' as const,
        messageKey: STEP_KEYS.prepare_objection_letter,
        params: { flaggedCount },
        clauseId: null,
      }]
      : []),
    ...(needsProfessional
      ? [{
        id: 'consult_professional',
        kind: 'consult_professional' as const,
        messageKey: STEP_KEYS.consult_professional,
        params: { score: input.globalRiskScore },
        clauseId: null,
      }]
      : []),
  ];

  return drafts.map((draft, index) => ({ ...draft, priority: index + 1 }));
}
