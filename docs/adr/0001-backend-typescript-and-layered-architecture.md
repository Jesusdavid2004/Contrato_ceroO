# ADR 0001: Incremental Migration from JavaScript to TypeScript and Layered Architecture

## Status
Accepted

## Context
The existing backend was built as a single monolithic CommonJS JavaScript file (`index.js`). While functional for early prototyping, this design violates the project's engineering standards (`CLAUDE.md`), which require:
- Strict TypeScript.
- Clean Architecture (layered design: `domain`, `application`, `infrastructure`, `presentation`).
- Separation of concerns, testability, and type safety across domain entities and external adapters.

A complete rewrite from scratch carries high risk of regression and breaks existing functionality.

## Decision
1. **Incremental Migration with `allowJs: true`:** We configure TypeScript with `allowJs: true` in the backend so legacy JavaScript and new TypeScript code coexist seamlessly.
2. **Safety Net via Characterization Tests:** Before altering any endpoint or business logic, we establish characterization tests using Supertest and Vitest to pin the observable behavior of the legacy system.
3. **Module-by-Module Refactoring:**
   - Extract domain entities and value objects with pure business logic and unit tests.
   - Extract use cases in the application layer.
   - Implement infrastructure adapters (repositories, AI provider, file storage).
   - Wire presentation controllers and replace the monolithic `index.js` with a clean composition root.

## Consequences
- **Positive:** Zero downtime / zero regression during development, verifiable behavior after every migration step, strict static typing in all new modules.
- **Negative:** Requires temporary dual-configuration and type definitions for legacy modules during the transition.
