import { describe, it, expect } from 'vitest';
import { Clause } from '../src/domain/entities/Clause';
import { buildActionPlan, MAX_CLAUSE_STEPS_PER_LEVEL } from '../src/domain/services/ActionPlan';
import type { StoredContractFact } from '../src/domain/repositories/FactsRepository';

function clause(id: string, orderIndex: number, riskLevel: 'low' | 'medium' | 'high', confidence = 0.9): Clause {
  return new Clause({
    id,
    orderIndex,
    originalText: `Clause text number ${orderIndex}`,
    riskLevel,
    confidence,
    plainExplanation: 'Plain explanation.',
    suggestedChange: riskLevel === 'low' ? null : 'Ask for a cap.',
  });
}

function fact(key: StoredContractFact['key'], status: StoredContractFact['status'], value: string | null): StoredContractFact {
  return { key, status, value, evidenceClauseId: 'c1', evidenceQuote: value };
}

describe('buildActionPlan', () => {
  it('orders high risk clauses before medium ones and numbers priorities contiguously', () => {
    const plan = buildActionPlan({
      clauses: [clause('c1', 1, 'medium'), clause('c2', 2, 'high'), clause('c3', 3, 'low')],
      facts: [],
      hasPendingReminders: false,
      globalRiskScore: 40,
    });
    expect(plan.map((step) => step.kind)).toEqual([
      'resolve_high_risk_clause',
      'negotiate_medium_risk_clause',
      'prepare_objection_letter',
    ]);
    expect(plan.map((step) => step.priority)).toEqual([1, 2, 3]);
    expect(plan[0].clauseId).toBe('c2');
  });

  it('returns an empty plan for a contract with only low risk clauses', () => {
    const plan = buildActionPlan({
      clauses: [clause('c1', 1, 'low')],
      facts: [],
      hasPendingReminders: false,
      globalRiskScore: 0,
    });
    expect(plan).toEqual([]);
  });

  it('suggests a deadline reminder only when an end date exists and none is pending', () => {
    const facts = [fact('end_date', 'found', '2027-01-01')];
    const clauses = [clause('c1', 1, 'low')];
    const withoutReminder = buildActionPlan({ clauses, facts, hasPendingReminders: false, globalRiskScore: 0 });
    const withReminder = buildActionPlan({ clauses, facts, hasPendingReminders: true, globalRiskScore: 0 });
    expect(withoutReminder.map((step) => step.kind)).toContain('set_deadline_reminder');
    expect(withReminder.map((step) => step.kind)).not.toContain('set_deadline_reminder');
  });

  it('asks to confirm unconfirmed facts that have a value', () => {
    const plan = buildActionPlan({
      clauses: [clause('c1', 1, 'low')],
      facts: [fact('amount', 'unconfirmed', '100'), fact('party_a', 'unconfirmed', null)],
      hasPendingReminders: true,
      globalRiskScore: 0,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].params.factKey).toBe('amount');
  });

  it('recommends a professional when the score is high or a clause needs review', () => {
    const highScore = buildActionPlan({
      clauses: [clause('c1', 1, 'high')],
      facts: [],
      hasPendingReminders: true,
      globalRiskScore: 80,
    });
    const needsReview = buildActionPlan({
      clauses: [clause('c1', 1, 'low', 0.3)],
      facts: [],
      hasPendingReminders: true,
      globalRiskScore: 5,
    });
    expect(highScore.at(-1)?.kind).toBe('consult_professional');
    expect(needsReview.at(-1)?.kind).toBe('consult_professional');
  });

  it('caps the number of clause steps per risk level', () => {
    const many = Array.from({ length: MAX_CLAUSE_STEPS_PER_LEVEL + 4 }, (_, index) => clause(`h${index}`, index + 1, 'high'));
    const plan = buildActionPlan({ clauses: many, facts: [], hasPendingReminders: true, globalRiskScore: 90 });
    expect(plan.filter((step) => step.kind === 'resolve_high_risk_clause')).toHaveLength(MAX_CLAUSE_STEPS_PER_LEVEL);
  });
});
