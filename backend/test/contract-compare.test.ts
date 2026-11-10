import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { CompareContractsUseCase } from '../src/application/use-cases/CompareContractsUseCase';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';

const OWNER_ID = 'compare-owner';
const OTHER_ID = 'compare-other';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Compare User' }).accessToken;
}

function clause(id: string, orderIndex: number, text: string, confidence = 0.9): Clause {
  return new Clause({
    id, orderIndex, originalText: text, riskLevel: 'medium', confidence, plainExplanation: 'Explicacion.',
  });
}

function readyContract(id: string, ownerId: string, clauses: Clause[]): Contract {
  const contract = new Contract({
    id, ownerId, title: 'Lease', fileName: 'lease.pdf',
    contractType: 'LEASE', jurisdiction: 'CO', locale: 'es', clauses,
  });
  contract.markReady();
  return contract;
}

function buildRouter(repository: InMemoryContractRepository): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/contracts', createContractRouter({
    contractRepository: repository,
    compareContractsUseCase: new CompareContractsUseCase(repository),
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

describe('Contract comparison', () => {
  it('clasifica anadidos, eliminaciones y modificaciones entre propios', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(readyContract('contract-v1', OWNER_ID, [
      clause('v1a', 1, 'El canon mensual es de cien.'),
      clause('v1b', 2, 'El deposito no se devuelve jamas.'),
    ]));
    await repository.save(readyContract('contract-v2', OWNER_ID, [
      clause('v2a', 1, 'El canon mensual es de doscientos.'),
      clause('v2c', 2, 'El arrendador visita cada domingo.'),
    ]));
    const app = buildRouter(repository);

    const res = await request(app)
      .get('/contracts/contract-v1/compare?other_id=contract-v2')
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.base_contract_id).toBe('contract-v1');
    expect(res.body.other_contract_id).toBe('contract-v2');
    expect(res.body.removed.map((c: { id: string }) => c.id)).toEqual(['v1b']);
    expect(res.body.added.map((c: { id: string }) => c.id)).toEqual(['v2c']);
    expect(res.body.modified).toHaveLength(1);
    expect(res.body.modified[0].base_clause_id).toBe('v1a');
    expect(res.body.modified[0].similarity).toBeGreaterThan(0.5);
    expect(res.body.unchanged).toBe(0);
    expect(res.body.limitations).toEqual([]);
  });

  it('propaga limites de lectura incompleta', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(readyContract('contract-r1', OWNER_ID, [
      clause('r1a', 1, 'Texto incierto con baja confianza.', 0.3),
    ]));
    await repository.save(readyContract('contract-r2', OWNER_ID, [
      clause('r2a', 1, 'Texto incierto con baja confianza.'),
    ]));
    const app = buildRouter(repository);

    const res = await request(app)
      .get('/contracts/contract-r1/compare?other_id=contract-r2')
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.limitations.length).toBeGreaterThan(0);
  });

  it('no mezcla usuarios y exige contratos listos', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(readyContract('contract-mine', OWNER_ID, [clause('m1', 1, 'Texto propio.')]));
    await repository.save(readyContract('contract-alien', OTHER_ID, [clause('a1', 1, 'Texto ajeno.')]));
    const draft = new Contract({
      id: 'contract-draft', ownerId: OWNER_ID, title: 'L', fileName: 'l.pdf',
      contractType: 'LEASE', jurisdiction: 'CO', locale: 'es',
    });
    await repository.save(draft);
    const app = buildRouter(repository);
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const alien = await request(app)
      .get('/contracts/contract-mine/compare?other_id=contract-alien')
      .set('Authorization', auth);
    expect(alien.status).toBe(403);

    const missing = await request(app)
      .get('/contracts/contract-mine/compare?other_id=contract-missing')
      .set('Authorization', auth);
    expect(missing.status).toBe(404);

    const notReady = await request(app)
      .get('/contracts/contract-draft/compare?other_id=contract-mine')
      .set('Authorization', auth);
    expect(notReady.status).toBe(409);

    const noQuery = await request(app)
      .get('/contracts/contract-mine/compare')
      .set('Authorization', auth);
    expect(noQuery.status).toBe(422);
  });
});
