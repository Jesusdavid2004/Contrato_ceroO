import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';

interface EvaluationClause {
  id: string;
  text: string;
  expectedHighRisk: boolean;
}

interface EvaluationSample {
  id: string;
  contractType: 'LEASE' | 'SERVICE' | 'EMPLOYMENT' | 'OTHER';
  clauses: EvaluationClause[];
}

interface EvaluationCounts {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
}

const DATASET_PATH = resolve(__dirname, '../../evaluation/samples.json');
const REPORT_PATH = resolve(__dirname, '../../../docs/evaluation.md');

async function main(): Promise<void> {
  const samples = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as EvaluationSample[];
  if (samples.length < 5 || samples.length > 10) {
    throw new Error('The high-risk evaluation dataset must contain between 5 and 10 samples.');
  }

  const provider = new FakeAIProvider();
  const counts: EvaluationCounts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
  };

  for (const sample of samples) {
    const result = await provider.classifyClauses({
      contractType: sample.contractType,
      jurisdiction: 'CO',
      locale: 'es',
      clauses: sample.clauses.map(({ id, text }) => ({ id, text })),
    });
    const byId = new Map(result.clauses.map((clause) => [clause.clause_id, clause]));
    for (const clause of sample.clauses) {
      const predictedHighRisk = byId.get(clause.id)?.risk_level === 'high';
      if (predictedHighRisk && clause.expectedHighRisk) counts.truePositive += 1;
      else if (predictedHighRisk) counts.falsePositive += 1;
      else if (clause.expectedHighRisk) counts.falseNegative += 1;
      else counts.trueNegative += 1;
    }
  }

  const precisionDenominator = counts.truePositive + counts.falsePositive;
  const recallDenominator = counts.truePositive + counts.falseNegative;
  const precision = precisionDenominator ? counts.truePositive / precisionDenominator : 0;
  const recall = recallDenominator ? counts.truePositive / recallDenominator : 0;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const report = [
    '# High-risk classification evaluation',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '**Evaluation mode:** deterministic offline FakeAIProvider; no external AI service or personal contract data is used.',
    '**Dataset:** 5 synthetic, de-identified contract scenarios; binary expected labels are for HIGH risk only.',
    '',
    '| Measure | Result |',
    '|---|---:|',
    `| Clauses evaluated | ${total} |`,
    `| True positives | ${counts.truePositive} |`,
    `| False positives | ${counts.falsePositive} |`,
    `| False negatives | ${counts.falseNegative} |`,
    `| True negatives | ${counts.trueNegative} |`,
    `| HIGH-risk precision | ${(precision * 100).toFixed(1)}% |`,
    `| HIGH-risk recall | ${(recall * 100).toFixed(1)}% |`,
    '',
    '## Interpretation and limitations',
    '',
    'This report is a reproducible smoke evaluation of the offline demonstration classifier against a small synthetic fixture set. It is not a measurement of Anthropic model quality, legal correctness, or production performance. Synthetic expected labels are illustrative and must be reviewed by qualified legal-domain reviewers before use as a benchmark. Legal references are intentionally excluded from these samples.',
    '',
    'Run `npm run evaluate` from `backend/` to regenerate this report. Expand the reviewed fixture set before using these metrics to make product or legal decisions.',
    '',
  ].join('\n');

  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(report);
}

main().catch((error: unknown) => {
  console.error('High-risk evaluation failed:', error);
  process.exitCode = 1;
});
