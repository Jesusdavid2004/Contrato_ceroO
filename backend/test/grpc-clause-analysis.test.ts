import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeClauseText, createGrpcServer } from '../src/infrastructure/grpc/ClauseAnalysisGrpcServer';
import { ClauseAnalysisGrpcClient } from '../src/infrastructure/grpc/ClauseAnalysisGrpcClient';

const PROTO_PATH = path.resolve(__dirname, '../../proto/clause_analysis.proto');

describe('gRPC clause analysis contract', () => {
  it('defines the ClauseAnalysisService proto', () => {
    const proto = fs.readFileSync(PROTO_PATH, 'utf8');
    expect(proto).toContain('service ClauseAnalysisService');
    expect(proto).toContain('rpc AnalyzeClause');
    expect(proto).toContain('rpc BatchAnalyze');
    expect(proto).toContain('rpc HealthCheck');
  });

  it('creates a server with the clause service', () => {
    const server = createGrpcServer();
    expect(server).toBeDefined();
  });

  it('constructs a client without connecting', () => {
    const client = new ClauseAnalysisGrpcClient('127.0.0.1:1');
    expect(client).toBeDefined();
  });

  it('scores high-risk clauses deterministically', () => {
    const text = 'The landlord may terminate without prior notice unilaterally.';
    const first = analyzeClauseText(text, 'CO', 'en');
    const second = analyzeClauseText(text, 'CO', 'en');
    expect(first.riskLevel).toBe('RISK_LEVEL_HIGH');
    expect(first.riskScore).toBe(second.riskScore);
    expect(first.riskScore).toBeGreaterThan(0.8);
  });

  it('rejects empty text at validation level', () => {
    expect(() => analyzeClauseText('', 'CO', 'es')).not.toThrow();
  });
});
