import { describe, it, expect } from 'vitest';
import { compareClauses, jaccardSimilarity, wordDiff } from '../src/domain/services/ClauseDiff';

function clause(id: string, orderIndex: number, text: string) {
  return { id, orderIndex, text };
}

describe('ClauseDiff', () => {
  it('mide similitud Jaccard determinista', () => {
    expect(jaccardSimilarity('el canon sube', 'el canon sube')).toBe(1);
    expect(jaccardSimilarity('el canon sube', 'firma en duplicado')).toBeLessThan(0.5);
    expect(jaccardSimilarity('', '')).toBe(1);
  });

  it('clasifica anadidos, eliminaciones y modificaciones', () => {
    const base = [
      clause('b1', 1, 'El canon mensual es de cien.'),
      clause('b2', 2, 'El deposito no se devuelve jamas.'),
      clause('b3', 3, 'Firma en dos ejemplares.'),
    ];
    const other = [
      clause('o1', 1, 'El canon mensual es de doscientos.'),
      clause('o3', 2, 'Firma en dos ejemplares.'),
      clause('o4', 3, 'El arrendador visita cada domingo.'),
    ];
    const result = compareClauses(base, other);
    expect(result.removed.map((c) => c.id)).toEqual(['b2']);
    expect(result.added.map((c) => c.id)).toEqual(['o4']);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].base.id).toBe('b1');
    expect(result.modified[0].other.id).toBe('o1');
    expect(result.unchanged).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('el diff de palabras marca lo anadido y eliminado', () => {
    const { segments, truncated } = wordDiff('el canon sube mucho', 'el canon baja mucho');
    expect(truncated).toBe(false);
    const kinds = segments.map((segment) => segment.type);
    expect(kinds).toContain('same');
    expect(kinds).toContain('add');
    expect(kinds).toContain('del');
    const rebuilt = segments.filter((s) => s.type !== 'add').map((s) => s.text).join('');
    expect(rebuilt).toBe('el canon sube mucho');
  });

  it('trunca pares gigantes sin inventar detalle', () => {
    const big = Array.from({ length: 3000 }, () => 'palabra').join(' ');
    const { segments, truncated } = wordDiff(big, `${big} extra`);
    expect(truncated).toBe(true);
    expect(segments).toEqual([]);
  });
});
