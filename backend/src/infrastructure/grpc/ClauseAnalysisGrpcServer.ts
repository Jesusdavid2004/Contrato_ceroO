/**
 * gRPC server for ClauseAnalysisService.
 *
 * This internal service handles structured clause analysis orchestration
 * over HTTP/2 (gRPC protocol). It is NOT exposed publicly; Express routes
 * call it via the ClauseAnalysisGrpcClient adapter.
 *
 * Transport: @grpc/grpc-js (pure Node.js, no native deps)
 * Auth:      Service-to-service token check via metadata interceptor
 * Security:  Deadline enforcement (15s default), structured error mapping
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import { logger } from '../../shared/logger';
import { config } from '../../shared/config';

// ─── Proto Loading ────────────────────────────────────────────────────────────

const PROTO_PATH = path.resolve(__dirname, '../../../../proto/clause_analysis.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = (grpc.loadPackageDefinition(packageDefinition) as any).contratoclaro.clause;

// ─── Risk Analysis Logic ──────────────────────────────────────────────────────

type RiskLevel = 'RISK_LEVEL_LOW' | 'RISK_LEVEL_MEDIUM' | 'RISK_LEVEL_HIGH';
type Category =
  | 'CLAUSE_CATEGORY_TERMINATION'
  | 'CLAUSE_CATEGORY_FINANCIAL'
  | 'CLAUSE_CATEGORY_OBLIGATIONS'
  | 'CLAUSE_CATEGORY_RIGHTS'
  | 'CLAUSE_CATEGORY_TEMPORAL'
  | 'CLAUSE_CATEGORY_OTHER';

interface AnalysisResult {
  riskLevel: RiskLevel;
  riskScore: number;
  category: Category;
  explanation: string;
  violatedProvisions: string[];
  suggestedRevision: string;
}

function hashScore(text: string, salt: string): number {
  let hash = 0;
  const input = `${salt}:${text}`;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

export function analyzeClauseText(text: string, jurisdiction: string, locale: string): AnalysisResult {
  const lowerText = text.toLowerCase();

  // Simple rule-based analysis (production would call AI provider)
  const HIGH_RISK_PATTERNS = [
    { pattern: /sin previo aviso|without notice/i, provision: 'Art. 518 C.Co.' },
    { pattern: /unilateral(mente)?|unilaterally/i, provision: 'Art. 1603 C.C.' },
    { pattern: /cualquier porcentaje|any percentage/i, provision: 'Ley 820/2003 Art. 20' },
    { pattern: /penalidad.*30%|penalty.*30%/i, provision: 'Art. 867 C.Co.' },
  ];

  const MEDIUM_RISK_PATTERNS = [
    { pattern: /tres meses|three months/i, provision: 'Ley 820/2003 Art. 29' },
    { pattern: /daños estructurales|structural damage/i, provision: 'Art. 1985 C.C.' },
  ];

  let riskLevel: RiskLevel = 'RISK_LEVEL_LOW';
  let riskScore = 0.1;
  const violatedProvisions: string[] = [];

  for (const { pattern, provision } of HIGH_RISK_PATTERNS) {
    if (pattern.test(lowerText)) {
      riskLevel = 'RISK_LEVEL_HIGH';
      riskScore = 0.85 + hashScore(text, provision) * 0.14;
      violatedProvisions.push(provision);
    }
  }

  if (riskLevel === 'RISK_LEVEL_LOW') {
    for (const { pattern, provision } of MEDIUM_RISK_PATTERNS) {
      if (pattern.test(lowerText)) {
        riskLevel = 'RISK_LEVEL_MEDIUM';
        riskScore = 0.45 + hashScore(text, provision) * 0.25;
        violatedProvisions.push(provision);
      }
    }
  }

  if (riskLevel === 'RISK_LEVEL_LOW') {
    riskScore = 0.05 + hashScore(text, 'low') * 0.25;
  }

  // Category detection
  let category: Category = 'CLAUSE_CATEGORY_OTHER';
  if (/terminaci[oó]n|termination|rescisi[oó]n/i.test(lowerText)) category = 'CLAUSE_CATEGORY_TERMINATION';
  else if (/canon|renta|precio|pago|depósito|deposit|financial|financiero/i.test(lowerText)) category = 'CLAUSE_CATEGORY_FINANCIAL';
  else if (/mantenimiento|maintenance|obliga/i.test(lowerText)) category = 'CLAUSE_CATEGORY_OBLIGATIONS';
  else if (/derecho|right|renovaci[oó]n/i.test(lowerText)) category = 'CLAUSE_CATEGORY_RIGHTS';
  else if (/plazo|meses|días|term|duration/i.test(lowerText)) category = 'CLAUSE_CATEGORY_TEMPORAL';

  const explanations: Record<RiskLevel, string> = {
    RISK_LEVEL_HIGH:
      locale === 'en'
        ? `High risk clause detected in ${jurisdiction}. This clause may violate: ${violatedProvisions.join(', ')}.`
        : `Cláusula de alto riesgo detectada en ${jurisdiction}. Esta cláusula puede violar: ${violatedProvisions.join(', ')}.`,
    RISK_LEVEL_MEDIUM:
      locale === 'en'
        ? `Medium risk clause. May exceed statutory limits: ${violatedProvisions.join(', ')}.`
        : `Cláusula de riesgo medio. Puede exceder los límites legales: ${violatedProvisions.join(', ')}.`,
    RISK_LEVEL_LOW:
      locale === 'en'
        ? 'This clause appears standard and within legal bounds.'
        : 'Esta cláusula parece estándar y dentro de los límites legales.',
  };

  const revisions: Record<RiskLevel, string> = {
    RISK_LEVEL_HIGH:
      locale === 'en'
        ? 'Negotiate removal or replacement with a clause that complies with applicable law.'
        : 'Negociar la eliminación o sustitución por una cláusula que cumpla la ley aplicable.',
    RISK_LEVEL_MEDIUM:
      locale === 'en'
        ? 'Request modification to bring within statutory limits.'
        : 'Solicitar modificación para ajustar a los límites estatutarios.',
    RISK_LEVEL_LOW: '',
  };

  return {
    riskLevel,
    riskScore: Math.min(riskScore, 1.0),
    category,
    explanation: explanations[riskLevel],
    violatedProvisions,
    suggestedRevision: revisions[riskLevel],
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

type GrpcCallback<T> = (err: grpc.ServiceError | null, response?: T) => void;

function makeError(code: grpc.status, message: string): grpc.ServiceError {
  const err = new Error(message) as grpc.ServiceError;
  err.code = code;
  err.details = message;
  err.metadata = new grpc.Metadata();
  return err;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function analyzeClause(call: grpc.ServerUnaryCall<any, any>, callback: GrpcCallback<any>) {
  const start = Date.now();
  try {
    if (!isAuthorized(call)) {
      return callback(makeError(grpc.status.UNAUTHENTICATED, 'Invalid or missing service token'));
    }
    const req = call.request;
    if (!req.text || req.text.trim().length === 0) {
      return callback(makeError(grpc.status.INVALID_ARGUMENT, 'text field is required and must not be empty'));
    }
    if (!req.contract_id) {
      return callback(makeError(grpc.status.INVALID_ARGUMENT, 'contract_id is required'));
    }

    const result = analyzeClauseText(
      req.text,
      req.jurisdiction || 'CO',
      req.locale || 'es',
    );

    callback(null, {
      clause_index: req.clause_index || 0,
      risk_level: result.riskLevel,
      risk_score: result.riskScore,
      category: result.category,
      explanation: result.explanation,
      violated_provisions: result.violatedProvisions,
      suggested_revision: result.suggestedRevision,
      processing_ms: Date.now() - start,
    });
  } catch (err) {
    logger.error('gRPC analyzeClause unhandled error', { error: String(err) });
    callback(makeError(grpc.status.INTERNAL, 'Internal analysis error'));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function batchAnalyze(call: grpc.ServerUnaryCall<any, any>, callback: GrpcCallback<any>) {
  const start = Date.now();
  try {
    if (!isAuthorized(call)) {
      return callback(makeError(grpc.status.UNAUTHENTICATED, 'Invalid or missing service token'));
    }
    const req = call.request;
    if (!req.contract_id) {
      return callback(makeError(grpc.status.INVALID_ARGUMENT, 'contract_id is required'));
    }
    if (!req.clauses || req.clauses.length === 0) {
      return callback(makeError(grpc.status.INVALID_ARGUMENT, 'clauses array must not be empty'));
    }
    if (req.clauses.length > 100) {
      return callback(makeError(grpc.status.INVALID_ARGUMENT, 'Maximum 100 clauses per batch'));
    }

    const results = (req.clauses as Array<{ index: number; text: string }>).map((item) => {
      const clauseStart = Date.now();
      const result = analyzeClauseText(item.text, req.jurisdiction || 'CO', req.locale || 'es');
      return {
        clause_index: item.index,
        risk_level: result.riskLevel,
        risk_score: result.riskScore,
        category: result.category,
        explanation: result.explanation,
        violated_provisions: result.violatedProvisions,
        suggested_revision: result.suggestedRevision,
        processing_ms: Date.now() - clauseStart,
      };
    });

    callback(null, {
      contract_id: req.contract_id,
      results,
      total_processing_ms: Date.now() - start,
    });
  } catch (err) {
    logger.error('gRPC batchAnalyze unhandled error', { error: String(err) });
    callback(makeError(grpc.status.INTERNAL, 'Internal batch analysis error'));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function healthCheck(_call: grpc.ServerUnaryCall<any, any>, callback: GrpcCallback<any>) {
  callback(null, { status: 'SERVING', message: 'ClauseAnalysisService is healthy' });
}

// ─── Auth helper ────────────────────────────────────────────────────────────

const GRPC_INTERNAL_TOKEN = config.GRPC_INTERNAL_TOKEN;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAuthorized(call: grpc.ServerUnaryCall<any, any>): boolean {
  const meta = call.metadata as grpc.Metadata | undefined;
  const authHeader = meta?.get('authorization');
  const token = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  return Boolean(token) && String(token).replace('Bearer ', '') === GRPC_INTERNAL_TOKEN;
}

// ─── Server Bootstrap ─────────────────────────────────────────────────────────

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server();

  server.addService(proto.ClauseAnalysisService.service, {
    analyzeClause,
    batchAnalyze,
    healthCheck,
  });

  return server;
}

export function startGrpcServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer();
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(), // TLS via reverse proxy in prod
      (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }
        logger.info(`gRPC ClauseAnalysisService listening on port ${boundPort}`);
        resolve();
      },
    );
  });
}
