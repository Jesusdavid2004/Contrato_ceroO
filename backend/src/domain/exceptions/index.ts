import { DomainError } from './DomainError';

export * from './DomainError';

export class UnsupportedFileTypeError extends DomainError {
  constructor(mimeType?: string) {
    super(
      `Unsupported file type: ${mimeType || 'unknown'}. Only PDF, PNG, and JPG are supported.`,
      'errors.unsupported_file_type',
      415,
      { mimeType },
    );
  }
}

export class FileTooLargeError extends DomainError {
  constructor(maxSizeMb: number = 10) {
    super(
      `File exceeds maximum allowed size of ${maxSizeMb}MB.`,
      'errors.file_too_large',
      413,
      { maxSizeMb },
    );
  }
}

export class FileTooManyPagesError extends DomainError {
  constructor(maxPages: number) {
    super(
      `PDF exceeds the maximum allowed page count of ${maxPages}.`,
      'errors.file_too_many_pages',
      413,
      { maxPages },
    );
  }
}

export class TextExtractionFailedError extends DomainError {
  constructor(reason: string = 'No extractable text found in contract.') {
    super(reason, 'errors.text_extraction_failed', 422);
  }
}

export class ContractNotFoundError extends DomainError {
  constructor(contractId: string) {
    super(`Contract not found: ${contractId}`, 'errors.contract_not_found', 404, { contractId });
  }
}

export class ContractOwnershipError extends DomainError {
  constructor(contractId: string) {
    super(`User is not authorized to access contract: ${contractId}`, 'errors.forbidden', 403, { contractId });
  }
}

export class NoFlaggedClausesError extends DomainError {
  constructor() {
    super(
      'No high or medium risk clauses found to generate an objection letter.',
      'errors.no_flagged_clauses',
      422,
    );
  }
}

export class AIResponseInvalidError extends DomainError {
  constructor(details?: unknown) {
    super('The AI provider returned an invalid or malformed response.', 'errors.ai_response_invalid', 502, details);
  }
}

export class AIProviderUnavailableError extends DomainError {
  constructor() {
    super('The AI provider request failed.', 'errors.ai_provider_unavailable', 502);
  }
}

export class AIRequestInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'errors.ai_request_invalid', 400);
  }
}

export class DailyQuotaExceededError extends DomainError {
  constructor(limit: number) {
    super(`Daily AI analysis quota exceeded (${limit} contracts per day).`, 'errors.daily_quota_exceeded', 429, { limit });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Authentication required') {
    super(message, 'errors.unauthorized', 401);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid email or password', 'errors.invalid_credentials', 401);
  }
}

export class EmailAlreadyExistsError extends DomainError {
  constructor(email: string) {
    super(`Email already registered: ${email}`, 'errors.email_already_registered', 409, { email });
  }
}
