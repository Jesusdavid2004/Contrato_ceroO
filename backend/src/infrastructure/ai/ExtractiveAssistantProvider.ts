import type {
  AssistantProvider,
  AssistantReply,
  AssistantRequest,
  AssistantTokenListener,
} from '../../domain/services/AssistantProvider';
import type { AssistantSource } from '../../domain/services/AssistantContext';
import { tokenize } from '../../domain/services/AssistantContext';

/**
 * Offline assistant used when no hosted model is configured (and in demos).
 *
 * It never generates free text: it selects the sources that best match the
 * question and quotes them with their [S#] markers, so the answer is always
 * traceable. When nothing matches it says so instead of guessing.
 */

export const EXTRACTIVE_MODEL_NAME = 'extractive-v1';
const MIN_OVERLAP = 1;
const MAX_QUOTED_SOURCES = 3;
const MAX_QUOTE_LENGTH = 260;

const COPY = {
  en: {
    lead: 'Here is what your analysis says about this:',
    none: 'I could not find that in your contract analysis. Try asking about a specific clause, amount or date.',
  },
  es: {
    lead: 'Esto es lo que dice tu análisis sobre el tema:',
    none: 'No encontré eso en el análisis de tu contrato. Prueba preguntando por una cláusula, un valor o una fecha concretos.',
  },
} as const;

function copyFor(locale: string): (typeof COPY)[keyof typeof COPY] {
  return locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
}

function relevance(question: Set<string>, source: AssistantSource): number {
  let score = 0;
  for (const token of tokenize(`${source.label} ${source.text}`)) {
    if (question.has(token)) score += 1;
  }
  return score;
}

function quote(source: AssistantSource): string {
  const flat = source.text.replace(/\s+/g, ' ').trim();
  const clipped = flat.length <= MAX_QUOTE_LENGTH ? flat : `${flat.slice(0, MAX_QUOTE_LENGTH)}...`;
  return `- ${clipped} [${source.id}]`;
}

export class ExtractiveAssistantProvider implements AssistantProvider {
  public async reply(
    request: AssistantRequest,
    onToken?: AssistantTokenListener,
  ): Promise<AssistantReply> {
    const copy = copyFor(request.locale);
    const question = tokenize(request.question);
    const matches = request.sources
      .map((source) => ({ source, score: relevance(question, source) }))
      .filter((entry) => entry.score >= MIN_OVERLAP)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_QUOTED_SOURCES);

    const text = matches.length === 0
      ? copy.none
      : [copy.lead, ...matches.map((entry) => quote(entry.source))].join('\n');
    onToken?.(text);
    return { text, usage: { model: EXTRACTIVE_MODEL_NAME, inputTokens: 0, outputTokens: 0 } };
  }
}
