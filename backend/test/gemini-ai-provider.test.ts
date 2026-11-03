import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAIProvider } from '../src/infrastructure/ai/GeminiAIProvider';

const OPTIONS = {
  apiKey: 'test-key',
  fastModel: 'gemini-test-fast',
  smartModel: 'gemini-test-smart',
  maxTokens: 1000,
  timeoutMs: 5000,
};

function geminiResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
  };
}

describe('GeminiAIProvider (hosted smart tier)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies clauses and drops hallucinated citations', async () => {
    const fetchMock = vi.fn(async () => geminiResponse(JSON.stringify({
      clauses: [{
        clause_id: 'c1',
        risk_level: 'high',
        confidence: 0.9,
        plain_explanation: 'Unfair.',
        why_risky: 'One-sided.',
        legal_basis: [
          { reference: 'Ley 820 de 2003, Art. 20', summary: 'Cap respected.' },
          { reference: 'Ley INVENTADA Art. 9999', summary: 'Bogus.' },
        ],
        suggested_change: 'Negotiate.',
      }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiAIProvider(OPTIONS);
    const result = await provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [{ id: 'c1', text: 'El canon subirá sin límite cada año.' }],
      legalContext: [{
        clauseId: 'c1',
        sourceName: 'Ley 820 de 2003',
        sourceUrl: 'https://example.test/ley',
        reference: 'Ley 820 de 2003, Art. 20',
        text: 'Cap.',
      }],
    });
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0].risk_level).toBe('high');
    expect(result.clauses[0].legal_basis).toEqual([
      { reference: 'Ley 820 de 2003, Art. 20', summary: 'Cap respected.' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('gemini-test-fast');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('retries once on invalid JSON then throws', async () => {
    const fetchMock = vi.fn(async () => geminiResponse('not-json{{{'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiAIProvider(OPTIONS);
    await expect(provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [{ id: 'c1', text: 'texto' }],
    })).rejects.toMatchObject({ message: 'The AI provider returned an invalid or malformed response.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('generates letters with all locale placeholders', async () => {
    const fetchMock = vi.fn(async () => geminiResponse(
      '[SU NOMBRE]\n[FECHA]\n\n[DESTINATARIO]\nReferencia: [REFERENCIA DEL CONTRATO]\n\nTexto breve de objeción.',
    ));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiAIProvider(OPTIONS);
    const letter = await provider.generateObjectionLetter({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      flaggedClauses: [{
        id: 'c1', text: 't', riskLevel: 'high', plainExplanation: 'p',
        whyRisky: null, legalBasis: [], suggestedChange: null,
      }],
    });
    expect(letter).toContain('[SU NOMBRE]');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('gemini-test-smart');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });
});
