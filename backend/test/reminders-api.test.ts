import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createContractRouter } from '../src/presentation/routes/contractRoutes';
import { UploadContractUseCase } from '../src/application/use-cases/UploadContractUseCase';
import { GenerateObjectionLetterUseCase } from '../src/application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from '../src/application/use-cases/DownloadObjectionLetterPdfUseCase';
import { UpdateObjectionLetterUseCase } from '../src/application/use-cases/UpdateObjectionLetterUseCase';
import { CreateReminderUseCase, CompleteReminderUseCase } from '../src/application/use-cases/ReminderUseCases';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryRemindersRepository } from '../src/infrastructure/repositories/RemindersRepositoryImpl';
import { PdfKitGenerator } from '../src/infrastructure/services/PdfKitGenerator';
import { FakeAIProvider } from '../src/infrastructure/ai/FakeAIProvider';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';
import { Contract } from '../src/domain/entities/Contract';

const OWNER_ID = 'reminder-owner';
const CONTRACT_ID = 'contract-reminders-1';
const FUTURE = '2026-12-01T15:00:00.000Z';

function tokens(id: string): string {
  return TokenService.generateTokens({ id, email: `${id}@example.test`, name: 'Reminder User' }).accessToken;
}

function buildRouter(
  repository: InMemoryContractRepository,
  reminders: InMemoryRemindersRepository,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/contracts', createContractRouter({
    contractRepository: repository,
    remindersRepository: reminders,
    createReminderUseCase: new CreateReminderUseCase(repository, reminders),
    completeReminderUseCase: new CompleteReminderUseCase(repository, reminders),
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

describe('Reminders API', () => {
  it('crea, deduplica, lista, completa y exporta .ics', async () => {
    const repository = new InMemoryContractRepository();
    const reminders = new InMemoryRemindersRepository();
    await repository.save(new Contract({
      id: CONTRACT_ID, ownerId: OWNER_ID, title: 'Lease', fileName: 'lease.pdf',
      contractType: 'LEASE', jurisdiction: 'CO', locale: 'es',
    }));
    const app = buildRouter(repository, reminders);
    const auth = `Bearer ${tokens(OWNER_ID)}`;
    const body = { title: 'Preaviso', due_at: FUTURE, timezone: 'America/Bogota' };

    const created = await request(app)
      .post(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', auth)
      .send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'Preaviso', status: 'pending', timezone: 'America/Bogota' });

    const duplicate = await request(app)
      .post(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', auth)
      .send(body);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);

    const listed = await request(app)
      .get(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);

    const ics = await request(app)
      .get(`/contracts/${CONTRACT_ID}/reminders.ics`)
      .set('Authorization', auth);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text).toContain('DTSTART;TZID=America/Bogota:20261201T100000');

    const done = await request(app)
      .put(`/contracts/reminders/${created.body.id as string}`)
      .set('Authorization', auth)
      .send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('done');
  });

  it('rechaza fechas ambiguas, zonas invalidas y ajenos', async () => {
    const repository = new InMemoryContractRepository();
    const reminders = new InMemoryRemindersRepository();
    await repository.save(new Contract({
      id: CONTRACT_ID, ownerId: OWNER_ID, title: 'Lease', fileName: 'lease.pdf',
      contractType: 'LEASE', jurisdiction: 'CO', locale: 'es',
    }));
    const app = buildRouter(repository, reminders);
    const auth = `Bearer ${tokens(OWNER_ID)}`;

    const ambiguous = await request(app)
      .post(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', auth)
      .send({ title: 'X', due_at: '2026-12-01 15:00:00', timezone: 'America/Bogota' });
    expect(ambiguous.status).toBe(422);

    const badZone = await request(app)
      .post(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', auth)
      .send({ title: 'X', due_at: FUTURE, timezone: 'Narnia/Cair' });
    expect(badZone.status).toBe(422);

    const alien = await request(app)
      .get(`/contracts/${CONTRACT_ID}/reminders`)
      .set('Authorization', `Bearer ${tokens('other-user')}`);
    expect(alien.status).toBe(403);
  });
});
