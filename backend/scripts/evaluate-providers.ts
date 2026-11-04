import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { LocalAIProvider } from '../src/infrastructure/ai/LocalAIProvider';
import { GeminiAIProvider } from '../src/infrastructure/ai/GeminiAIProvider';
import { HuggingFaceLocalEmbeddingProvider } from '../src/infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import { loadLegalCorpus, type LoadedCorpusItem } from '../src/infrastructure/legal/corpusLoader';
import type { AIProvider } from '../src/domain/services/AIProvider';
import type { LegalContextProvision } from '../src/domain/services/LegalContextProvider';
import { config } from '../src/shared/config';

interface EvaluationClause {
  id: string;
  text: string;
  expectedHighRisk: boolean;
  expectedReferences?: string[];
}

interface EvaluationContract {
  id: string;
  contractType: 'LEASE' | 'SERVICE' | 'EMPLOYMENT' | 'OTHER';
  jurisdiction: string;
  locale: string;
  clauses: EvaluationClause[];
}

interface ProviderResult {
  name: string;
  status: 'measured' | 'skipped' | 'error';
  detail?: string;
  total?: number;
  truePositive?: number;
  falsePositive?: number;
  falseNegative?: number;
  trueNegative?: number;
  precision?: number;
  recall?: number;
  citationPrecision?: number;
  citationRecall?: number;
  expectedCitations?: number;
  matchedCitations?: number;
  predictedCitations?: number;
  hallucinatedCitations?: number;
  usage?: string;
}

const DATASET_PATH = resolve(__dirname, '../../../evaluation/contracts.json');
const REPORT_PATH = resolve(__dirname, '../../../docs/evaluation.md');
const CORPUS_DIR = resolve(process.cwd(), 'data/legal');

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeReference(value: string): string {
  return value.trim().toLowerCase();
}

function temaForContract(contractType: string): string | null {
  if (contractType === 'LEASE') return 'arriendo';
  if (contractType === 'SERVICE') return 'consumo';
  return null;
}

function buildLegalContext(
  contract: EvaluationContract,
  corpusByTema: Map<string, LoadedCorpusItem[]>,
): LegalContextProvision[] {
  const tema = temaForContract(contract.contractType);
  if (!tema) return [];
  const items = corpusByTema.get(tema) ?? [];
  const context: LegalContextProvision[] = [];
  for (const clause of contract.clauses) {
    for (const item of items) {
      context.push({
        clauseId: clause.id,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        reference: item.reference,
        text: item.text,
        tema: item.tema,
        fuenteVerificadaEn: item.fuenteVerificadaEn,
      });
    }
  }
  return context;
}

async function measure(
  name: string,
  provider: AIProvider,
  contracts: EvaluationContract[],
  corpusByTema: Map<string, LoadedCorpusItem[]>,
): Promise<ProviderResult> {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let predictedCitations = 0;
  let groundedCitations = 0;
  let expectedCitations = 0;
  let matchedCitations = 0;
  let hallucinatedCitations = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const contract of contracts) {
    const legalContext = buildLegalContext(contract, corpusByTema);
    const contextRefs = new Set(legalContext.map((p) => normalizeReference(p.reference)));
    const result = await provider.classifyClauses({
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      locale: contract.locale,
      clauses: contract.clauses.map(({ id, text }) => ({ id, text })),
      legalContext: legalContext.length > 0 ? legalContext : undefined,
    });
    inputTokens += result.usage.inputTokens;
    outputTokens += result.usage.outputTokens;
    const byId = new Map(result.clauses.map((clause) => [clause.clause_id, clause]));
    for (const clause of contract.clauses) {
      const predictedHighRisk = byId.get(clause.id)?.risk_level === 'high';
      if (predictedHighRisk && clause.expectedHighRisk) truePositive += 1;
      else if (predictedHighRisk) falsePositive += 1;
      else if (clause.expectedHighRisk) falseNegative += 1;
      else trueNegative += 1;

      const predicted = byId.get(clause.id)?.legal_basis ?? [];
      const predictedNorm = predicted.map((b) => normalizeReference(b.reference));
      const expectedNorm = (clause.expectedReferences ?? []).map(normalizeReference);
      predictedCitations += predictedNorm.length;
      for (const ref of predictedNorm) {
        if (contextRefs.has(ref)) groundedCitations += 1;
        else hallucinatedCitations += 1;
      }
      expectedCitations += expectedNorm.length;
      const predictedSet = new Set(predictedNorm);
      for (const ref of expectedNorm) {
        if (predictedSet.has(ref)) matchedCitations += 1;
      }
    }
  }
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  return {
    name,
    status: 'measured',
    total: truePositive + falsePositive + falseNegative + trueNegative,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: precisionDenominator ? truePositive / precisionDenominator : 0,
    recall: recallDenominator ? truePositive / recallDenominator : 0,
    citationPrecision: predictedCitations ? groundedCitations / predictedCitations : 1,
    citationRecall: expectedCitations ? matchedCitations / expectedCitations : 1,
    expectedCitations,
    matchedCitations,
    predictedCitations,
    hallucinatedCitations,
    usage: `inputTokens=${inputTokens} outputTokens=${outputTokens}`,
  };
}

