import { describe, expect, it } from 'vitest';
import {
  buildObjectionLetterSystemPrompt,
  buildObjectionLetterUserPrompt,
} from '../src/infrastructure/ai/prompts/objectionLetterV1';

function baseRequest(legalBasis: Array<{ reference: string; summary: string; sourceUrl?: string }>) {
  return {
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    localeName: 'Spanish',
    flaggedClauses: [
      {
        id: 'clause-1',
        text: 'El canon subirá sin límite.',
        riskLevel: 'high',
        plainExplanation: 'Subida sin tope.',
        whyRisky: 'Ventaja injusta.',
        legalBasis,
        suggestedChange: 'Tope IPC.',
      },
    ],
  };
}

describe('Objection letter citation traceability', () => {
  it('keeps the citation traceable to its source URL when present', () => {
    const prompt = buildObjectionLetterUserPrompt(baseRequest([
      { reference: 'Ley 820 de 2003, Art. 20', summary: 'Tope IPC.', sourceUrl: 'https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html' },
    ]));
    expect(prompt).toContain('Ley 820 de 2003, Art. 20: Tope IPC. (fuente: https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html)');
  });

  it('omits the source marker when no URL was verified', () => {
    const prompt = buildObjectionLetterUserPrompt(baseRequest([
      { reference: 'Ley 820 de 2003, Art. 20', summary: 'Tope IPC.' },
    ]));
    expect(prompt).toContain('Ley 820 de 2003, Art. 20: Tope IPC.');
    expect(prompt).not.toContain('fuente:');
  });

  it('instructs the model to stay traceable and never invent laws', () => {
    expect(buildObjectionLetterSystemPrompt('Spanish')).toContain('keep the citation traceable to that source');
    expect(buildObjectionLetterSystemPrompt('Spanish')).toContain('Do not threaten, invent laws');
  });
});
