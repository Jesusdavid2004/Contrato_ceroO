# High-risk classification evaluation

**Generated:** 2026-11-04T00:08:42.445Z
**Dataset:** 9 hand-labeled contract scenarios (Spanish and English, lease/service/employment); binary expected labels are for HIGH risk only, plus `expectedReferences` per clause for the citation metric.
**RAG:** enabled for this run via the versioned corpus in `backend/data/legal` (20 provisions: arriendo=10, consumo=10). LEASE clauses receive all arriendo provisions, SERVICE all consumo provisions, EMPLOYMENT none (no labor corpus yet).

| Provider | Clauses | TP | FP | FN | TN | HIGH precision | HIGH recall | Usage |
|---|---|---:|---:|---:|---:|---:|---:|---|
| fake (deterministic regex double) | 27 | 1 | 0 | 7 | 19 | 100.0% | 12.5% | inputTokens=0 outputTokens=0 |
| local (on-device multilingual-e5 prototypes) | 27 | 5 | 5 | 3 | 14 | 50.0% | 62.5% | inputTokens=519 outputTokens=0 |
| gemini (hosted Gemini, JSON mode + Zod) | 27 | 6 | 0 | 2 | 19 | 100.0% | 75.0% | inputTokens=31724 outputTokens=5742 |

## Citation metric (grounded vs expected)

Citation precision = cited references found verbatim in the supplied legal context / all cited references (anti-hallucination). Citation recall = expected references cited / all expected references in `evaluation/contracts.json`. Empty citation sets score precision 1 (nothing invented) and recall 0 when citations were expected.

| Provider | Predicted | Expected | Matched | Hallucinated | Citation precision | Citation recall |
|---|---:|---:|---:|---:|---:|---:|
| fake (deterministic regex double) | 0 | 10 | 0 | 0 | 100.0% | 0.0% |
| local (on-device multilingual-e5 prototypes) | 0 | 10 | 0 | 0 | 100.0% | 0.0% |
| gemini (hosted Gemini, JSON mode + Zod) | 20 | 10 | 8 | 0 | 100.0% | 80.0% |

## Interpretation and limitations

Labels are illustrative judgments for a classroom demo, not legal review: an abusive paraphrase without the regex keywords counts as HIGH, and a proportionate capped penalty counts as LOW. The deterministic fake double is a Spanish-keyword baseline that never cites, so its citation recall is 0 by design. The local neural provider uses a general-purpose multilingual embedding model, not a legal-tuned classifier, and also returns no citations without RAG wiring. The hosted provider is only measured when a key is configured, and its numbers still depend on prompts, temperature defaults, and this tiny fixture set — never treat them as production quality or legal correctness.

Run `npm run evaluate` from `backend/` to regenerate this report. Expand the reviewed fixture set with qualified legal-domain reviewers before using these metrics to make product or legal decisions.
