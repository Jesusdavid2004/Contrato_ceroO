import { DomainError } from '../exceptions/DomainError';

export class InvalidRiskScoreError extends DomainError {
  constructor(value: number) {
    super(`Risk score must be a number between 0 and 100, received: ${value}`, 'errors.invalid_risk_score', 400);
  }
}

export class RiskScore {
  private readonly value: number;

  constructor(value: number) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100) {
      throw new InvalidRiskScoreError(value);
    }
    this.value = Math.round(value);
  }

  public getValue(): number {
    return this.value;
  }

  public static from(value: number): RiskScore {
    return new RiskScore(value);
  }
}
