import { describe, expect, it } from 'vitest';
import {
  ContractApiError,
  getErrorKey,
  isRiskLevel,
  parseContract,
  parseContractSummary,
  parseObjectionLetter,
  parseStatus,
} from './contracts';

/**
 * Characterization tests: pin the observable behavior of the legacy
 * hand-written validators before the Zod migration (Phase A5).
 * Same inputs must produce the same outcomes after the rewrite.
 */
describe('legacy contract validators (characterization)', () => {
  it('accepts a well-formed status payload', () => {
    expect(parseStatus({ status: 'READY', failure_message_key: null })).toEqual({
      status: 'READY',
      failure_message_key: null,
    });
  });

  it('rejects status payloads with missing or mistyped fields', () => {
    expect(() => parseStatus({})).toThrowError(ContractApiError);
    expect(() => parseStatus({ status: 42, failure_message_key: null })).toThrowError(ContractApiError);
    expect(() => parseStatus({ status: 'READY' })).toThrowError(ContractApiError);
  });

  it('accepts a well-formed contract with clauses', () => {
    const parsed = parseContract({
      id: 'c1',
      status: 'READY',
      global_risk_score: 50,
      clauses: [
        {
          id: 'cl1',
          original_text: 'text',
          risk_level: 'high',
          plain_explanation: 'plain',
          confidence: 0.9,
          why_risky: 'why',
          legal_basis: [{ reference: 'Art. 1', summary: 'sum' }],
          suggested_change: null,
        },
      ],
    });
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.global_risk_score).toBe(50);
  });

  it('rejects contracts with out-of-range scores or invalid clauses', () => {
    const base = {
      id: 'c1',
      status: 'READY',
      global_risk_score: 50,
      clauses: [],
    };
    expect(() => parseContract({ ...base, global_risk_score: 101 })).toThrowError(ContractApiError);
    expect(() => parseContract({ ...base, global_risk_score: -1 })).toThrowError(ContractApiError);
    expect(() => parseContract({ ...base, id: '' })).toThrowError(ContractApiError);
    const badClause = {
      id: 'cl1',
      original_text: 'text',
      risk_level: 'critical',
      plain_explanation: 'plain',
      confidence: 0.5,
      why_risky: null,
      legal_basis: [],
      suggested_change: null,
    };
    expect(() => parseContract({ ...base, clauses: [badClause] })).toThrowError(ContractApiError);
    const badConfidence = { ...badClause, risk_level: 'low', confidence: 2 };
    expect(() => parseContract({ ...base, clauses: [badConfidence] })).toThrowError(ContractApiError);
    const badBasis = {
      ...badClause,
      risk_level: 'low',
      confidence: 0.5,
      legal_basis: [{ reference: 'Art. 1' }],
    };
    expect(() => parseContract({ ...base, clauses: [badBasis] })).toThrowError(ContractApiError);
  });

  it('accepts valid summaries and rejects bad dates or scores', () => {
    const summary = {
      id: 'c1',
      title: 'Lease',
      file_name: 'lease.pdf',
      status: 'READY',
      global_risk_score: 44,
      uploaded_at: '2026-10-13T12:00:00.000Z',
    };
    expect(parseContractSummary(summary).title).toBe('Lease');
    expect(() => parseContractSummary({ ...summary, uploaded_at: 'not-a-date' })).toThrowError(ContractApiError);
    expect(() => parseContractSummary({ ...summary, global_risk_score: 101 })).toThrowError(ContractApiError);
  });

  it('accepts valid letters and rejects missing content', () => {
    const letter = {
      id: 'l1',
      contract_id: 'c1',
      locale: 'es',
      content: 'Estimado...',
      created_at: '2026-10-13T12:00:00.000Z',
    };
    expect(parseObjectionLetter(letter).contract_id).toBe('c1');
    expect(() => parseObjectionLetter({ ...letter, content: 42 })).toThrowError(ContractApiError);
    expect(() => parseObjectionLetter({})).toThrowError(ContractApiError);
  });

  it('extracts message_key or falls back to the generic key', () => {
    expect(getErrorKey({ message_key: 'errors.foo' })).toBe('errors.foo');
    expect(getErrorKey({})).toBe('errors.api_error');
    expect(getErrorKey(null)).toBe('errors.api_error');
  });

  it('recognizes only low/medium/high risk levels', () => {
    expect(isRiskLevel('low')).toBe(true);
    expect(isRiskLevel('medium')).toBe(true);
    expect(isRiskLevel('high')).toBe(true);
    expect(isRiskLevel('critical')).toBe(false);
    expect(isRiskLevel(undefined)).toBe(false);
  });
});