async function safeMeasure(
  name: string,
  build: () => Promise<AIProvider>,
  contracts: EvaluationContract[],
  corpusByTema: Map<string, LoadedCorpusItem[]>,
): Promise<ProviderResult> {
  try {
    return await measure(name, await build(), contracts, corpusByTema);
  } catch (error) {
    return {
      name,
      status: 'error',
      detail: `provider failed during evaluation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main(): Promise<void> {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as { contracts: EvaluationContract[] };
  if (dataset.contracts.length < 8 || dataset.contracts.length > 10) {
    throw new Error('The evaluation dataset must contain between 8 and 10 contracts.');
  }

  const corpus = await loadLegalCorpus(CORPUS_DIR);
  const corpusByTema = new Map<string, LoadedCorpusItem[]>();
  for (const item of corpus) {
    const group = corpusByTema.get(item.tema) ?? [];
    group.push(item);
    corpusByTema.set(item.tema, group);
  }

  const results: ProviderResult[] = [];
  results.push(await safeMeasure('fake (deterministic regex double)', async () => new FakeAIProvider(), dataset.contracts, corpusByTema));

  try {
    await new HuggingFaceLocalEmbeddingProvider(
      resolve(process.cwd(), config.EMBEDDING_CACHE_DIR),
    ).embed('evaluation warm-up probe', 'query');
    results.push(await safeMeasure(
      'local (on-device multilingual-e5 prototypes)',
      async () => new LocalAIProvider(new HuggingFaceLocalEmbeddingProvider(
        resolve(process.cwd(), config.EMBEDDING_CACHE_DIR),
      )),
      dataset.contracts,
      corpusByTema,
    ));
  } catch (error) {
    results.push({
      name: 'local (on-device multilingual-e5 prototypes)',
      status: 'skipped',
      detail: `model unavailable offline: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (config.GEMINI_API_KEY) {
    results.push(await safeMeasure(
      'gemini (hosted Gemini, JSON mode + Zod)',
      async () => new GeminiAIProvider({
        apiKey: config.GEMINI_API_KEY as string,
        fastModel: config.GEMINI_MODEL_FAST,
        smartModel: config.GEMINI_MODEL_SMART,
        maxTokens: config.AI_MAX_TOKENS_CLASSIFICATION,
        timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
      }),
      dataset.contracts,
      corpusByTema,
    ));
  } else {
    results.push({
      name: 'gemini (hosted Gemini, JSON mode + Zod)',
      status: 'skipped',
      detail: 'GEMINI_API_KEY is not set; no external call was made.',
    });
  }

  const rows = results
    .map((r) => (r.status === 'measured'
      ? `| ${r.name} | ${r.total} | ${r.truePositive} | ${r.falsePositive} | ${r.falseNegative} | ${r.trueNegative} | ${pct(r.precision ?? 0)} | ${pct(r.recall ?? 0)} | ${r.usage} |`
      : `| ${r.name} | ${r.status} | ${r.detail} |`))
    .join('\n');

  const citationRows = results
    .map((r) => (r.status === 'measured'
      ? `| ${r.name} | ${r.predictedCitations} | ${r.expectedCitations} | ${r.matchedCitations} | ${r.hallucinatedCitations} | ${pct(r.citationPrecision ?? 0)} | ${pct(r.citationRecall ?? 0)} |`
      : `| ${r.name} | ${r.status} | ${r.detail} |`))
    .join('\n');

  const report = [
    '# High-risk classification evaluation',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '**Dataset:** 9 hand-labeled contract scenarios (Spanish and English, lease/service/employment); binary expected labels are for HIGH risk only, plus `expectedReferences` per clause for the citation metric.',
    `**RAG:** enabled for this run via the versioned corpus in \`backend/data/legal\` (${corpus.length} provisions: arriendo=${corpusByTema.get('arriendo')?.length ?? 0}, consumo=${corpusByTema.get('consumo')?.length ?? 0}). LEASE clauses receive all arriendo provisions, SERVICE all consumo provisions, EMPLOYMENT none (no labor corpus yet).`,
    '',
    '| Provider | Clauses | TP | FP | FN | TN | HIGH precision | HIGH recall | Usage |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|',
    rows,
    '',
    '## Citation metric (grounded vs expected)',
    '',
    'Citation precision = cited references found verbatim in the supplied legal context / all cited references (anti-hallucination). Citation recall = expected references cited / all expected references in `evaluation/contracts.json`. Empty citation sets score precision 1 (nothing invented) and recall 0 when citations were expected.',
    '',
    '| Provider | Predicted | Expected | Matched | Hallucinated | Citation precision | Citation recall |',
    '|---|---:|---:|---:|---:|---:|---:|',
    citationRows,
    '',
    '## Interpretation and limitations',
    '',
    'Labels are illustrative judgments for a classroom demo, not legal review: an abusive paraphrase without the regex keywords counts as HIGH, and a proportionate capped penalty counts as LOW. The deterministic fake double is a Spanish-keyword baseline that never cites, so its citation recall is 0 by design. The local neural provider uses a general-purpose multilingual embedding model, not a legal-tuned classifier, and also returns no citations without RAG wiring. The hosted provider is only measured when a key is configured, and its numbers still depend on prompts, temperature defaults, and this tiny fixture set — never treat them as production quality or legal correctness.',
    '',
    'Run `npm run evaluate` from `backend/` to regenerate this report. Expand the reviewed fixture set with qualified legal-domain reviewers before using these metrics to make product or legal decisions.',
    '',
  ].join('\n');

  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(report);
}

main().catch((error: unknown) => {
  console.error('Provider evaluation failed:', error);
  process.exitCode = 1;
});
