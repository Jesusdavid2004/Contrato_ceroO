# ADR 0002: Privacy by Design and Contract Retention Policy

## Status
Accepted

## Context
Contracts uploaded by users contain sensitive personal, financial, and legal information. Storing raw contract files permanently introduces substantial compliance and privacy risks (e.g., GDPR, Colombian Law 1581 on Personal Data Protection).

## Decision
1. **Default Ephemeral Storage (`CONTRACT_FILE_RETENTION=none`):**
   - By default, contract files (PDFs/images) are processed exclusively in-memory or in temporary storage during the extraction pipeline.
   - Once clauses and text are extracted, original files are deleted immediately. Only extracted structured clauses, analysis results, and objection letters are retained.
2. **Configurable Retention Window (`none | 7d | 30d`):**
   - If configured to `7d` or `30d`, files are stored in a private, server-side encrypted storage bucket with automated lifecycle expiration rules and short-lived signed URLs.
3. **Hard Deletion ("Delete Everything"):**
   - Provide explicit deletion endpoints (`DELETE /api/v1/contracts/:id` and `DELETE /api/v1/me`) that perform hard deletions across all database tables and any stored files.

## Consequences
- **Positive:** Minimizes exposure of personal identifiable information (PII), fulfills privacy by design requirements, and lowers storage costs.
- **Negative:** Re-running OCR or re-extracting from the original file requires the user to re-upload if the raw document was not retained.
