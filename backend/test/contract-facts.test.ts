import { describe, it, expect } from 'vitest';
import { extractContractFacts } from '../src/domain/services/ContractFacts';

const TEXT = [
  'CONTRATO DE ARRENDAMIENTO entre Ana Prueba y Bruno Test, firmado el 12/01/2026.',
  'CLÁUSULA 1. El canon mensual es de $1.500.000 COP pagadero cada mes.',
  'CLÁUSULA 2. Duración de 12 meses hasta el 12/01/2027.',
  'CLÁUSULA 3. La terminación requiere preaviso de 30 dias.',
].join('\n');

const CLAUSES = [
  { id: 'c0', startOffset: 0, endOffset: 80 },
  { id: 'c1', startOffset: 81, endOffset: 160 },
  { id: 'c2', startOffset: 161, endOffset: 230 },
  { id: 'c3', startOffset: 231, endOffset: 320 },
];

function byKey(key: string) {
  const facts = extractContractFacts({ fullText: TEXT, clauses: CLAUSES });
  const found = facts.find((fact) => fact.key === key);
  if (!found) throw new Error(`missing fact ${key}`);
  return found;
}

describe('ContractFacts', () => {
  it('extrae valores con evidencia enlazada a la clausula', () => {
    const amount = byKey('amount');
    expect(amount.status).toBe('found');
    expect(amount.value).toBe('1.500.000');
    expect(amount.evidenceClauseId).toBe('c1');

    expect(byKey('currency')).toMatchObject({ status: 'found', value: 'COP' });
    expect(byKey('periodicity')).toMatchObject({ status: 'found', value: 'monthly' });
    expect(byKey('duration').value).toContain('12 meses');
  });

  it('marca fechas y partes como no confirmadas, nunca como hechos', () => {
    expect(byKey('start_date')).toMatchObject({ status: 'unconfirmed', value: '12/01/2026' });
    expect(byKey('end_date')).toMatchObject({ status: 'unconfirmed', value: '12/01/2027' });
    expect(byKey('party_a').status).toBe('unconfirmed');
    expect(byKey('termination').status).toBe('unconfirmed');
  });

  it('devuelve las 9 claves con not_found cuando no hay nada', () => {
    const facts = extractContractFacts({ fullText: 'Texto corto sin datos.', clauses: [] });
    expect(facts).toHaveLength(9);
    expect(facts.every((fact) => fact.status === 'not_found')).toBe(true);
    expect(facts.every((fact) => fact.value === null)).toBe(true);
  });
});
