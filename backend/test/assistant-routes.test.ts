import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAssistantRouter } from '../src/presentation/routes/assistantRoutes';
import { AskAssistantUseCase } from '../src/application/use-cases/AskAssistantUseCase';
import {
  ClearAssistantConversationUseCase,
  ListAssistantMessagesUseCase,
} from '../src/application/use-cases/AssistantHistoryUseCases';
import { GetContractGuidanceUseCase } from '../src/application/use-cases/GetContractGuidanceUseCase';
import { Clause } from '../src/domain/entities/Clause';
import { Contract } from '../src/domain/entities/Contract';
import { ExtractiveAssistantProvider } from '../src/infrastructure/ai/ExtractiveAssistantProvider';
import { InMemoryAssistantConversationRepository } from '../src/infrastructure/repositories/AssistantConversationRepositoryImpl';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { InMemoryRemindersRepository } from '../src/infrastructure/repositories/RemindersRepositoryImpl';
import { InMemoryLegalUpdatesRepository } from '../src/infrastructure/repositories/LegalUpdatesRepositoryImpl';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';

const OWNER = 'assistant-owner';
const CONTRACT_ID = 'assistant-contract';

function bearer(userId: string): string {
  return `Bearer ${TokenService.generateTokens({ id: userId, email: `${userId}@example.test`, name: 'A' }).accessToken}`;
}

async function buildApp(dailyLimit = 100): Promise<express.Express> {
  const contracts = new InMemoryContractRepository();
  const contract = new Contract({
    id: CONTRACT_ID, ownerId: OWNER, title: 'Lease', fileName: 'l.pdf', contractType: 'LEASE',
    jurisdiction: 'CO', locale: 'es',
    clauses: [new Clause({
      id: 'k1', orderIndex: 1, originalText: 'El canon mensual aumenta cada mes sin limite.',
      riskLevel: 'high', confidence: 0.9, plainExplanation: 'Aumento ilimitado del canon mensual.',
    })],
  });
  contract.markReady();
  await contracts.save(contract);
  const facts = new InMemoryFactsRepository();
  const conversations = new InMemoryAssistantConversationRepository();
  const updates = new InMemoryLegalUpdatesRepository();
  const app = express();
  app.use(express.json());
  app.use('/contracts', createAssistantRouter({
    askAssistantUseCase: new AskAssistantUseCase(
      contracts, facts, conversations, new ExtractiveAssistantProvider(), dailyLimit, undefined, updates,
    ),
    listMessagesUseCase: new ListAssistantMessagesUseCase(contracts, conversations),
    clearConversationUseCase: new ClearAssistantConversationUseCase(contracts, conversations),
    getGuidanceUseCase: new GetContractGuidanceUseCase(contracts, facts, new InMemoryRemindersRepository(), updates),
  }));
  app.use(errorHandler);
  return app;
}

describe('assistant routes', () => {
  let app: express.Express;
  beforeEach(async () => { app = await buildApp(); });

  const ask = (question: string, userId = OWNER, accept = 'application/json') =>
    request(app)
      .post(`/contracts/${CONTRACT_ID}/assistant/messages`)
      .set('Authorization', bearer(userId))
      .set('Accept', accept)
      .send({ question });

  it('answers a question as JSON with citations from the contract', async () => {
    const res = await ask('El canon mensual puede aumentar cada mes?');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('assistant');
    expect(res.body.grounded).toBe(true);
    expect(res.body.citations[0].source_id).toBe('S1');
  });

  it('streams token and done events when the client accepts text/event-stream', async () => {
    const res = await ask('El canon mensual puede aumentar?', OWNER, 'text/event-stream').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: token');
    expect(res.text).toContain('event: done');
  });

  it('returns a normal 403 for a stranger even when asking for a stream', async () => {
    const res = await ask('canon', 'stranger', 'text/event-stream');
    expect(res.status).toBe(403);
    expect(res.body.message_key).toBe('errors.forbidden');
  });

  it('rejects empty and oversized questions with a validation error', async () => {
    expect((await ask('   ')).status).toBe(422);
    expect((await ask('x'.repeat(1001))).status).toBe(422);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post(`/contracts/${CONTRACT_ID}/assistant/messages`).send({ question: 'hola' });
    expect(res.status).toBe(401);
  });

  it('returns 429 with a translatable key once the daily quota is used', async () => {
    app = await buildApp(1);
    await ask('canon mensual');
    const res = await ask('canon mensual otra vez');
    expect(res.status).toBe(429);
    expect(res.body.message_key).toBe('errors.assistant_quota_exceeded');
  });

  it('lists and then clears the conversation', async () => {
    await ask('canon mensual');
    const list = await request(app).get(`/contracts/${CONTRACT_ID}/assistant/messages`).set('Authorization', bearer(OWNER));
    expect(list.body).toHaveLength(2);
    const cleared = await request(app).delete(`/contracts/${CONTRACT_ID}/assistant/messages`).set('Authorization', bearer(OWNER));
    expect(cleared.body.removed).toBe(2);
    const empty = await request(app).get(`/contracts/${CONTRACT_ID}/assistant/messages`).set('Authorization', bearer(OWNER));
    expect(empty.body).toEqual([]);
  });

  it('serves the guidance plan and narration in snake_case with message keys only', async () => {
    const res = await request(app).get(`/contracts/${CONTRACT_ID}/guidance`).set('Authorization', bearer(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.steps[0]).toMatchObject({ kind: 'resolve_high_risk_clause', clause_id: 'k1' });
    expect(res.body.narration[0].message_key).toBe('assistant.narration.intro_high');
    expect(res.body.narration.at(-1).message_key).toBe('assistant.disclaimer');
  });
});
