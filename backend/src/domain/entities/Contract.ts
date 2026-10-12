import type { ContractType } from '../value-objects/ContractType';
import type { ContractStatus } from '../value-objects/ContractStatus';
import type { Jurisdiction } from '../value-objects/Jurisdiction';
import { Clause } from './Clause';
import { RiskScore } from '../value-objects/RiskScore';

export const RISK_WEIGHT_HIGH = 3;
export const RISK_WEIGHT_MEDIUM = 1;
export const RISK_WEIGHT_LOW = 0;

export interface ContractProps {
  id: string;
  ownerId: string;
  title: string;
  fileName: string;
  contractType: ContractType;
  jurisdiction: Jurisdiction;
  locale: string;
  status?: ContractStatus;
  clauses?: Clause[];
  globalRiskScore?: number;
  uploadedAt?: Date;
  failureReason?: string | null;
}

export class Contract {
  public readonly id: string;
  public readonly ownerId: string;
  public readonly title: string;
  public readonly fileName: string;
  public readonly contractType: ContractType;
  public readonly jurisdiction: Jurisdiction;
  public readonly locale: string;
  private _status: ContractStatus;
  private _clauses: Clause[];
  private _globalRiskScore: number;
  public readonly uploadedAt: Date;
  private _failureReason: string | null;

  constructor(props: ContractProps) {
    this.id = props.id;
    this.ownerId = props.ownerId;
    this.title = props.title;
    this.fileName = props.fileName;
    this.contractType = props.contractType;
    this.jurisdiction = props.jurisdiction;
    this.locale = props.locale;
    this._status = props.status || 'UPLOADED';
    this._clauses = props.clauses || [];
    this.uploadedAt = props.uploadedAt || new Date();
    this._failureReason = props.failureReason ?? null;
    this._globalRiskScore = props.globalRiskScore !== undefined
      ? props.globalRiskScore
      : this.calculateGlobalRiskScore();
  }

  public get status(): ContractStatus {
    return this._status;
  }

  public get clauses(): readonly Clause[] {
    return this._clauses;
  }

  public get globalRiskScore(): number {
    return this._globalRiskScore;
  }

  public get failureReason(): string | null {
    return this._failureReason;
  }

  /**
   * Calculates global risk score based on weighted clause risk:
   * weights HIGH=3, MEDIUM=1, LOW=0;
   * score = round(100 * (3*high + 1*medium) / (3 * totalClauses)); 0 if no clauses.
   */
  public calculateGlobalRiskScore(): number {
    if (this._clauses.length === 0) {
      return 0;
    }

    let highCount = 0;
    let mediumCount = 0;

    for (const clause of this._clauses) {
      if (clause.riskLevel === 'high') {
        highCount++;
      } else if (clause.riskLevel === 'medium') {
        mediumCount++;
      }
    }

    const maxPossibleScore = RISK_WEIGHT_HIGH * this._clauses.length;
    const actualScore = RISK_WEIGHT_HIGH * highCount + RISK_WEIGHT_MEDIUM * mediumCount;
    const rawScore = Math.round((100 * actualScore) / maxPossibleScore);

    this._globalRiskScore = RiskScore.from(rawScore).getValue();
    return this._globalRiskScore;
  }

  public setClauses(clauses: Clause[]): void {
    this._clauses = clauses;
    this.calculateGlobalRiskScore();
  }

  public flaggedClauses(): Clause[] {
    return this._clauses.filter((c) => c.isFlagged());
  }

  public markReady(): void {
    this._status = 'READY';
    this.calculateGlobalRiskScore();
  }

  public markFailed(reason?: string): void {
    this._status = 'FAILED';
    this._failureReason = reason ?? null;
  }

  public toJSON() {
    return {
      id: this.id,
      user_id: this.ownerId,
      title: this.title,
      file_name: this.fileName,
      contract_type: this.contractType,
      jurisdiction: this.jurisdiction,
      locale: this.locale,
      status: this._status,
      global_risk_score: this._globalRiskScore,
      uploaded_at: this.uploadedAt.toISOString(),
      clauses: this._clauses.map((c) => c.toJSON()),
      failure_reason: this._failureReason,
    };
  }
}
