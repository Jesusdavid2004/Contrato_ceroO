import { describe, it, expect } from 'vitest';
import { RegexClauseSegmenter } from '../src/infrastructure/services/RegexClauseSegmenter';

describe('RegexClauseSegmenter Unit Tests', () => {
  const segmenter = new RegexClauseSegmenter();

  it('segments contract with CLAUSULA PRIMERA, CLAUSULA SEGUNDA format', async () => {
    const contractText = `
CONTRATO DE ARRENDAMIENTO

CLAUSULA PRIMERA: OBJETO DEL CONTRATO. El arrendador entrega al arrendatario el inmueble ubicado en la calle 10.
CLAUSULA SEGUNDA: CANON DE ARRENDAMIENTO. El arrendatario pagara la suma de dos millones de pesos mensuales dentro de los primeros 5 dias.
CLAUSULA TERCERA: TERMINACION UNILATERAL. El arrendador podra dar por terminado el contrato en cualquier momento sin justa causa.
    `.trim();

    const result = await segmenter.segment(contractText);
    expect(result).toHaveLength(3);
    expect(result[0].orderIndex).toBe(1);
    expect(result[0].text).toContain('CLAUSULA PRIMERA: OBJETO DEL CONTRATO');
    expect(result[1].orderIndex).toBe(2);
    expect(result[1].text).toContain('CLAUSULA SEGUNDA: CANON DE ARRENDAMIENTO');
    expect(result[2].orderIndex).toBe(3);
    expect(result[2].text).toContain('CLAUSULA TERCERA: TERMINACION UNILATERAL');
  });

  it('segments contract with Clause 1, Clause 2 format', async () => {
    const contractText = `
SERVICES AGREEMENT

Clause 1: Scope of Work. The Provider agrees to perform software development services.
Clause 2: Compensation. The Client agrees to pay invoices within 30 days.
Clause 3: Confidentiality. Both parties shall maintain strict secrecy of proprietary data.
    `.trim();

    const result = await segmenter.segment(contractText);
    expect(result).toHaveLength(3);
    expect(result[0].text).toContain('Clause 1: Scope of Work');
    expect(result[1].text).toContain('Clause 2: Compensation');
    expect(result[2].text).toContain('Clause 3: Confidentiality');
  });

  it('segments contract with numbered format 1. 2. 3.', async () => {
    const contractText = `
1. The tenant agrees to pay utility expenses directly.
2. The deposit is non-refundable under any circumstance.
3. Jurisdiction shall be exclusively determined by the owner.
    `.trim();

    const result = await segmenter.segment(contractText);
    expect(result).toHaveLength(3);
    expect(result[0].text).toContain('1. The tenant agrees');
    expect(result[1].text).toContain('2. The deposit is non-refundable');
    expect(result[2].text).toContain('3. Jurisdiction shall be');
  });

  it('segments contract with ARTICULO 1, ARTICULO 2 format', async () => {
    const contractText = `
ARTICULO 1: DEFINICIONES. Se establecen los terminos del presente acuerdo laboral.
ARTICULO 2: JORNADA LABORAL. El trabajador prestara sus servicios en jornada ordinaria.
ARTICULO 3: DEDUCCIONES. La empresa podra descontar cualquier valor del salario sin autorizacion.
    `.trim();

    const result = await segmenter.segment(contractText);
    expect(result).toHaveLength(3);
    expect(result[0].text).toContain('ARTICULO 1: DEFINICIONES');
    expect(result[1].text).toContain('ARTICULO 2: JORNADA LABORAL');
    expect(result[2].text).toContain('ARTICULO 3: DEDUCCIONES');
  });

  it('falls back to paragraph splitting when no standard headings are found', async () => {
    const plainText = `
This is the first independent paragraph of a poorly formatted contract agreement.

This is the second distinct paragraph that contains unexpected penalty clauses and additional stipulations.

This is the third paragraph covering indemnification and waiver of rights.
    `.trim();

    const result = await segmenter.segment(plainText);
    expect(result).toHaveLength(3);
    expect(result[0].text).toContain('This is the first independent paragraph');
    expect(result[1].text).toContain('This is the second distinct paragraph');
    expect(result[2].text).toContain('This is the third paragraph covering indemnification');
  });

  it('returns empty array on empty or whitespace string', async () => {
    const result = await segmenter.segment('   ');
    expect(result).toEqual([]);
  });
});
