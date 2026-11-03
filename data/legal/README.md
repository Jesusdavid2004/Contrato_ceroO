# Legal corpus (`data/legal`)

`CO.json` holds 14 curated Colombian provisions used by the optional RAG
context (`PostgresLegalContextProvider`, seeded with `npm run seed:legal`).

> **Verify against official sources before any production or legal use.**
> References below are illustrative summaries for a classroom demo, not legal
> citations. Official texts: Ley 820 de 2003 and Ley 1480 de 2011 as published
> by the Secretaría del Senado (see `sourceUrl` fields).

To enable retrieval: seed the corpus, then set `RAG_ENABLED=true`. The
classifier may only cite provisions present in the retrieved context
(`backend/test/legal-citation-filter.test.ts` pins this); anything else is
filtered out and never shown.
