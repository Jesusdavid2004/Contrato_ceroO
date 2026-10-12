import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../domain/exceptions/DomainError';
import { ZodError } from 'zod';
import { logger } from '../logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. Domain and application custom exceptions
  if (err instanceof DomainError) {
    res.status(err.statusCode).json({
      code: err.code,
      message_key: err.messageKey,
      details: err.details,
    });
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      code: 'ValidationError',
      message_key: 'errors.validation_failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // 3. Multer errors
  if (err.name === 'MulterError') {
    const isLimit = (err as unknown as { code: string }).code === 'LIMIT_FILE_SIZE';
    res.status(isLimit ? 413 : 400).json({
      code: isLimit ? 'FileTooLargeError' : 'UploadError',
      message_key: isLimit ? 'errors.file_too_large' : 'errors.upload_failed',
      details: err.message,
    });
    return;
  }

  // 4. Legacy compatibility (e.g. "Unsupported file type")
  if (err.message === 'Unsupported file type') {
    res.status(415).json({
      code: 'UnsupportedFileTypeError',
      message_key: 'errors.unsupported_file_type',
      details: 'Upload a PDF or image.',
    });
    return;
  }

  // 5. Unknown internal server errors (never leak stack trace)
  logger.error('Unhandled internal server error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    code: 'InternalServerError',
    message_key: 'errors.internal_error',
  });
}
