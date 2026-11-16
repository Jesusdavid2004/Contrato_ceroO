# Assistant evaluation

`npm run evaluate:assistant` (in `backend/`) runs a fixed set of eight questions
against a synthetic lease (three clauses, two facts, the curated *arriendo*
provisions) and reports, per question and in total:

- valid citations (markers that exist in the context pack),
- markers pointing outside the pack,
- numbers in the answer that appear in no source,
- whether the system prompt leaked,
- whether the expected fact is present (answerable questions).

It uses Gemini when `GEMINI_API_KEY` is set and the offline extractive provider
otherwise. The question set covers a fact lookup, an early-termination clause,
utilities, a legal question answered by a curated provision, two questions the
contract cannot answer (a penalty that is not in the document and an unrelated
question), a prompt-injection attempt and an English question.

## Status of the hosted run

A complete hosted run **has not been recorded**. During development the free
Gemini tier answered only some of the cases and then returned HTTP 429 for
several minutes, even with an 8 second spacing and retries with backoff, so the
script aborted before printing its summary. No accuracy number is claimed here.
Re-run the command with a key that has quota, or with a billed key, and paste
the table below.

What was verified manually against the real model while building the feature
(demo contract, 3 clauses, small samples, not a benchmark):

- With prompt `assistant-reply-v2` answers cited clause sources (`[S1]`, `[S2]`).
  With `v1` the model sometimes answered without any marker, which is why the
  prompt now requires a marker on every statement and the use case flags
  answers without a valid citation as `grounded: false`.
- Grouped markers such as `[S4, S5]` appeared in practice and are normalized.
- Asked for the monthly rent when the contract did not state it, the model said
  the documents do not contain it instead of inventing a value.
- A request to reveal the system prompt was declined.
- Press items supplied as sources were described as press, not as law, after the
  context text started marking them as unofficial.

The deterministic parts (context pack, citation validation, plan, narration,
radar change detection) are covered by unit and route tests instead of model
runs.

## Results table

| case | answerable | valid citations | markers outside pack | numbers not in sources | prompt leak |
|---|---|---|---|---|---|
| _pending a complete hosted run_ | | | | | |
