# High-risk classification evaluation

**Generated:** 2026-10-13T20:46:32.373Z
**Evaluation mode:** deterministic offline FakeAIProvider; no external AI service or personal contract data is used.
**Dataset:** 5 synthetic, de-identified contract scenarios; binary expected labels are for HIGH risk only.

| Measure | Result |
|---|---:|
| Clauses evaluated | 10 |
| True positives | 4 |
| False positives | 0 |
| False negatives | 0 |
| True negatives | 6 |
| HIGH-risk precision | 100.0% |
| HIGH-risk recall | 100.0% |

## Interpretation and limitations

This report is a reproducible smoke evaluation of the offline demonstration classifier against a small synthetic fixture set. It is not a measurement of Anthropic model quality, legal correctness, or production performance. Synthetic expected labels are illustrative and must be reviewed by qualified legal-domain reviewers before use as a benchmark. Legal references are intentionally excluded from these samples.

Run `npm run evaluate` from `backend/` to regenerate this report. Expand the reviewed fixture set before using these metrics to make product or legal decisions.
