import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  AIClauseSegmenter,
  SegmentedClause,
} from '../src/domain/services/InfrastructureInterfaces';
import { SegmentClausesUseCase } from '../src/application/use-cases/SegmentClausesUseCase';
import { AdaptiveClauseSegmenter } from '../src/infrastructure/services/AdaptiveClauseSegmenter';
import { RegexClauseSegmenter } from '../src/infrastructure/services/RegexClauseSegmenter';

class RecordingAIClauseSegmenter implements AIClauseSegmenter {
  public calls = 0;
  public result: SegmentedClause[] = [];

  public async segment(): Promise<SegmentedClause[]> {
    this.calls += 1;
    return this.result;
  }
}

async function readFixture(name: string): Promise<string> {
  return readFile(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('contract clause segmentation fixtures', () => {
  it.each([
    ['lease-contract-es.txt', 'CLAUSULA PRIMERA', 'CLAUSULA TERCERA'],
    ['service-contract-en.txt', 'Clause 1:', 'Clause 3:'],
    ['numbered-contract-en.txt', '1.1 Payment', '1.3 Termination'],
  ])('segments %s verbatim and preserves clause order', async (fixture, first, last) => {
    const text = await readFixture(fixture);
    const aiSegmenter = new RecordingAIClauseSegmenter();
    const segmenter = new AdaptiveClauseSegmenter(new RegexClauseSegmenter(), aiSegmenter);
    const useCase = new SegmentClausesUseCase(segmenter);

    const clauses = await useCase.execute({ contractText: text });

    expect(clauses).toHaveLength(3);
    expect(clauses[0].text).toContain(first);
    expect(clauses[2].text).toContain(last);
    expect(clauses.map((clause) => clause.orderIndex)).toEqual([1, 2, 3]);
    expect(clauses.every((clause) => text.includes(clause.text))).toBe(true);
    expect(text.indexOf(clauses[0].text)).toBeLessThan(text.indexOf(clauses[1].text));
    expect(text.indexOf(clauses[1].text)).toBeLessThan(text.indexOf(clauses[2].text));
    expect(aiSegmenter.calls).toBe(0);
  });

  it('uses AI-assisted segmentation when fewer than three headings are found', async () => {
    const text = await readFixture('sparse-contract-es.txt');
    const expectedClauses = [
      'El proveedor prestara los servicios descritos en el anexo.',
      'El cliente pagara las facturas aprobadas dentro del plazo acordado.',
      'La terminacion requerira aviso escrito de cualquiera de las partes.',
    ];
    const aiSegmenter = new RecordingAIClauseSegmenter();
    aiSegmenter.result = expectedClauses.map((clauseText, index) => ({
      orderIndex: index + 1,
      text: clauseText,
    }));
    const segmenter = new AdaptiveClauseSegmenter(new RegexClauseSegmenter(), aiSegmenter);

    const clauses = await segmenter.segment(text);

    expect(clauses.map((clause) => clause.text)).toEqual(expectedClauses);
    expect(aiSegmenter.calls).toBe(1);
  });

  it('keeps the existing paragraph fallback in the regex-only segmenter', async () => {
    const text = await readFixture('sparse-contract-es.txt');
    const clauses = await new RegexClauseSegmenter().segment(text);

    expect(clauses).toHaveLength(4);
    expect(clauses.some((clause) => clause.text.includes('El proveedor prestara'))).toBe(true);
  });
});
