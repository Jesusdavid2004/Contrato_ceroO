import { describe, it, expect } from 'vitest';
import { Clause } from '../src/domain/entities/Clause';
import { buildActionPlan } from '../src/domain/services/ActionPlan';
import { buildNarrationScript, MAX_NARRATED_CLAUSES } from '../src/domain/services/NarrationScript';

function clause(id: string, orderIndex: number, riskLevel: 'low' | 'medium' | 'high'): Clause {
  return new Clause({
    id, orderIndex, originalText: `Text ${orderIndex}`, riskLevel,
    confidence: 0.9, plainExplanation: `Explanation ${orderIndex}`,
  });
}

function script(clauses: Clause[], score: number, pendingLegalUpdates = 0) {
  const steps = buildActionPlan({ clauses, facts: [], hasPendingReminders: true, globalRiskScore: score });
  return buildNarrationScript({ globalRiskScore: score, clauses, steps, pendingLegalUpdates });
}

describe('buildNarrationScript', () => {
  it('starts with an intro matching the risk band and ends with the disclaimer', () => {
    const result = script([clause('c1', 1, 'high')], 80);
    expect(result[0].messageKey).toBe('assistant.narration.intro_high');
    expect(result.at(-1)?.kind).toBe('disclaimer');
  });

  it('narrates high risk clauses first and ties each to its clause id', () => {
    const result = script([clause('c1', 1, 'medium'), clause('c2', 2, 'high')], 50);
    const clauseSegments = result.filter((segment) => segment.kind === 'clause');
    expect(clauseSegments.map((segment) => segment.clauseId)).toEqual(['c2', 'c1']);
  });

  it('limits narrated clauses so the walkthrough stays short', () => {
    const many = Array.from({ length: MAX_NARRATED_CLAUSES + 5 }, (_, index) => clause(`c${index}`, index + 1, 'high'));
    const result = script(many, 90);
    expect(result.filter((segment) => segment.kind === 'clause')).toHaveLength(MAX_NARRATED_CLAUSES);
  });

  it('adds a legal notice only when updates affect the contract', () => {
    const without = script([clause('c1', 1, 'low')], 0, 0);
    const withUpdates = script([clause('c1', 1, 'low')], 0, 2);
    expect(without.some((segment) => segment.kind === 'legal_notice')).toBe(false);
    expect(withUpdates.find((segment) => segment.kind === 'legal_notice')?.params.count).toBe(2);
  });

  it('produces unique segment ids', () => {
    const result = script([clause('c1', 1, 'high'), clause('c2', 2, 'medium')], 70, 1);
    expect(new Set(result.map((segment) => segment.id)).size).toBe(result.length);
  });
});
