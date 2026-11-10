import type { Clause } from '../../domain/entities/Clause';
import type { StoredContractFact } from '../../domain/repositories/FactsRepository';

/**
 * Preguntas restringidas al contrato autorizado, sin modelo generativo:
 * recupera fragmentos y datos ya almacenados, cita evidencia verificable
 * y responde "no encontrado" sin ella. El contenido del contrato se trata
 * como datos inertes: jamas activa herramientas ni sale del contrato.
 */

export interface QuestionCitation {
  kind: 'clause' | 'fact';
  id: string;
  quote: string;
}

export interface ContractAnswer {
  found: boolean;
  answer: string;
  citations: QuestionCitation[];
  limits: string[];
}

const MAX_QUESTION_LENGTH = 500;
const MIN_OVERLAP = 2;

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-záéíóúñü0-9]+/i)
      .filter((token) => token.length > 2),
  );
}

function overlap(question: Set<string>, text: string): number {
  const words = tokens(text);
  let count = 0;
  for (const token of question) {
    if (words.has(token)) count += 1;
  }
  return count;
}

export function validateQuestion(question: unknown): string {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('Question must be a non-empty string.');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`Question must not exceed ${MAX_QUESTION_LENGTH} characters.`);
  }
  return question.trim();
}

export function answerContractQuestion(input: {
  question: string;
  locale: string;
  clauses: Clause[];
  facts: StoredContractFact[];
}): ContractAnswer {
  const limits = [
    'Answers quote only stored analysis data; no legal conclusions are generated.',
  ];
  const questionTokens = tokens(input.question);

  const factHits = input.facts
    .filter((fact) => fact.value && overlap(questionTokens, `${fact.key} ${fact.value}`) >= MIN_OVERLAP)
    .slice(0, 3);

  const clauseHits = input.clauses
    .map((clause) => ({ clause, score: overlap(questionTokens, `${clause.originalText} ${clause.plainExplanation}`) }))
    .filter((entry) => entry.score >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score || a.clause.orderIndex - b.clause.orderIndex)
    .slice(0, 3);

  if (factHits.length === 0 && clauseHits.length === 0) {
    return {
      found: false,
      answer: input.locale === 'en'
        ? 'Not found in this contract analysis.'
        : 'No encontrado en el análisis de este contrato.',
      citations: [],
      limits,
    };
  }

  const citations: QuestionCitation[] = [
    ...factHits.map((fact) => ({
      kind: 'fact' as const,
      id: fact.key,
      quote: fact.evidenceQuote ?? fact.value ?? '',
    })),
    ...clauseHits.map((entry) => ({
      kind: 'clause' as const,
      id: entry.clause.id,
      quote: entry.clause.originalText.slice(0, 200),
    })),
  ];
  const summary = input.locale === 'en'
    ? `Found ${citations.length} matching piece(s) in your analysis below.`
    : `Encontré ${citations.length} coincidencia(s) de tu análisis abajo.`;
  return { found: true, answer: summary, citations, limits };
}
