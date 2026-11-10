import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import type { ObjectionLetterRequest } from '../src/domain/services/AIProvider';

const OWNER_ID = 'letter-owner';
const CONTRACT_ID = 'contract-letter-1';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Letter User' }).accessToken;
}

function readyContract(): Contract {
  const contract = new Contract({
    id: CONTRACT_ID,
    ownerId: OWNER_ID,
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    clauses: [
      new Clause({
        id: 'flag-a', orderIndex: 1, originalText: 'Reajuste mensual sin aviso.',
        riskLevel: 'high', confidence: 0.9, plainExplanation: 'Reajuste unilateral.',
      }),
      new Clause({
        id: 'flag-b', orderIndex: 2, originalText: 'Deposito no reembolsable.',
        riskLevel: 'medium', confidence: 0.8, plainExplanation: 'Deposito excesivo.',
      }),
      new Clause({
        id: 'calm-c', orderIndex: 3, originalText: 'Firma en dos ejemplares.',
        riskLevel: 'low', confidence: 0.9, plainExplanation: 'Formalidad.',
      }),
    ],
  });
  contract.markReady();
  return contract;
}

function buildHarness(): {
  app: express.Express;
  requests: ObjectionLetterRequest[];
} {
  const repository = new InMemoryContractRepository();
  void repository.save(readyContract());
  const requests: ObjectionLetterRequest[] = [];
  const provider = {
    classifyClauses: async () => {
      throw new Error('unused');
    },
    generateObjectionLetter: async (input: ObjectionLetterRequest) => {
      requests.push(input);
      return 'Estimado/a [DESTINATARIO]: carta de prueba.';
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/contracts', createContractRouter({
    contractRepository: repository,
    uploadContractUseCase: new UploadContractUseCase(repository, {
      store: async () => 'ephemeral://test',
      get: async () => null,
      delete: async () => undefined,
    }),
    generateObjectionLetterUseCase: new GenerateObjectionLetterUseCase(repository, provider),
    downloadObjectionLetterPdfUseCase: new DownloadObjectionLetterPdfUseCase(repository, new PdfKitGenerator()),
    updateObjectionLetterUseCase: new UpdateObjectionLetterUseCase(repository),
  }));
  app.use(errorHandler);
  return { app, requests };
}

describe('Objection letter selection', () => {
  it('usa todos los hallazgos con valores neutros por defecto', async () => {
    const { app, requests } = buildHarness();
    const res = await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`)
      .send({});
    expect(res.status).toBe(201);
    expect(requests).toHaveLength(1);
    expect(requests[0].flaggedClauses.map((clause) => clause.id)).toEqual(['flag-a', 'flag-b']);
    expect(requests[0].letterOptions).toEqual({ recipient: undefined, purpose: 'clarification', tone: 'respectful' });
    expect(res.body).toMatchObject({
      purpose: 'clarification',
      tone: 'respectful',
      recipient: null,
      selected_clause_ids: ['flag-a', 'flag-b'],
    });
  });

  it('genera con hallazgos, destinatario, proposito y tono explicitos', async () => {
    const { app, requests } = buildHarness();
    const res = await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`)
      .send({
        clause_ids: ['flag-b'],
        recipient: 'Inmobiliaria XYZ',
        purpose: 'adjustment',
        tone: 'firm',
      });
    expect(res.status).toBe(201);
    expect(requests[0].flaggedClauses.map((clause) => clause.id)).toEqual(['flag-b']);
    expect(requests[0].letterOptions).toMatchObject({
      recipient: 'Inmobiliaria XYZ',
      purpose: 'adjustment',
      tone: 'firm',
    });
    expect(res.body).toMatchObject({
      recipient: 'Inmobiliaria XYZ',
      purpose: 'adjustment',
      tone: 'firm',
      selected_clause_ids: ['flag-b'],
    });
  });

  it('rechaza clausulas ajenas y selecciones vacias', async () => {
    const { app } = buildHarness();
    const auth = `Bearer ${tokens(OWNER_ID)}`;
    const unknown = await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', auth)
      .send({ clause_ids: ['clause-missing'] });
    expect(unknown.status).toBe(404);
    const empty = await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', auth)
      .send({ clause_ids: [] });
    expect(empty.status).toBe(422);
  });

  it('editar conserva destinatario y seleccion (trazabilidad)', async () => {
    const { app } = buildHarness();
    const auth = `Bearer ${tokens(OWNER_ID)}`;
    await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', auth)
      .send({ clause_ids: ['flag-a'], recipient: 'Arrendador', purpose: 'clarification', tone: 'formal' });

    const edited = await request(app)
      .put(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', auth)
      .send({ content: 'Carta editada por el usuario para su borrador.' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      recipient: 'Arrendador',
      purpose: 'clarification',
      tone: 'formal',
      selected_clause_ids: ['flag-a'],
    });
  });
});
