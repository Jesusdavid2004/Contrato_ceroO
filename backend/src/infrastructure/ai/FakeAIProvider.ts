import { NoFlaggedClausesError } from '../../domain/exceptions/index';
import type {
  AIModelTier,
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ObjectionLetterRequest,
} from '../../domain/services/AIProvider';
import type { RiskLevel } from '../../domain/value-objects/RiskLevel';

const HIGH_RISK_PATTERNS = [
  /\b(?:renovaci[oó]n|pr[oó]rroga)\s+autom[aá]tica\b/i,
  /\b(?:no\s+reembolsable|no\s+devoluci[oó]n)\b/i,
  /\b(?:penalidad|multa|multa)\b.{0,80}\b(?:desproporcionad|excesiv|totalidad)\b/i,
  /\b(?:waive|waiver|renuncia)\b.{0,80}\b(?:derecho|right|reclamaci[oó]n)\b/i,
];
const MEDIUM_RISK_PATTERNS = [
  /\b(?:unilateral|a\s+discreci[oó]n\s+de\s+la\s+empresa|sin\s+consentimiento)\b/i,
  /\b(?:penalidad|multa|cargo)\b/i,
];

export class FakeAIProvider implements AIProvider {
  public async classifyClauses(
    request: ClassifyClausesRequest,
    tier: AIModelTier = 'fast',
  ): Promise<ClauseClassificationResult> {
    const isSpanish = request.locale.toLowerCase().startsWith('es');
    const clauses = request.clauses.map((clause) => {
      const riskLevel: RiskLevel = HIGH_RISK_PATTERNS.some((pattern) => pattern.test(clause.text))
        ? 'high'
        : MEDIUM_RISK_PATTERNS.some((pattern) => pattern.test(clause.text))
          ? 'medium'
          : 'low';
      return {
        clause_id: clause.id,
        risk_level: riskLevel,
        confidence: 0.95,
        plain_explanation: isSpanish
          ? riskLevel === 'low'
            ? 'El análisis de demostración no detectó un patrón de riesgo evidente.'
            : 'Esta cláusula contiene expresiones que suelen asociarse con condiciones contractuales injustas.'
          : riskLevel === 'low'
            ? 'No obvious risk pattern was detected by the offline demo classifier.'
            : 'This clause contains language commonly associated with an unfair contract term.',
        why_risky: riskLevel === 'low'
          ? null
          : isSpanish
            ? 'La redacción podría dar una ventaja injusta a una de las partes.'
            : 'The wording may give one party an unfair advantage.',
        legal_basis: [],
        suggested_change: riskLevel === 'low'
          ? null
          : isSpanish
            ? 'Solicite una condición equilibrada y con límites claros.'
            : 'Request a balanced term with clear limits.',
      };
    });
    return {
      clauses,
      usage: {
        model: `fake-${tier}`,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  public async generateObjectionLetter(request: ObjectionLetterRequest): Promise<string> {
    if (request.flaggedClauses.length === 0) throw new NoFlaggedClausesError();
    const isSpanish = request.locale.toLowerCase().startsWith('es');
    const greeting = isSpanish ? 'Estimado/a [DESTINATARIO]:' : 'Dear [RECIPIENT],';
    const purpose = isSpanish
      ? 'Solicito respetuosamente revisar las siguientes cláusulas de [REFERENCIA DEL CONTRATO]:'
      : 'I respectfully request a review of the following clauses in [CONTRACT REFERENCE]:';
    const items = request.flaggedClauses.map((clause, index) =>
      `${index + 1}. ${clause.plainExplanation} ${clause.suggestedChange || ''}`.trim(),
    );
    const closing = isSpanish
      ? 'Agradezco su respuesta por escrito.\nAtentamente,\n[SU NOMBRE]\n[FECHA]'
      : 'Please provide a written response.\nSincerely,\n[YOUR NAME]\n[DATE]';
    return [greeting, '', purpose, ...items, '', closing].join('\n');
  }
}
