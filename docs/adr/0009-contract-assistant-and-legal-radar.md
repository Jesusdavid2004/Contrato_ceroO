# ADR 0009: Contract assistant, voice narration and legal radar

## Status

Accepted.

## Context

Users upload a contract (or a lawsuit document) and receive a static list of
clauses. They still ask the same questions afterwards: "what should I do now?",
"what does clause 4 mean for me?", "is this still valid under current law?".
Colombian legislation changes daily, so a static corpus goes stale.

The project already has: Gemini (hosted, optional) + local embeddings, a
pgvector RAG corpus (`legal_provisions`), contract facts, reminders, a job
runner and a realtime channel.

## Decision

1. **Contract assistant (grounded chat).** A new `AssistantProvider` port
   generates a reply from a closed context pack built in the domain layer
   (clauses, facts, retrieved legal provisions, recent legal updates). The
   user message and the contract text are untrusted data wrapped in delimiters.
   Adapters: Gemini (streaming) and an extractive offline adapter that reuses
   the deterministic question answering. Replies cite clause ids and legal
   references; citations not present in the context pack are dropped.
2. **Narration ("guided walkthrough").** The action plan and the narration
   script are produced by deterministic domain code (priorities, deadlines,
   numbers come from code, never from the LLM). The browser reads the script
   with the Web Speech API and highlights the clause being narrated.
3. **Legal radar.** Pluggable `LegalSourceAdapter`s (HTML page, RSS/Atom,
   Socrata open data) are polled on a schedule. Each fetched document is hashed;
   a change creates a `legal_updates` row, re-embeds the provision and flags
   contracts whose topic is affected. Failures of one source never stop the
   others and are logged without payloads.
4. **Persistence.** Conversations are stored per contract and owner, and are
   hard-deleted with the contract or the account.

## Consequences

- No new runtime dependency: Gemini is called over `fetch` like the existing
  provider, speech runs in the browser.
- The assistant is advice-adjacent, so every reply carries the translated
  disclaimer and the verification date of each cited source.
- Source pages can change layout; adapters are isolated and covered by tests
  with recorded fixtures so a break is detected, not silent.
