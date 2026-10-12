export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly messageKey: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, messageKey: string, statusCode: number = 400, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = this.constructor.name;
    this.messageKey = messageKey;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
