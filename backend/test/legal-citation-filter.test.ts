import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicAIProvider } from '../src/infrastructure/ai/AnthropicAIProvider';

/**
 * Phase B2: the classifier may only cite provisions that were actually
 * retrieved for the clause. Hallucinated references are filtered out and
 * never reach the user, even when the model returns them.
 */
describe('legal citation filtering (no hallucinated provisions)', () => {
  function stubClient() {
    return {
      messages: {
        create: async () => ({
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'classify_contract_clauses',
              input: {
                clauses: [
                  {
                    clause_id: 'c1',
                    risk_level: 'high',
                    confidence: 0.9,
                    plain_explanation: 'Unfair term.',
                    why_risky: 'One-sided.',
                    legal_basis: [
                      { reference: 'Ley 820 de 2003, Art. 20', summary: 'Cap respected.' },
                      { reference: 'Ley INVENTADA Art. 9999', summary: 'Bogus citation.' },
                    ],
                    suggested_change: 'Negotiate.',
                  },
                ],
              },
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    } as unknown as Anthropic;
  }

  it('drops citations absent from the retrieved context', async () => {
    const provider = new AnthropicAIProvider(stubClient(), {
      fastModel: 'stub',
      smartModel: 'stub',
      maxTokens: 100,
      timeoutMs: 1000,
    });
    const result = await provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [{ id: 'c1', text: 'El canon subirá sin límite cada año.' }],
      legalContext: [
        {
          clauseId: 'c1',
          sourceName: 'Ley 820 de 2003',
          sourceUrl: 'https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html',
          reference: 'Ley 820 de 2003, Art. 20',
          text: 'Cap.',
        },
      ],
    });
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0].legal_basis).toEqual([
      { reference: 'Ley 820 de 2003, Art. 20', summary: 'Cap respected.' },
    ]);
  });

  it('keeps an empty legal basis when nothing retrieved matches', async () => {
    const provider = new AnthropicAIProvider(stubClient(), {
      fastModel: 'stub',
      smartModel: 'stub',
      maxTokens: 100,
      timeoutMs: 1000,
    });
    const result = await provider.classifyClauses({
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [{ id: 'c1', text: 'Cláusula simple.' }],
      legalContext: [],
    });
    expect(result.clauses[0].legal_basis).toEqual([]);
  });
});
