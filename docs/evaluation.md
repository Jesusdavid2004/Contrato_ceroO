# High-risk classification evaluation

**Generated:** 2026-11-03T15:16:48.371Z
**Dataset:** 9 hand-labeled contract scenarios (Spanish and English, lease/service/employment); binary expected labels are for HIGH risk only.
**RAG:** disabled for this run, so `legal_basis` is empty across providers.

| Provider | Clauses | TP | FP | FN | TN | HIGH precision | HIGH recall | Usage |
|---|---|---:|---:|---:|---:|---:|---:|---|
| fake (deterministic regex double) | 27 | 1 | 0 | 7 | 19 | 100.0% | 12.5% | inputTokens=0 outputTokens=0 |
| local (on-device multilingual-e5 prototypes) | 27 | 5 | 5 | 3 | 14 | 50.0% | 62.5% | inputTokens=519 outputTokens=0 |
| anthropic (hosted Claude, tool use + Zod) | skipped | ANTHROPIC_API_KEY is not set; no external call was made. |
| gemini (hosted Gemini, JSON mode + Zod) | 27 | 6 | 0 | 2 | 19 | 100.0% | 75.0% | inputTokens=4095 outputTokens=3394 |

## Interpretation and limitations

Labels are illustrative judgments for a classroom demo, not legal review: an abusive paraphrase without the regex keywords counts as HIGH, and a proportionate capped penalty counts as LOW. The deterministic fake double is a Spanish-keyword baseline, so English traps and paraphrases are its known blind spots. The local neural provider uses a general-purpose multilingual embedding model, not a legal-tuned classifier. The hosted provider is only measured when a key is configured, and its numbers still depend on prompts, temperature defaults, and this tiny fixture set — never treat them as production quality or legal correctness.

Run `npm run evaluate` from `backend/` to regenerate this report. Expand the reviewed fixture set with qualified legal-domain reviewers before using these metrics to make product or legal decisions.
