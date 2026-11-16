import type { Clause } from '../entities/Clause';
import type { AssistantSourceKind } from '../entities/AssistantMessage';
import type { StoredContractFact } from '../repositories/FactsRepository';
import type { LegalContextProvision } from './LegalContextProvider';

/**
 * Closed context pack for the assistant.
 *
 * Everything the model may say must come from these sources. Each one has a
 * stable short id (S1, S2, ...) the model cites inline; any citation that is
 * not in the pack is discarded by the use case, so the assistant cannot invent
 * a clause number or a law article.
 */

export interface AssistantSource {
  id: string;
  kind: AssistantSourceKind;
  label: string;
  text: string;
  sourceUrl?: string;
  verifiedAt?: string;
}

export interface LegalUpdateSummary {
  id: string;
  title: string;
  tema: string;
  sourceUrl: string;
  detectedAt: string;
}

export interface AssistantContextInput {
  question: string;
  clauses: readonly Clause[];
  facts: readonly StoredContractFact[];
  provisions: readonly LegalContextProvision[];
  updates: readonly LegalUpdateSummary[];
}

export const MAX_CLAUSE_SOURCES = 6;
export const MAX_PROVISION_SOURCES = 5;
export const MAX_UPDATE_SOURCES = 3;
export const MAX_SOURCE_TEXT_LENGTH = 700;
const MIN_TOKEN_LENGTH = 3;
const ISO_DATE_LENGTH = 10;
const DIACRITICS = /[̀-ͯ]/g;

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(DIACRITICS, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH),
  );
}

function overlapScore(question: Set<string>, text: string): number {
  let score = 0;
  for (const token of tokenize(text)) {
    if (question.has(token)) score += 1;
  }
  return score;
}

function clip(text: string): string {
  return text.length <= MAX_SOURCE_TEXT_LENGTH ? text : `${text.slice(0, MAX_SOURCE_TEXT_LENGTH)}...`;
}

const RISK_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function rankClauses(clauses: readonly Clause[], question: Set<string>): Clause[] {
  return [...clauses]
    .map((clause) => ({
      clause,
      score: overlapScore(question, `${clause.originalText} ${clause.plainExplanation}`),
    }))
    .sort((a, b) =>
      b.score - a.score
      || RISK_RANK[a.clause.riskLevel] - RISK_RANK[b.clause.riskLevel]
      || a.clause.orderIndex - b.clause.orderIndex)
    .slice(0, MAX_CLAUSE_SOURCES)
    .map((entry) => entry.clause);
}

function describeClause(clause: Clause): string {
  return clip(
    `[#${clause.orderIndex}] risk=${clause.riskLevel}. Original: ${clause.originalText}`
    + ` Plain: ${clause.plainExplanation}`
    + (clause.whyRisky ? ` Why risky: ${clause.whyRisky}` : '')
    + (clause.suggestedChange ? ` Suggested change: ${clause.suggestedChange}` : ''),
  );
}

export function buildAssistantContext(input: AssistantContextInput): AssistantSource[] {
  const question = tokenize(input.question);
  const drafts: Array<Omit<AssistantSource, 'id'>> = [];

  for (const clause of rankClauses(input.clauses, question)) {
    drafts.push({ kind: 'clause', label: `clause:${clause.id}`, text: describeClause(clause) });
  }
  for (const fact of input.facts) {
    if (!fact.value) continue;
    drafts.push({ kind: 'fact', label: `fact:${fact.key}`, text: `${fact.key} = ${fact.value} (${fact.status})` });
  }

  const rankedProvisions = [...input.provisions]
    .map((provision) => ({ provision, score: overlapScore(question, `${provision.reference} ${provision.text}`) }))
    .sort((a, b) => b.score - a.score);
  const seenReferences = new Set<string>();
  for (const { provision } of rankedProvisions) {
    if (seenReferences.size >= MAX_PROVISION_SOURCES) break;
    if (seenReferences.has(provision.reference)) continue;
    seenReferences.add(provision.reference);
    drafts.push({
      kind: 'legal',
      label: provision.reference,
      text: clip(provision.text),
      sourceUrl: provision.sourceUrl,
      verifiedAt: provision.fuenteVerificadaEn,
    });
  }
  for (const update of input.updates.slice(0, MAX_UPDATE_SOURCES)) {
    drafts.push({
      kind: 'update',
      label: update.title,
      text: `Recent legal update (${update.tema}) detected ${update.detectedAt}: ${update.title}`,
      sourceUrl: update.sourceUrl,
      verifiedAt: update.detectedAt.slice(0, ISO_DATE_LENGTH),
    });
  }

  return drafts.map((draft, index) => ({ ...draft, id: `S${index + 1}` }));
}

const CITATION_PATTERN = /\[(S\d+)\]/g;
const REPEATED_SPACES = / {2,}/g;

/** Source ids the model cited that actually exist in the pack, in first-seen order. */
export function extractValidCitations(reply: string, sources: readonly AssistantSource[]): string[] {
  const known = new Set(sources.map((source) => source.id));
  const cited: string[] = [];
  for (const match of reply.matchAll(CITATION_PATTERN)) {
    const id = match[1];
    if (known.has(id) && !cited.includes(id)) cited.push(id);
  }
  return cited;
}

/** Removes citation markers that point at unknown sources so the UI never shows a dangling [S9]. */
export function stripUnknownCitations(reply: string, sources: readonly AssistantSource[]): string {
  const known = new Set(sources.map((source) => source.id));
  return reply
    .replace(CITATION_PATTERN, (marker, id: string) => (known.has(id) ? marker : ''))
    .replace(REPEATED_SPACES, ' ')
    .trim();
}
