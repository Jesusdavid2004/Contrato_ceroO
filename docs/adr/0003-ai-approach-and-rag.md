# ADR 0003: AI Architecture, Tiered Models, and Grounded Retrieval (RAG)

## Status
Accepted

## Context
Contract analysis requires high accuracy, zero hallucinations, fast response times, and cost efficiency. Training a custom model is prohibitive in cost and maintenance. Grounded legal explanations must strictly reference verifiable statutes or standards for the target jurisdiction (e.g., Colombia) rather than inventing articles.

## Decision
1. **Tiered Model Strategy (No Custom Training):**
   - **Fast Model (`AI_MODEL_FAST`, e.g. Claude 3.5 Haiku):** Used for initial batched classification (batches of up to 8 clauses) to evaluate risk level, generate plain-language explanations, and estimate confidence.
   - **Smart Model (`AI_MODEL_SMART`, e.g. Claude 3.5 Sonnet):** Used for generating formal objection letters and re-checking any clause classified with low confidence (< 0.6).
2. **Defensive Prompt Engineering:**
   - User-provided text is wrapped in `<clause>` tags and treated strictly as untrusted data with anti-prompt-injection system instructions.
   - Structured JSON schema validation with Zod. On schema failure, one automated retry with feedback before throwing `AIResponseInvalidError`.
   - The official `@anthropic-ai/sdk` is used for image transcription, AI-assisted clause segmentation, and structured clause/letter generation. Classification uses batches of at most eight, validates the tool response with Zod, and retries once with schema feedback. Requests are bounded by configurable timeouts and token limits, and untrusted document data is isolated from instructions.
3. **Deterministic `FakeAIProvider`:**
   - Implemented behind the common `AIProvider` interface to run unit/integration tests and allow offline local development without incurring API costs. Offline mode uses a deterministic lexical classifier and supports text-based PDFs; image transcription still requires a configured Anthropic key.
   - Classification outputs are cached in a bounded, process-local cache keyed by a SHA-256 digest of input text and analysis context. Raw clause text is not persisted in the cache key or logged.
   - An atomic daily reservation enforces `DAILY_AI_QUOTA` per user. Model token counts and request latency are recorded in `ai_usage`.
4. **Feature-Flagged RAG (`RAG_ENABLED`):**
   - When enabled, each clause is embedded locally with `Xenova/multilingual-e5-small` (384 dimensions, `query:` / `passage:` prefixes, mean pooling and normalization). PostgreSQL with `pgvector` retrieves up to three provisions for the selected jurisdiction.
   - Seeded provisions include a jurisdiction, official source name and URL, exact reference, and a concise paraphrased summary. The model receives provisions grouped by clause; citations are retained only when their exact reference was retrieved for that same clause.
   - Colombian seed data is in `backend/data/legal/CO.json`. Its initial corpus summarizes provisions from Laws 1480/2011 and 820/2003 and links to the Función Pública Gestor Normativo. Legal sources must be checked against their official text and current validity before additions or revisions. The summaries do not replace legal advice.
   - Run `npm run seed:legal` from `backend/` after database migrations. Model weights are downloaded on first use into `EMBEDDING_CACHE_DIR` (default `storage/models`); inference is local and has no per-request model API cost.

## Consequences
- **Positive:** Cost-effective, verifiable, testable without internet or API keys, grounded in real legal provisions.
- **Negative:** Requires vector database capability (`pgvector`) and curated statutory data when RAG is enabled.
