import { describe, it, expect } from 'vitest';
import { RegexClauseSegmenter } from '../src/infrastructure/services/RegexClauseSegmenter';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import { REQUIRES_REVIEW_CONFIDENCE } from '../src/domain/entities/Clause';

const TEXT = [
  'CONTRATO DE ARRENDAMIENTO',
  'CLÁUSULA 1. Objeto: el arrendador entrega el inmueble para vivienda urbana.',
  'CLÁUSULA 2. Precio: el canon mensual se paga dentro de los cinco primeros dias.',
  'CLÁUSULA 3. Duracion: doce meses contados desde la firma de este documento.',
].join('\n');

describe('Requires review', () => {
  function baseClause(confidence: number, requiresReview?: boolean): Clause {
    return new Clause({
      id: 'c1',
      orderIndex: 1,
      originalText: 'texto',
      riskLevel: 'high',
      confidence,
      plainExplanation: 'explicacion',
      requiresReview,
    });
  }

  it('separa incertidumbre de riesgo: grave e incierta pide revision', () => {
    expect(REQUIRES_REVIEW_CONFIDENCE).toBe(0.6);
    expect(baseClause(0.4).requiresReview).toBe(true);
    expect(baseClause(0.9).requiresReview).toBe(false);
    expect(baseClause(0.9, true).requiresReview).toBe(true);
    expect(baseClause(0.4).toJSON()).toMatchObject({ requires_review: true });
  });

  it('el analisis conserva la incertidumbre residual', async () => {
    const repository = new InMemoryContractRepository();
    const contract = new Contract({
      id: 'contract-review',
      ownerId: 'user-1',
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => TEXT },
      new RegexClauseSegmenter(),
      {
        classifyClauses: async (input) => ({
          clauses: input.clauses.map((item) => ({
            clause_id: item.id,
            risk_level: 'medium' as const,
            confidence: 0.4,
            plain_explanation: 'Dudoso.',
            why_risky: null,
            legal_basis: [],
            suggested_change: null,
          })),
          usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
        }),
        generateObjectionLetter: async () => '',
      },
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
    );

    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });

    const result = await repository.findById(contract.id);
    expect(result?.status).toBe('READY');
    expect(result?.clauses.length).toBeGreaterThan(0);
    expect(result?.clauses.every((clause) => clause.requiresReview)).toBe(true);
  });
});

describe('Clause evidence (offsets)', () => {
  it('regex headings report offsets that locate the clause text', async () => {
    const clauses = await new RegexClauseSegmenter().segment(TEXT);
    expect(clauses.length).toBeGreaterThanOrEqual(3);
    for (const clause of clauses) {
      expect(clause.startOffset).toBeDefined();
      expect(clause.endOffset).toBeDefined();
      const located = TEXT.slice(clause.startOffset as number, clause.endOffset as number).trim();
      expect(located).toBe(clause.text);
    }
  });

  it('paragraph fallback reports offsets into the same text', async () => {
    const text = 'Primer parrafo largo con mas de veinte caracteres para segmentar.\n\nSegundo parrafo largo con mas de veinte caracteres para segmentar.';
    const clauses = await new RegexClauseSegmenter().segment(text);
    expect(clauses).toHaveLength(2);
    for (const clause of clauses) {
      const located = text.slice(clause.startOffset as number, clause.endOffset as number);
      expect(located).toBe(clause.text);
    }
  });

  it('unknown locations stay null instead of invented numbers', () => {
    const clause = new Clause({
      id: 'c1',
      orderIndex: 1,
      originalText: 'texto',
      riskLevel: 'low',
      confidence: 0.5,
      plainExplanation: 'explicacion',
    });
    expect(clause.pageNumber).toBeNull();
    expect(clause.startOffset).toBeNull();
    expect(clause.endOffset).toBeNull();
    expect(clause.toJSON()).toMatchObject({
      page_number: null,
      start_offset: null,
      end_offset: null,
    });
  });

  it('analysis preserves segmenter offsets on the stored clauses', async () => {
    const repository = new InMemoryContractRepository();
    const contract = new Contract({
      id: 'contract-evidence',
      ownerId: 'user-1',
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => TEXT },
      new RegexClauseSegmenter(),
      {
        classifyClauses: async (request) => ({
          clauses: request.clauses.map((item) => ({
            clause_id: item.id,
            risk_level: 'low' as const,
            confidence: 0.9,
            plain_explanation: 'Sin riesgo evidente.',
            why_risky: null,
            legal_basis: [],
            suggested_change: null,
          })),
          usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
        }),
        generateObjectionLetter: async () => '',
      },
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
    );

    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });

    const result = await repository.findById(contract.id);
    expect(result?.status).toBe('READY');
    expect(result?.clauses.length).toBeGreaterThanOrEqual(3);
    for (const clause of result?.clauses ?? []) {
      expect(clause.pageNumber).toBeNull();
      expect(typeof clause.startOffset).toBe('number');
      expect(typeof clause.endOffset).toBe('number');
      expect(
        TEXT.slice(clause.startOffset as number, clause.endOffset as number).trim(),
      ).toBe(clause.originalText);
    }
  });
});
