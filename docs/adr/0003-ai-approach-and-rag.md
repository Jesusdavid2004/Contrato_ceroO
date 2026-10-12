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
3. **Deterministic `FakeAIProvider`:**
   - Implemented behind the common `AIProvider` interface to run unit/integration tests and allow offline local development without incurring API costs.
4. **Feature-Flagged RAG (`RAG_ENABLED`):**
   - When enabled, clauses query PostgreSQL with `pgvector` to retrieve the top 3 relevant statutory provisions for the selected jurisdiction. The model is instructed only to cite provisions present in the retrieved `<legal_context>`.

## Consequences
- **Positive:** Cost-effective, verifiable, testable without internet or API keys, grounded in real legal provisions.
- **Negative:** Requires vector database capability (`pgvector`) and curated statutory data when RAG is enabled.
