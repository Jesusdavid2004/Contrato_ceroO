import { describe, expect, it } from 'vitest';
import { LocalAIProvider } from '../src/infrastructure/ai/LocalAIProvider';
import type { TextEmbeddingProvider } from '../src/domain/services/TextEmbeddingProvider';
import { NoFlaggedClausesError } from '../src/domain/exceptions/index';

// Deterministic stub: clauses and prototypes sharing keywords land on the
// same basis vector, so cosine similarity is 1 for the match and 0 otherwise.
class KeywordEmbedder implements TextEmbeddingProvider {
  public calls: Array<{ text: string; purpose: string }> = [];

  public async embed(text: string, purpose: 'query' | 'document'): Promise<number[]> {
    this.calls.push({ text, purpose });
    const lower = text.toLowerCase();
    if (
      lower.includes('unilateral') || lower.includes('waives') || lower.includes('árbitro')
      || lower.includes('arbitr')
    ) {
      return [1, 0, 0];
    }
    if (
      lower.includes('reajustar') || lower.includes('enter the leased') || lower.includes('moratorio')
    ) {
      return [0, 1, 0];
    }
    return [0, 0, 1];
  }
}

function requestFor(texts: string[], locale = 'es') {
  return {
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale,
    clauses: texts.map((text, i) => ({ id: `c${i}`, text })),
  };
}

describe('LocalAIProvider (offline neural, no external API)', () => {
  it('classifies an abusive clause as high risk via embedding similarity', async () => {
    const provider = new LocalAIProvider(new KeywordEmbedder());
    const result = await provider.classifyClauses(
      requestFor(['El arrendador podrá terminar unilateralmente sin previo aviso.']),
    );
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0].risk_level).toBe('high');
    expect(result.clauses[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.usage.model.startsWith('local:')).toBe(true);
  });

  it('classifies a balanced clause as low risk', async () => {
    const provider = new LocalAIProvider(new KeywordEmbedder());
    const result = await provider.classifyClauses(
      requestFor(['Ambas partes acuerdan un plazo de doce meses por mutuo acuerdo.'], 'en'),
    );
    expect(result.clauses[0].risk_level).toBe('low');
  });

  it('embeds clauses as queries and prototypes as documents', async () => {
    const embedder = new KeywordEmbedder();
    const provider = new LocalAIProvider(embedder);
    await provider.classifyClauses(requestFor(['Un texto cualquiera.']));
    expect(embedder.calls.some((c) => c.purpose === 'query')).toBe(true);
    expect(embedder.calls.some((c) => c.purpose === 'document')).toBe(true);
  });

  it('composes a letter with placeholders and throws when nothing is flagged', async () => {
    const provider = new LocalAIProvider(new KeywordEmbedder());
    const letter = await provider.generateObjectionLetter({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      flaggedClauses: [
        {
          id: 'c0',
          text: 'Cláusula abusiva de ejemplo.',
          riskLevel: 'high',
          plainExplanation: 'x',
          whyRisky: 'y',
          legalBasis: [],
          suggestedChange: 'z',
        },
      ],
    });
    expect(letter).toContain('[SU NOMBRE]');
    expect(letter).toContain('Cláusula abusiva de ejemplo.');
    await expect(
      provider.generateObjectionLetter({
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
        flaggedClauses: [],
      }),
    ).rejects.toBeInstanceOf(NoFlaggedClausesError);
  });
});
