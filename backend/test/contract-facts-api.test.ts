import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';

const OWNER_ID = 'fact-owner';
const OTHER_ID = 'fact-other';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Fact User' }).accessToken;
}

function readyContract(): Contract {
  const contract = new Contract({
    id: 'contract-facts-1',
    ownerId: OWNER_ID,
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
  });
  contract.markReady();
  return contract;
}

function buildRouter(
  repository: InMemoryContractRepository,
  facts: InMemoryFactsRepository,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/contracts', createContractRouter({
    contractRepository: repository,
    factsRepository: facts,
    uploadContractUseCase: new UploadContractUseCase(repository, {
      store: async () => 'ephemeral://test',
      get: async () => null,
      delete: async () => undefined,
    }),
    generateObjectionLetterUseCase: new GenerateObjectionLetterUseCase(repository, new FakeAIProvider()),
    downloadObjectionLetterPdfUseCase: new DownloadObjectionLetterPdfUseCase(repository, new PdfKitGenerator()),
    updateObjectionLetterUseCase: new UpdateObjectionLetterUseCase(repository),
  }));
  app.use(errorHandler);
  return app;
}

describe('Contract facts API', () => {
  it('el analisis guarda los 9 datos y el detalle los expone', async () => {
    const repository = new InMemoryContractRepository();
    const facts = new InMemoryFactsRepository();
    const contract = new Contract({
      id: 'contract-facts-full',
      ownerId: OWNER_ID,
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);
    const useCase = new AnalyzeContractUseCase(
      repository,
      { extractText: async () => 'El canon mensual es de $900.000 COP por 12 meses.' },
      {
        segment: async () => [
          { orderIndex: 1, text: 'El canon mensual es de $900.000 COP por 12 meses.', startOffset: 0, endOffset: 49 },
        ],
      },
      {
        classifyClauses: async (input) => ({
          clauses: input.clauses.map((item) => ({
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
      () => new Date('2026-11-10T00:00:00.000Z'),
      undefined,
      undefined,
      undefined,
      facts,
    );
    await useCase.execute({
      contractId: contract.id,
      userId: OWNER_ID,
      fileBuffer: Buffer.from('x'),
      mimeType: 'application/pdf',
    });

    const stored = await facts.getFacts(contract.id);
    expect(stored).toHaveLength(9);
    expect(stored.find((fact) => fact.key === 'amount')).toMatchObject({
      status: 'found',
      value: '900.000',
    });

    const app = buildRouter(repository, facts);
    const detail = await request(app)
      .get(`/contracts/${contract.id}`)
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.facts).toHaveLength(9);
  });

  it('confirma y corrige con reglas de transicion', async () => {
    const repository = new InMemoryContractRepository();
    const facts = new InMemoryFactsRepository();
    await repository.save(readyContract());
    await facts.saveFacts('contract-facts-1', [
      { key: 'amount', value: '900.000', status: 'found', evidenceClauseId: 'c1', evidenceQuote: '$900.000' },
      { key: 'currency', value: 'COP', status: 'found', evidenceClauseId: 'c1', evidenceQuote: '$900.000' },
      { key: 'periodicity', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'duration', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'party_a', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'party_b', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'start_date', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'end_date', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
      { key: 'termination', value: null, status: 'not_found', evidenceClauseId: null, evidenceQuote: null },
    ]);
    const app = buildRouter(repository, facts);
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const confirmed = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', auth)
      .send({ key: 'amount', status: 'confirmed' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ key: 'amount', value: '900.000', status: 'confirmed' });

    const corrected = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', auth)
      .send({ key: 'periodicity', status: 'corrected', value: 'monthly' });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ key: 'periodicity', value: 'monthly', status: 'corrected' });

    const confirmMissing = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', auth)
      .send({ key: 'duration', status: 'confirmed' });
    expect(confirmMissing.status).toBe(422);

    const confirmWithValue = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', auth)
      .send({ key: 'currency', status: 'confirmed', value: 'USD' });
    expect(confirmWithValue.status).toBe(422);

    const twice = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', auth)
      .send({ key: 'amount', status: 'confirmed' });
    expect(twice.status).toBe(422);

    const forbidden = await request(app)
      .put('/contracts/contract-facts-1/facts')
      .set('Authorization', `Bearer ${tokens(OTHER_ID)}`)
      .send({ key: 'amount', status: 'corrected', value: '1' });
    expect(forbidden.status).toBe(403);
  });

  it('exige analisis READY para confirmar', async () => {
    const repository = new InMemoryContractRepository();
    const facts = new InMemoryFactsRepository();
    await repository.save(new Contract({
      id: 'contract-facts-draft',
      ownerId: OWNER_ID,
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    }));
    const app = buildRouter(repository, facts);
    const res = await request(app)
      .put('/contracts/contract-facts-draft/facts')
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`)
      .send({ key: 'amount', status: 'corrected', value: '5' });
    expect(res.status).toBe(409);
  });
});
