import { describe, expect, it, vi } from 'vitest';
import { TieredAIProvider } from '../src/infrastructure/ai/TieredAIProvider';
import type { AIProvider } from '../src/domain/services/AIProvider';

function stubProvider(name: string) {
  return {
    classifyClauses: vi.fn(async () => ({
      clauses: [],
      usage: { model: name, inputTokens: 0, outputTokens: 0 },
    })),
    generateObjectionLetter: vi.fn(async () => `${name}-letter`),
  } as unknown as AIProvider;
}

const REQUEST = {
  contractType: 'LEASE',
  jurisdiction: 'CO',
  locale: 'es',
  clauses: [{ id: 'c1', text: 'texto' }],
};

describe('TieredAIProvider (local + hosted working together)', () => {
  it('routes fast classification to the local provider', async () => {
    const fast = stubProvider('local');
    const smart = stubProvider('hosted');
    const provider = new TieredAIProvider(fast, smart);
    await provider.classifyClauses(REQUEST, 'fast');
    expect(fast.classifyClauses).toHaveBeenCalledOnce();
    expect(smart.classifyClauses).not.toHaveBeenCalled();
  });

  it('routes smart rechecks and letters to the hosted provider', async () => {
    const fast = stubProvider('local');
    const smart = stubProvider('hosted');
    const provider = new TieredAIProvider(fast, smart);
    await provider.classifyClauses(REQUEST, 'smart');
    expect(smart.classifyClauses).toHaveBeenCalledOnce();
    expect(fast.classifyClauses).not.toHaveBeenCalled();
    await expect(provider.generateObjectionLetter({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      flaggedClauses: [{
        id: 'c1', text: 't', riskLevel: 'high', plainExplanation: 'p',
        whyRisky: null, legalBasis: [], suggestedChange: null,
      }],
    })).resolves.toBe('hosted-letter');
  });
});
