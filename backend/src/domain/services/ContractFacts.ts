/**
 * Datos clave del contrato (partes, valores, fechas, terminacion).
 * Heuristicas deterministicas por reglas sobre el texto extraido, no IA:
 * cada dato conserva evidencia (clausula + cita) y estado
 * found | not_found | unconfirmed. Nada se deduce sin regla visible.
 */

export type FactKey =
  | 'party_a'
  | 'party_b'
  | 'amount'
  | 'currency'
  | 'periodicity'
  | 'duration'
  | 'start_date'
  | 'end_date'
  | 'termination';

export type ExtractedFactStatus = 'found' | 'not_found' | 'unconfirmed';

export interface FactEvidenceClause {
  id: string;
  startOffset: number | null;
  endOffset: number | null;
}

export interface ExtractedFact {
  key: FactKey;
  value: string | null;
  status: ExtractedFactStatus;
  evidenceClauseId: string | null;
  evidenceQuote: string | null;
}

export interface FactsExtractionInput {
  fullText: string;
  clauses: FactEvidenceClause[];
}

const MAX_QUOTE_LENGTH = 200;

function clauseForOffset(
  clauses: FactEvidenceClause[],
  index: number,
): FactEvidenceClause | null {
  const found = clauses.find((clause) => {
    if (clause.startOffset === null || clause.startOffset === undefined) return false;
    const end = clause.endOffset ?? Number.POSITIVE_INFINITY;
    return clause.startOffset <= index && index < end;
  });
  return found ?? null;
}

function quote(text: string): string {
  return text.length > MAX_QUOTE_LENGTH ? `${text.slice(0, MAX_QUOTE_LENGTH)}…` : text;
}

function notFound(key: FactKey): ExtractedFact {
  return { key, value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null };
}

const AMOUNT_PATTERN = /\$\s?([\d.,]+)\s?(COP|USD|EUR|MXN)?/i;
const PERIODICITY_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /mensual/i, value: 'monthly' },
  { pattern: /semanal/i, value: 'weekly' },
  { pattern: /anual/i, value: 'yearly' },
  { pattern: /\bmonthly\b/i, value: 'monthly' },
  { pattern: /\bweekly\b/i, value: 'weekly' },
  { pattern: /\bannual(?:ly)?\b/i, value: 'yearly' },
];
const DURATION_PATTERN = /(\d+)\s*(meses|a[ñn]os|months|years)/i;
const DATE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/,
  /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i,
];
const TERMINATION_PATTERN = /terminaci[óo]n|preaviso|notice period|dar por terminado/i;
const PARTIES_PATTERN = /entre\s+([^,;]+?)\s+y\s+([^,;.]+?)(?=[,.])/i;

function collectDates(text: string): string[] {
  const found: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
      if (match[0] && !found.includes(match[0])) found.push(match[0]);
    }
  }
  return found;
}

/** Extrae los 9 datos; ausentes quedan not_found, nunca inventados. */
export function extractContractFacts(input: FactsExtractionInput): ExtractedFact[] {
  const { fullText, clauses } = input;
  const facts: ExtractedFact[] = [];
  const locate = (index: number): { clauseId: string | null } => ({
    clauseId: clauseForOffset(clauses, index)?.id ?? null,
  });

  const amountMatch = AMOUNT_PATTERN.exec(fullText);
  if (amountMatch?.[1]) {
    const at = amountMatch.index;
    facts.push({
      key: 'amount',
      value: amountMatch[1],
      status: 'found',
      evidenceClauseId: locate(at).clauseId,
      evidenceQuote: quote(amountMatch[0]),
    });
    facts.push({
      key: 'currency',
      value: (amountMatch[2] ?? 'unspecified').toUpperCase(),
      status: 'found',
      evidenceClauseId: locate(at).clauseId,
      evidenceQuote: quote(amountMatch[0]),
    });
  } else {
    facts.push(notFound('amount'), notFound('currency'));
  }

  const periodicity = PERIODICITY_RULES.find((rule) => rule.pattern.test(fullText));
  if (periodicity) {
    const at = fullText.search(periodicity.pattern);
    facts.push({
      key: 'periodicity',
      value: periodicity.value,
      status: 'found',
      evidenceClauseId: locate(at).clauseId,
      evidenceQuote: quote(fullText.slice(at, at + 40)),
    });
  } else {
    facts.push(notFound('periodicity'));
  }

  const durationMatch = DURATION_PATTERN.exec(fullText);
  if (durationMatch) {
    facts.push({
      key: 'duration',
      value: durationMatch[0],
      status: 'found',
      evidenceClauseId: locate(durationMatch.index).clauseId,
      evidenceQuote: quote(durationMatch[0]),
    });
  } else {
    facts.push(notFound('duration'));
  }

  const dates = collectDates(fullText);
  if (dates[0]) {
    const at = fullText.indexOf(dates[0]);
    facts.push({
      key: 'start_date',
      value: dates[0],
      status: 'unconfirmed',
      evidenceClauseId: locate(at).clauseId,
      evidenceQuote: quote(dates[0]),
    });
  } else {
    facts.push(notFound('start_date'));
  }
  if (dates[1]) {
    const at = fullText.indexOf(dates[1]);
    facts.push({
      key: 'end_date',
      value: dates[1],
      status: 'unconfirmed',
      evidenceClauseId: locate(at).clauseId,
      evidenceQuote: quote(dates[1]),
    });
  } else {
    facts.push(notFound('end_date'));
  }

  const terminationAt = fullText.search(TERMINATION_PATTERN);
  if (terminationAt >= 0) {
    facts.push({
      key: 'termination',
      value: quote(fullText.slice(terminationAt, terminationAt + MAX_QUOTE_LENGTH)),
      status: 'unconfirmed',
      evidenceClauseId: locate(terminationAt).clauseId,
      evidenceQuote: quote(fullText.slice(terminationAt, terminationAt + 120)),
    });
  } else {
    facts.push(notFound('termination'));
  }

  const partiesMatch = PARTIES_PATTERN.exec(fullText);
  if (partiesMatch?.[1] && partiesMatch[2]) {
    const evidence = locate(partiesMatch.index);
    facts.push({
      key: 'party_a',
      value: partiesMatch[1].trim(),
      status: 'unconfirmed',
      evidenceClauseId: evidence.clauseId,
      evidenceQuote: quote(partiesMatch[0]),
    });
    facts.push({
      key: 'party_b',
      value: partiesMatch[2].trim(),
      status: 'unconfirmed',
      evidenceClauseId: evidence.clauseId,
      evidenceQuote: quote(partiesMatch[0]),
    });
  } else {
    facts.push(notFound('party_a'), notFound('party_b'));
  }

  return facts;
}
