import { describe, expect, it } from 'vitest';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { Contract } from '../src/domain/entities/Contract';
import type { AIProvider, ClassifyClausesRequest } from '../src/domain/services/AIProvider';
import type { LegalContextProvider } from '../src/domain/services/LegalContextProvider';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';

function citingProvider(): AIProvider {
  return {
    classifyClauses: async (request: ClassifyClausesRequest) => ({
      clauses: request.clauses.map((clause) => ({
        clause_id: clause.id,
        risk_level: 'high' as const,
        confidence: 0.95,
        plain_explanation: 'Explanation.',
        why_risky: 'Risky.',
        legal_basis: [{ reference: 'Ley 820 de 2003, Art. 20', summary: 'Cap respected.' }],
        suggested_change: null,
      })),
      usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
    }),
    generateObjectionLetter: async () => 'letter',
  };
}

function contextProvider(): LegalContextProvider {
  return {
    retrieve: async (_jurisdiction, clauses) => clauses.map((clause) => ({
      clauseId: clause.id,
      sourceName: 'Ley 820 de 2003 (arrendamiento de vivienda urbana)',
      sourceUrl: 'https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html',
      reference: 'Ley 820 de 2003, Art. 20',
      text: 'Cap text.',
      tema: 'arriendo',
      fuenteVerificadaEn: '2026-11-03',
    })),
  };
}

async function analyzeWith(contractId: string, withContext: boolean) {
  const repository = new InMemoryContractRepository();
  const contract = new Contract({
    id: contractId,
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
    { extractText: async () => 'contract text' },
    { segment: async () => [{ orderIndex: 1, text: 'El canon subirá sin límite este año.' }] },
    citingProvider(),
    new InMemoryAIUsageRepository(),
    new InMemoryAIClassificationCache(),
    undefined,
    withContext ? contextProvider() : undefined,
  );
  await useCase.execute({
    contractId: contract.id,
    userId: contract.ownerId,
    fileBuffer: Buffer.from('test'),
    mimeType: 'application/pdf',
  });
  const result = await repository.findById(contractId);
  if (!result) throw new Error('Contract was not persisted');
  return result;
}

describe('Legal citation enrichment (sourceUrl + tema joined from retrieved context)', () => {
  it('attaches the canonical source URL, domain, and verification date to cited provisions', async () => {
    const result = await analyzeWith('contract-enriched', true);
    const basis = result.clauses[0].legalBasis;
    expect(basis).toHaveLength(1);
    expect(basis[0]).toEqual({
      reference: 'Ley 820 de 2003, Art. 20',
      summary: 'Cap respected.',
      sourceUrl: 'https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html',
      tema: 'arriendo',
      fuenteVerificadaEn: '2026-11-03',
    });
  });

  it('matches references case-insensitively', async () => {
    const repository = new InMemoryContractRepository();
    const contract = new Contract({
      id: 'contract-case',
      ownerId: 'user-1',
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);
    const provider: AIProvider = {
      classifyClauses: async (request) => ({
        clauses: request.clauses.map((clause) => ({
          clause_id: clause.id,
          risk_level: 'high' as const,
          confidence: 0.95,
          plain_explanation: 'Explanation.',
          why_risky: 'Risky.',
          legal_basis: [{ reference: 'LEY 820 DE 2003, ART. 20', summary: 'Cap.' }],
          suggested_change: null,
        })),
        usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
      }),
      generateObjectionLetter: async () => 'letter',
    };
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => 'contract text' },
      { segment: async () => [{ orderIndex: 1, text: 'El canon subirá.' }] },
      provider,
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
      undefined,
      contextProvider(),
    );
    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });
    const result = await repository.findById(contract.id);
    expect(result?.clauses[0].legalBasis[0].sourceUrl).toBe(
      'https://www.secretariasenado.gov.co/senado/basedoc/ley_0820_2003.html',
    );
  });

  it('never invents a link for citations absent from the retrieved context', async () => {
    const repository = new InMemoryContractRepository();
    const contract = new Contract({
      id: 'contract-nocontext',
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
      { extractText: async () => 'contract text' },
      { segment: async () => [{ orderIndex: 1, text: 'El canon subirá.' }] },
      citingProvider(),
      new InMemoryAIUsageRepository(),
      new InMemoryAIClassificationCache(),
      undefined,
      undefined,
    );
    await useCase.execute({
      contractId: contract.id,
      userId: contract.ownerId,
      fileBuffer: Buffer.from('test'),
      mimeType: 'application/pdf',
    });
    const result = await repository.findById(contract.id);
    expect(result?.clauses[0].legalBasis).toEqual([
      {
        reference: 'Ley 820 de 2003, Art. 20',
        summary: 'Cap respected.',
        sourceUrl: '',
        tema: '',
        fuenteVerificadaEn: undefined,
      },
    ]);
  });
});
