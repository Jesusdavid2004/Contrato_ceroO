import type { Clause } from '../entities/Clause';
import type { ActionStep } from './ActionPlan';
import { HIGH_RISK_SCORE_THRESHOLD } from './ActionPlan';

/**
 * Ordered, translatable narration script.
 *
 * The backend decides WHAT is narrated and in which order; the client turns
 * each segment's message key into text with i18n and reads it aloud. Segments
 * that belong to a clause carry its id so the UI can highlight it.
 */

export type NarrationSegmentKind =
  | 'intro'
  | 'clause'
  | 'step'
  | 'legal_notice'
  | 'disclaimer';

export interface NarrationSegment {
  id: string;
  kind: NarrationSegmentKind;
  messageKey: string;
  params: Record<string, string | number>;
  clauseId: string | null;
}

export interface NarrationInput {
  globalRiskScore: number;
  clauses: readonly Clause[];
  steps: readonly ActionStep[];
  /** Number of legal updates that affect this contract's topic. */
  pendingLegalUpdates: number;
}

export const MEDIUM_RISK_SCORE_THRESHOLD = 30;
export const MAX_NARRATED_CLAUSES = 6;

type IntroLevel = 'high' | 'medium' | 'low';

function introLevel(score: number): IntroLevel {
  if (score >= HIGH_RISK_SCORE_THRESHOLD) return 'high';
  if (score >= MEDIUM_RISK_SCORE_THRESHOLD) return 'medium';
  return 'low';
}

const RISK_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function clauseSegments(clauses: readonly Clause[]): NarrationSegment[] {
  return clauses
    .filter((clause) => clause.isFlagged())
    .sort((a, b) => RISK_RANK[a.riskLevel] - RISK_RANK[b.riskLevel] || a.orderIndex - b.orderIndex)
    .slice(0, MAX_NARRATED_CLAUSES)
    .map((clause) => ({
      id: `clause:${clause.id}`,
      kind: 'clause' as const,
      messageKey: `assistant.narration.clause_${clause.riskLevel}`,
      params: {
        position: clause.orderIndex,
        explanation: clause.plainExplanation,
        suggestion: clause.suggestedChange ?? '',
      },
      clauseId: clause.id,
    }));
}

export function buildNarrationScript(input: NarrationInput): NarrationSegment[] {
  const flaggedCount = input.clauses.filter((clause) => clause.isFlagged()).length;
  const segments: NarrationSegment[] = [
    {
      id: 'intro',
      kind: 'intro',
      messageKey: `assistant.narration.intro_${introLevel(input.globalRiskScore)}`,
      params: { score: input.globalRiskScore, flaggedCount },
      clauseId: null,
    },
    ...clauseSegments(input.clauses),
    ...input.steps.map((step) => ({
      id: `step:${step.id}`,
      kind: 'step' as const,
      messageKey: step.messageKey,
      params: { ...step.params, priority: step.priority },
      clauseId: step.clauseId,
    })),
  ];

  if (input.pendingLegalUpdates > 0) {
    segments.push({
      id: 'legal_notice',
      kind: 'legal_notice',
      messageKey: 'assistant.narration.legal_notice',
      params: { count: input.pendingLegalUpdates },
      clauseId: null,
    });
  }

  segments.push({
    id: 'disclaimer',
    kind: 'disclaimer',
    messageKey: 'assistant.disclaimer',
    params: {},
    clauseId: null,
  });
  return segments;
}
