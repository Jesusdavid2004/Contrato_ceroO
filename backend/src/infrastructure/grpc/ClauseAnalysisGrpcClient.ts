import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import { config } from '../../shared/config';
import { logger } from '../../shared/logger';

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

export interface ClauseItem {
  index: number;
  text: string;
}

export interface ClauseAnalysisResult {
  clause_index: number;
  risk_level: string;
  risk_score: number;
  category: string;
  explanation: string;
  violated_provisions: string[];
  suggested_revision: string;
  processing_ms: number;
}

function metadata(): grpc.Metadata {
  const meta = new grpc.Metadata();
  meta.set('authorization', `Bearer ${config.GRPC_INTERNAL_TOKEN}`);
  return meta;
}

export class ClauseAnalysisGrpcClient {
  private readonly client: {
    AnalyzeClause: (req: unknown, meta: grpc.Metadata, cb: (err: grpc.ServiceError | null, res?: unknown) => void) => void;
    BatchAnalyze: (req: unknown, meta: grpc.Metadata, cb: (err: grpc.ServiceError | null, res?: unknown) => void) => void;
  };

  constructor(address?: string) {
    const target = address ?? `127.0.0.1:${config.GRPC_PORT}`;
    this.client = new proto.ClauseAnalysisService(
      target,
      grpc.credentials.createInsecure(),
    ) as ClauseAnalysisGrpcClient['client'];
  }

  analyzeClause(contractId: string, index: number, text: string, jurisdiction = 'CO', locale = 'es'): Promise<ClauseAnalysisResult> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 15000;
      this.client.AnalyzeClause(
        { contract_id: contractId, clause_index: index, text, jurisdiction, locale },
        metadata(),
        (err, res) => {
          if (Date.now() > deadline) {
            reject(new Error('gRPC deadline exceeded'));
            return;
          }
          if (err) {
            logger.error('gRPC AnalyzeClause failed', { errorName: err.name });
            reject(err);
            return;
          }
          resolve(res as ClauseAnalysisResult);
        },
      );
    });
  }

  batchAnalyze(contractId: string, clauses: ClauseItem[], jurisdiction = 'CO', locale = 'es'): Promise<ClauseAnalysisResult[]> {
    return new Promise((resolve, reject) => {
      this.client.BatchAnalyze(
        { contract_id: contractId, jurisdiction, locale, clauses },
        metadata(),
        (err, res) => {
          if (err) {
            logger.error('gRPC BatchAnalyze failed', { errorName: err.name });
            reject(err);
            return;
          }
          resolve(((res as { results?: ClauseAnalysisResult[] }).results) ?? []);
        },
      );
    });
  }
}
