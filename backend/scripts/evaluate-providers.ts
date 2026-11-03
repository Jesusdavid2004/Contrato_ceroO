import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { LocalAIProvider } from '../src/infrastructure/ai/LocalAIProvider';
import { AnthropicAIProvider } from '../src/infrastructure/ai/AnthropicAIProvider';
import { GeminiAIProvider } from '../src/infrastructure/ai/GeminiAIProvider';
import { HuggingFaceLocalEmbeddingProvider } from '../src/infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import type { AIProvider } from '../src/domain/services/AIProvider';
import { config } from '../src/shared/config';

interface EvaluationClause {
  id: string;
  text: string;
  expectedHighRisk: boolean;
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
  status: 'measured' | 'skipped';
  detail?: string;
  total?: number;
  truePositive?: number;
  falsePositive?: number;
  falseNegative?: number;
  trueNegative?: number;
  precision?: number;
  recall?: number;
  usage?: string;
}

const DATASET_PATH = resolve(__dirname, '../../../evaluation/contracts.json');
const REPORT_PATH = resolve(__dirname, '../../../docs/evaluation.md');

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function measure(name: string, provider: AIProvider, contracts: EvaluationContract[]): Promise<ProviderResult> {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const contract of contracts) {
    const result = await provider.classifyClauses({
      contractType: contract.contractType,
      jurisdiction: contract.jurisdiction,
      locale: contract.locale,
      clauses: contract.clauses.map(({ id, text }) => ({ id, text })),
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
    usage: `inputTokens=${inputTokens} outputTokens=${outputTokens}`,
  };
}

async function buildLocal(): Promise<AIProvider> {
  const embedder = new HuggingFaceLocalEmbeddingProvider(
    resolve(process.cwd(), config.EMBEDDING_CACHE_DIR),
  );
  await embedder.embed('evaluation warm-up probe', 'query');
  return new LocalAIProvider(embedder);
}

async function main(): Promise<void> {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as { contracts: EvaluationContract[] };
  if (dataset.contracts.length < 8 || dataset.contracts.length > 10) {
    throw new Error('The evaluation dataset must contain between 8 and 10 contracts.');
  }

  const results: ProviderResult[] = [];
  results.push(await measure('fake (deterministic regex double)', new FakeAIProvider(), dataset.contracts));

  try {
    results.push(await measure('local (on-device multilingual-e5 prototypes)', await buildLocal(), dataset.contracts));
  } catch (error) {
    results.push({
      name: 'local (on-device multilingual-e5 prototypes)',
      status: 'skipped',
      detail: `model unavailable offline: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (config.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    results.push(await measure(
      'anthropic (hosted Claude, tool use + Zod)',
      new AnthropicAIProvider(client, {
        fastModel: config.AI_MODEL_FAST,
        smartModel: config.AI_MODEL_SMART,
        maxTokens: config.AI_MAX_TOKENS_CLASSIFICATION,
        timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
      }),
      dataset.contracts,
    ));
  } else {
    results.push({
      name: 'anthropic (hosted Claude, tool use + Zod)',
      status: 'skipped',
      detail: 'ANTHROPIC_API_KEY is not set; no external call was made.',
    });
  }

  if (config.GEMINI_API_KEY) {
    results.push(await measure(
      'gemini (hosted Gemini, JSON mode + Zod)',
      new GeminiAIProvider({
        apiKey: config.GEMINI_API_KEY,
        fastModel: config.GEMINI_MODEL_FAST,
        smartModel: config.GEMINI_MODEL_SMART,
        maxTokens: config.AI_MAX_TOKENS_CLASSIFICATION,
        timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
      }),
      dataset.contracts,
    ));
  } else {
    results.push({
      name: 'gemini (hosted Gemini, JSON mode + Zod)',
      status: 'skipped',
      detail: 'GEMINI_API_KEY is not set; no external call was made.',
    });
  }

  const rows = results
    .map((r) => (r.status === 'skipped'
      ? `| ${r.name} | skipped | ${r.detail} |`
      : `| ${r.name} | ${r.total} | ${r.truePositive} | ${r.falsePositive} | ${r.falseNegative} | ${r.trueNegative} | ${pct(r.precision ?? 0)} | ${pct(r.recall ?? 0)} | ${r.usage} |`))
    .join('\n');

  const report = [
    '# High-risk classification evaluation',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '**Dataset:** 9 hand-labeled contract scenarios (Spanish and English, lease/service/employment); binary expected labels are for HIGH risk only.',
    '**RAG:** disabled for this run, so `legal_basis` is empty across providers.',
    '',
    '| Provider | Clauses | TP | FP | FN | TN | HIGH precision | HIGH recall | Usage |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|',
    rows,
    '',
    '## Interpretation and limitations',
    '',
    'Labels are illustrative judgments for a classroom demo, not legal review: an abusive paraphrase without the regex keywords counts as HIGH, and a proportionate capped penalty counts as LOW. The deterministic fake double is a Spanish-keyword baseline, so English traps and paraphrases are its known blind spots. The local neural provider uses a general-purpose multilingual embedding model, not a legal-tuned classifier. The hosted provider is only measured when a key is configured, and its numbers still depend on prompts, temperature defaults, and this tiny fixture set — never treat them as production quality or legal correctness.',
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
