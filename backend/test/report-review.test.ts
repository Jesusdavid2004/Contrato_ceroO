import { describe, it, expect } from 'vitest';
import { PDFParse, VerbosityLevel } from 'pdf-parse';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { GenerateCaseReportUseCase } from '../src/application/use-cases/ReportUseCases';
import { RequestReviewUseCase, UpdateReviewUseCase } from '../src/application/use-cases/ReviewUseCases';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { InMemoryReviewRequestsRepository } from '../src/infrastructure/repositories/ReviewRequestsRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import { ObjectionLetter } from '../src/domain/entities/ObjectionLetter';

const OWNER_ID = 'report-owner';
const CONTRACT_ID = 'contract-report-1';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Report User' }).accessToken;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: VerbosityLevel.ERRORS });
  const result = await parser.getText();
  return result.text;
}

describe('Case report and human review', () => {
  it('genera expediente con secciones y pie no-legal', async () => {
    const repository = new InMemoryContractRepository();
    const facts = new InMemoryFactsRepository();
    const contract = new Contract({
      id: CONTRACT_ID,
      ownerId: OWNER_ID,
      title: 'Arrendamiento',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      clauses: [
        new Clause({
          id: 'rep-clause-1', orderIndex: 1, originalText: 'El canon sube cada mes sin aviso.',
          riskLevel: 'high', confidence: 0.9, plainExplanation: 'Reajuste unilateral.',
          legalBasis: [{ reference: 'Ley 820', summary: 'Resumen', sourceUrl: 'https://example.test/ley' }],
        }),
      ],
    });
    contract.markReady();
    await repository.save(contract);
    await facts.saveFacts(CONTRACT_ID, [
      { key: 'amount', value: '100', status: 'confirmed', evidenceClauseId: 'rep-clause-1', evidenceQuote: 'cien' },
    ]);
    await repository.saveObjectionLetter(new ObjectionLetter({
      contractId: CONTRACT_ID, locale: 'es', content: 'Carta de prueba.',
    }));

    const app = express();
    app.use(express.json());
    app.use('/contracts', createContractRouter({
      contractRepository: repository,
      factsRepository: facts,
      generateCaseReportUseCase: new GenerateCaseReportUseCase(repository, new PdfKitGenerator(), facts),
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

    const res = await request(app)
      .get(`/contracts/${CONTRACT_ID}/report.pdf`)
      .set('Authorization', `Bearer ${tokens(OWNER_ID)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');

    const text = await extractPdfText(Buffer.from(res.body as ArrayBuffer));
    for (const expected of ['Expediente', 'Hallazgos', 'Datos confirmados', 'Fuentes', 'no asesoría legal', 'experimental']) {
      expect(text, expected).toContain(expected);
    }

    const alien = await request(app)
      .get(`/contracts/${CONTRACT_ID}/report.pdf`)
      .set('Authorization', `Bearer ${tokens('other-user')}`);
    expect(alien.status).toBe(403);
  });

  it('prepara revision pendiente sin simular pericia', async () => {
    const repository = new InMemoryContractRepository();
    const reviews = new InMemoryReviewRequestsRepository();
    await repository.save(new Contract({
      id: CONTRACT_ID, ownerId: OWNER_ID, title: 'Lease', fileName: 'lease.pdf',
      contractType: 'LEASE', jurisdiction: 'CO', locale: 'es',
    }));

    const app = express();
    app.use(express.json());
    app.use('/contracts', createContractRouter({
      contractRepository: repository,
      reviewsRepository: reviews,
      requestReviewUseCase: new RequestReviewUseCase(repository, reviews),
      updateReviewUseCase: new UpdateReviewUseCase(repository, reviews),
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
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const opened = await request(app)
      .post(`/contracts/${CONTRACT_ID}/review-request`)
      .set('Authorization', auth)
      .send({ note: 'Revisar deposito.' });
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ status: 'pending' });

    const duplicate = await request(app)
      .post(`/contracts/${CONTRACT_ID}/review-request`)
      .set('Authorization', auth)
      .send({});
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(opened.body.id);

    const latest = await request(app)
      .get(`/contracts/${CONTRACT_ID}/review-request`)
      .set('Authorization', auth);
    expect(latest.status).toBe(200);
    expect(latest.body.status).toBe('pending');

    const id = opened.body.id as string;
    const inReview = await request(app)
      .put(`/contracts/review-requests/${id}`)
      .set('Authorization', auth)
      .send({ status: 'in_review' });
    expect(inReview.status).toBe(200);

    const reviewed = await request(app)
      .put(`/contracts/review-requests/${id}`)
      .set('Authorization', auth)
      .send({ status: 'reviewed' });
    expect(reviewed.status).toBe(200);

    const backward = await request(app)
      .put(`/contracts/review-requests/${id}`)
      .set('Authorization', auth)
      .send({ status: 'in_review' });
    expect(backward.status).toBe(409);

    const alien = await request(app)
      .get(`/contracts/${CONTRACT_ID}/review-request`)
      .set('Authorization', `Bearer ${tokens('other-user')}`);
    expect(alien.status).toBe(403);
  });
});
