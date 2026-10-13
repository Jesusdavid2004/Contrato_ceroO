import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFParse, VerbosityLevel } from 'pdf-parse';
import express from 'express';
import request from 'supertest';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { Clause } from '../src/domain/entities/Clause';
import { Contract } from '../src/domain/entities/Contract';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { ContractOwnershipError, NoFlaggedClausesError } from '../src/domain/exceptions/index';
import type { AIProvider, ObjectionLetterRequest } from '../src/domain/services/AIProvider';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';

const OWNER_ID = 'user-1';
const CONTRACT_ID = 'contract-letter';

function createContract(riskLevel: 'low' | 'medium' | 'high' = 'high'): Contract {
  return new Contract({
    id: CONTRACT_ID,
    ownerId: OWNER_ID,
    title: 'Arrendamiento de vivienda',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    status: 'READY',
    clauses: [
      new Clause({
        id: 'flagged-clause',
        contractId: CONTRACT_ID,
        orderIndex: 1,
        originalText: 'El proveedor puede cambiar el canon unilateralmente.',
        riskLevel,
        confidence: 0.95,
        plainExplanation: 'El cambio depende de una sola parte.',
        whyRisky: 'La otra parte no puede aceptar o rechazar el cambio.',
        legalBasis: [{ reference: 'Ley 1480 de 2011, artículo 38', summary: 'Prohíbe cambios unilaterales en adhesión de consumo.' }],
        suggestedChange: 'Exigir acuerdo escrito de ambas partes.',
      }),
      new Clause({
        id: 'ordinary-clause',
        contractId: CONTRACT_ID,
        orderIndex: 2,
        originalText: 'Las partes acuerdan notificar sus domicilios.',
        riskLevel: 'low',
        confidence: 0.98,
        plainExplanation: 'Se indican las direcciones de notificación.',
      }),
    ],
  });
}

function createProvider(content: string) {
  const generateObjectionLetter = vi.fn(async (_request: ObjectionLetterRequest) => content);
  const provider: AIProvider = {
    classifyClauses: async () => {
      throw new Error('Classification is not used when generating a letter.');
    },
    generateObjectionLetter,
  };
  return { provider, generateObjectionLetter };
}

describe('GenerateObjectionLetterUseCase', () => {
  it('sends only flagged clauses and persists the localized generated letter', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(createContract());
    const { provider, generateObjectionLetter } = createProvider(
      'Estimado/a [DESTINATARIO]:\nSolicito revisar la cláusula [REFERENCIA DEL CONTRATO].\n[SU NOMBRE]\n[FECHA]',
    );
    const useCase = new GenerateObjectionLetterUseCase(
      repository,
      provider,
      () => new Date('2026-10-13T12:00:00.000Z'),
    );

    const letter = await useCase.execute({ contractId: CONTRACT_ID, userId: OWNER_ID });

    expect(generateObjectionLetter).toHaveBeenCalledOnce();
    expect(generateObjectionLetter.mock.calls[0][0].flaggedClauses).toHaveLength(1);
    expect(generateObjectionLetter.mock.calls[0][0].flaggedClauses[0].id).toBe('flagged-clause');
    expect(letter.locale).toBe('es');
    expect(await repository.getObjectionLetter(CONTRACT_ID)).toBe(letter);
  });

  it('does not call AI or persist a letter when no clauses are flagged', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(createContract('low'));
    const { provider, generateObjectionLetter } = createProvider('not generated');
    const useCase = new GenerateObjectionLetterUseCase(repository, provider);

    await expect(useCase.execute({ contractId: CONTRACT_ID, userId: OWNER_ID }))
      .rejects.toBeInstanceOf(NoFlaggedClausesError);

    expect(generateObjectionLetter).not.toHaveBeenCalled();
    expect(await repository.getObjectionLetter(CONTRACT_ID)).toBeNull();
  });

  it('denies requests from users who do not own the contract', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(createContract());
    const { provider, generateObjectionLetter } = createProvider('letter');
    const useCase = new GenerateObjectionLetterUseCase(repository, provider);

    await expect(useCase.execute({ contractId: CONTRACT_ID, userId: 'other-user' }))
      .rejects.toBeInstanceOf(ContractOwnershipError);

    expect(generateObjectionLetter).not.toHaveBeenCalled();
  });
});

describe('Objection letter PDF', () => {
  let parser: PDFParse | undefined;

  afterEach(async () => {
    await parser?.destroy();
    parser = undefined;
  });

  it('downloads the persisted letter as a readable Spanish PDF', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(createContract());
    const content = 'Estimado/a [DESTINATARIO]:\nSolicito revisar la cláusula de renovación automática.\nAtentamente,\n[SU NOMBRE]\n[FECHA]';
    const { provider } = createProvider(content);
    await new GenerateObjectionLetterUseCase(repository, provider).execute({
      contractId: CONTRACT_ID,
      userId: OWNER_ID,
    });

    const download = new DownloadObjectionLetterPdfUseCase(repository, new PdfKitGenerator());
    const result = await download.execute({ contractId: CONTRACT_ID, userId: OWNER_ID });

    expect(result.contractTitle).toBe('Arrendamiento de vivienda');
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    parser = new PDFParse({
      data: new Uint8Array(result.buffer),
      verbosity: VerbosityLevel.ERRORS,
    });
    const extracted = await parser.getText();
    expect(extracted.text).toContain('[DESTINATARIO]');
    expect(extracted.text).toContain('renovación automática');
    expect(extracted.total).toBeGreaterThan(0);
  });

  it('serves authenticated generation and PDF download routes', async () => {
    const repository = new InMemoryContractRepository();
    await repository.save(createContract());
    const content = 'Estimado/a [DESTINATARIO]:\nSolicito revisar la cláusula.';
    const { provider, generateObjectionLetter } = createProvider(content);
    const app = express();
    app.use('/contracts', createContractRouter({
      contractRepository: repository,
      uploadContractUseCase: new UploadContractUseCase(repository, {
        store: async () => 'ephemeral://test',
        get: async () => null,
        delete: async () => undefined,
      }),
      generateObjectionLetterUseCase: new GenerateObjectionLetterUseCase(repository, provider),
      downloadObjectionLetterPdfUseCase: new DownloadObjectionLetterPdfUseCase(
        repository,
        new PdfKitGenerator(),
      ),
    }));
    app.use(errorHandler);
    const { accessToken } = TokenService.generateTokens({
      id: OWNER_ID,
      email: 'owner@example.test',
      name: 'Contract Owner',
    });

    const unauthorized = await request(app).post(`/contracts/${CONTRACT_ID}/letter`);
    expect(unauthorized.status).toBe(401);

    const generated = await request(app)
      .post(`/contracts/${CONTRACT_ID}/letter`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(generated.status).toBe(201);
    expect(generated.body.content).toBe(content);

    const downloaded = await request(app)
      .get(`/contracts/${CONTRACT_ID}/letter/pdf`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toContain('application/pdf');
    expect(downloaded.headers['content-disposition']).toContain('arrendamiento-de-vivienda.pdf');
    expect(downloaded.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(generateObjectionLetter).toHaveBeenCalledOnce();
  });
});
