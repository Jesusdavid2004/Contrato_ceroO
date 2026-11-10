import { describe, it, expect } from 'vitest';
import { PostgresLegalContextProvider } from '../src/infrastructure/services/PostgresLegalContextProvider';
import { LegalProvision } from '../src/domain/entities/LegalProvision';

function provision(id: string, tema: string): LegalProvision {
  return new LegalProvision({
    id,
    jurisdiction: 'CO',
    sourceName: 'Fuente oficial',
    sourceUrl: 'https://example.gov.co/norma',
    reference: `Ley, artículo ${id}`,
    text: 'Texto verificado.',
    tema,
    vigenciaDesde: '2003-07-10',
    fuenteVerificadaEn: '2026-11-03',
  });
}

function harness() {
  const embedded: string[] = [];
  const provider = new PostgresLegalContextProvider(
    {
      findTopRelevant: async () => [provision('arr-1', 'arriendo'), provision('con-1', 'consumo')],
      saveMany: async () => undefined,
      countByJurisdiction: async () => 2,
    },
    {
      embed: async (text) => {
        embedded.push(text);
        return [0.1, 0.2];
      },
    },
  );
  return { provider, embedded };
}

describe('Legal scope filter', () => {
  it('LEASE solo cita arriendo aunque consumo se parezca', async () => {
    const { provider } = harness();
    const result = await provider.retrieve(
      'CO',
      [{ id: 'c1', text: 'El canon sube.' }],
      { contractType: 'LEASE' },
    );
    expect(result.map((item) => item.tema)).toEqual(['arriendo']);
    expect(result.every((item) => item.sourceUrl === 'https://example.gov.co/norma')).toBe(true);
  });

  it('sin mapa curado no recupera ni calcula embeddings', async () => {
    const { provider, embedded } = harness();
    const result = await provider.retrieve(
      'CO',
      [{ id: 'c1', text: 'El salario se paga.' }],
      { contractType: 'EMPLOYMENT' },
    );
    expect(result).toEqual([]);
    expect(embedded).toEqual([]);
  });

  it('sin scope conserva el comportamiento anterior', async () => {
    const { provider } = harness();
    const result = await provider.retrieve('CO', [{ id: 'c1', text: 'Texto.' }]);
    expect(result.map((item) => item.tema).sort()).toEqual(['arriendo', 'consumo']);
  });
});
