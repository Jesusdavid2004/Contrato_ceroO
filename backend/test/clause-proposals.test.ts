import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { CreateClauseProposalUseCase, UpdateClauseProposalUseCase } from '../src/application/use-cases/ProposalUseCases';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryProposalsRepository } from '../src/infrastructure/repositories/ProposalsRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';

const OWNER_ID = 'proposal-owner';
const OTHER_ID = 'proposal-other';
const CONTRACT_ID = 'contract-proposals-1';
const CLAUSE_ID = 'clause-with-suggestion';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Proposal User' }).accessToken;
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
        id: CLAUSE_ID,
        orderIndex: 1,
        originalText: 'El canon sube cada mes sin aviso.',
        riskLevel: 'high',
        confidence: 0.9,
        plainExplanation: 'Reajuste unilateral.',
        suggestedChange: 'El canon solo se reajusta una vez al año con aviso de 30 días.',
      }),
      new Clause({
        id: 'clause-plain',
        orderIndex: 2,
        originalText: 'Las partes firman en dos ejemplares.',
        riskLevel: 'low',
        confidence: 0.9,
        plainExplanation: 'Formalidad habitual.',
      }),
    ],
  });
  contract.markReady();
  return contract;
}

function buildRouter(
  repository: InMemoryContractRepository,
  proposals: InMemoryProposalsRepository,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/contracts', createContractRouter({
    contractRepository: repository,
    proposalsRepository: proposals,
    createProposalUseCase: new CreateClauseProposalUseCase(repository, proposals),
    updateProposalUseCase: new UpdateClauseProposalUseCase(repository, proposals),
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

describe('Clause proposals', () => {
  it('crea borradores con original, propuesta y motivo', async () => {
    const repository = new InMemoryContractRepository();
    const proposals = new InMemoryProposalsRepository();
    await repository.save(readyContract());
    const app = buildRouter(repository, proposals);
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const first = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/${CLAUSE_ID}/proposals`)
      .set('Authorization', auth)
      .send({ reason: 'Pido un reajuste anual con preaviso.' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      clause_id: CLAUSE_ID,
      original_text: 'El canon sube cada mes sin aviso.',
      proposed_text: 'El canon solo se reajusta una vez al año con aviso de 30 días.',
      status: 'draft',
      version: 1,
    });

    const second = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/clause-plain/proposals`)
      .set('Authorization', auth)
      .send({ proposed_text: 'Las partes firman en tres ejemplares.', reason: 'Quiero una copia extra.' });
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(1);

    const missingReason = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/${CLAUSE_ID}/proposals`)
      .set('Authorization', auth)
      .send({ proposed_text: 'Otro texto.' });
    expect(missingReason.status).toBe(422);

    const unknownClause = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/clause-missing/proposals`)
      .set('Authorization', auth)
      .send({ reason: 'Motivo.' });
    expect(unknownClause.status).toBe(404);

    const forbidden = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/${CLAUSE_ID}/proposals`)
      .set('Authorization', `Bearer ${tokens(OTHER_ID)}`)
      .send({ reason: 'Motivo ajeno.' });
    expect(forbidden.status).toBe(403);
  });

  it('acepta, edita y descarta solo borradores', async () => {
    const repository = new InMemoryContractRepository();
    const proposals = new InMemoryProposalsRepository();
    await repository.save(readyContract());
    const app = buildRouter(repository, proposals);
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const created = await request(app)
      .post(`/contracts/${CONTRACT_ID}/clauses/${CLAUSE_ID}/proposals`)
      .set('Authorization', auth)
      .send({ reason: 'Motivo inicial.' });
    const id = created.body.id as string;

    const edited = await request(app)
      .put(`/contracts/proposals/${id}`)
      .set('Authorization', auth)
      .send({ proposed_text: 'El canon se reajusta cada dos años.', reason: 'Motivo ajustado.' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ proposed_text: 'El canon se reajusta cada dos años.', status: 'draft' });

    const accepted = await request(app)
      .put(`/contracts/proposals/${id}`)
      .set('Authorization', auth)
      .send({ action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('accepted');

    const lateEdit = await request(app)
      .put(`/contracts/proposals/${id}`)
      .set('Authorization', auth)
      .send({ reason: 'Tarde.' });
    expect(lateEdit.status).toBe(409);

    const listed = await request(app)
      .get(`/contracts/${CONTRACT_ID}/proposals`)
      .set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].status).toBe('accepted');

    const alienList = await request(app)
      .get(`/contracts/${CONTRACT_ID}/proposals`)
      .set('Authorization', `Bearer ${tokens(OTHER_ID)}`);
    expect(alienList.status).toBe(403);
  });

  it('exige analisis READY para proponer', async () => {
    const repository = new InMemoryContractRepository();
    const proposals = new InMemoryProposalsRepository();
    await repository.save(new Contract({
      id: 'contract-draft',
      ownerId: OWNER_ID,
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    }));
    const app = buildRouter(repository, proposals);
    const res = await request(app)
      .post('/contracts/contract-draft/clauses/any/proposals')
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`)
      .send({ reason: 'Motivo.' });
    expect(res.status).toBe(409);
  });
});
