import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { AnalyzeContractUseCase } from '../src/application/use-cases/AnalyzeContractUseCase';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryAIUsageRepository } from '../src/infrastructure/repositories/AIUsageRepositoryImpl';
import { InMemoryAIClassificationCache } from '../src/infrastructure/services/InMemoryAIClassificationCache';
import { InMemoryStaging } from '../src/infrastructure/staging/InMemoryStaging';
import { stagingUriFor } from '../src/domain/services/AnalysisStaging';
import { Contract } from '../src/domain/entities/Contract';
import { StagingExpiredError } from '../src/domain/exceptions/index';

function testProvider() {
  return {
    classifyClauses: async (input: { clauses: Array<{ id: string; text: string }> }) => ({
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
  };
}

function createUseCase(
  repository: InMemoryContractRepository,
  staging: InMemoryStaging,
): AnalyzeContractUseCase {
  return new AnalyzeContractUseCase(
    repository,
    { extractText: async () => 'Clause one grants a right. Clause two sets a price.' },
    {
      segment: async () => [
        { orderIndex: 1, text: 'Clause one grants a right.', startOffset: 0, endOffset: 26 },
        { orderIndex: 2, text: 'Clause two sets a price.', startOffset: 27, endOffset: 52 },
      ],
    },
    testProvider(),
    new InMemoryAIUsageRepository(),
    new InMemoryAIClassificationCache(),
    () => new Date('2026-11-10T00:00:00.000Z'),
    undefined,
    undefined,
    staging,
  );
}

describe('Staging wiring', () => {
  it('el worker lee del staging y lo borra al terminar', async () => {
    const repository = new InMemoryContractRepository();
    const staging = new InMemoryStaging();
    const contract = new Contract({
      id: 'contract-staged',
      ownerId: 'user-1',
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);
    await staging.stage(contract.id, { buffer: Buffer.from('bytes'), mimeType: 'application/pdf' }, 60_000);

    await createUseCase(repository, staging).execute({
      contractId: contract.id,
      userId: contract.ownerId,
      stagingKey: contract.id,
      mimeType: 'application/pdf',
    });

    expect((await repository.findById(contract.id))?.status).toBe('READY');
    expect(await staging.fetch(stagingUriFor(contract.id))).toBeNull();
  });

  it('staging vencido marca FAILED con clave propia sin consumir el analisis', async () => {
    const repository = new InMemoryContractRepository();
    const staging = new InMemoryStaging();
    const contract = new Contract({
      id: 'contract-expired',
      ownerId: 'user-1',
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
    });
    await repository.save(contract);

    await expect(createUseCase(repository, staging).execute({
      contractId: contract.id,
      userId: contract.ownerId,
      stagingKey: contract.id,
      mimeType: 'application/pdf',
    })).rejects.toBeInstanceOf(StagingExpiredError);

    const failed = await repository.findById(contract.id);
    expect(failed?.status).toBe('FAILED');
    expect(failed?.failureReason).toBe('errors.staging_expired');
  });

  it('la subida pasa por staging: sin bytes el fallo seria staging_expired', async () => {
    const app = createApp({ inMemory: true });
    const reg = await request(app).post('/api/v1/auth/register').send({
      name: 'Staging Route',
      email: `staging_${Date.now()}@example.com`,
      password: 'Password123!',
    });
    expect(reg.status).toBe(201);
    const token = reg.body.accessToken as string;

    const upload = await request(app)
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${token}`)
      .field('locale', 'es')
      .attach('contract', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'c.pdf');
    expect(upload.status).toBe(201);

    const terminal = await new Promise<{ status: string; failure_message_key: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('terminal timeout')), 20_000);
      const poll = setInterval(() => {
        void request(app)
          .get(`/api/v1/contracts/${upload.body.id as string}/status`)
          .set('Authorization', `Bearer ${token}`)
          .then((res) => {
            const body = res.body as { status: string; failure_message_key: string | null };
            if (body.status === 'READY' || body.status === 'FAILED') {
              clearTimeout(timer);
              clearInterval(poll);
              resolve(body);
            }
          });
      }, 200);
    });
    // El PDF basura falla en extraccion: si el staging no entregara bytes,
    // la clave seria errors.staging_expired en su lugar.
    expect(terminal.status).toBe('FAILED');
    expect(terminal.failure_message_key).toBe('errors.text_extraction_failed');
  }, 25_000);
});
