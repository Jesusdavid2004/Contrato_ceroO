# Legal corpus (`backend/data/legal`)

Versioned multi-file corpus used by the optional RAG context
(`PostgresLegalContextProvider`, seeded with `npm run seed:legal`).

- `manifest.json` (version 1) lists one JSON file per legal domain.
- `CO-ARRIENDO.json`: 10 curated arriendo provisions (Ley 820 de 2003).
- `CO-CONSUMO.json`: 10 curated consumo provisions (Ley 1480 de 2011).
- `coverage.json`: generated report (counts + verification dates), mirrored to
  `frontend/src/data/legal-coverage.json` for the `/coverage` page.

Each item carries `sourceUrl`, `tema`, `vigenciaDesde`, `fuenteVerificadaEn`.
The strict loader (`src/infrastructure/legal/corpusLoader.ts`) rejects unknown
fields, duplicate ids, tema mismatches, and non-CO jurisdictions.

> **Verify against official sources before any production or legal use.**
> References are illustrative summaries for a classroom demo, not legal advice.
> Official texts: Ley 820 de 2003 and Ley 1480 de 2011 as published by the
> Secretaría del Senado and Función Pública (see `sourceUrl` fields).

To enable retrieval: seed the corpus, then set `RAG_ENABLED=true`. The
classifier may only cite provisions present in the retrieved context; anything
else is filtered out and never shown.
