import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { LegalRadarScheduler } from '../src/infrastructure/legal/LegalRadarScheduler';
import type { RefreshLegalSourcesUseCase } from '../src/application/use-cases/RefreshLegalSourcesUseCase';
import {
  GetLegalRadarStatusUseCase,
  ListLegalUpdatesUseCase,
} from '../src/application/use-cases/LegalRadarQueries';
import { createLegalRadarRouter } from '../src/presentation/routes/legalRadarRoutes';
import { LegalUpdate } from '../src/domain/entities/LegalUpdate';
import { InMemoryLegalUpdatesRepository } from '../src/infrastructure/repositories/LegalUpdatesRepositoryImpl';
import { TokenService } from '../src/infrastructure/security/SecurityServices';
import { errorHandler } from '../src/shared/errors/errorHandler';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const auth = `Bearer ${TokenService.generateTokens({ id: 'u', email: 'u@example.test', name: 'U' }).accessToken}`;

function update(id: string, tema: string, detectedAt: Date): LegalUpdate {
  return new LegalUpdate({ id, sourceId: 's', tema, title: `Title ${id}`, sourceUrl: 'https://example.test', contentHash: id, detectedAt });
}

async function buildApp() {
  const repository = new InMemoryLegalUpdatesRepository();
  await repository.saveIfNew(update('a', 'arriendo', new Date('2026-11-10T00:00:00.000Z')));
  await repository.saveIfNew(update('b', 'consumo', new Date('2026-11-12T00:00:00.000Z')));
  await repository.saveIfNew(update('old', 'arriendo', new Date('2026-01-01T00:00:00.000Z')));
  await repository.saveSourceState({ sourceId: 'src-1', contentHash: 'h', checkedAt: NOW });
  const sources = [
    { id: 'src-1', kind: 'page' as const, tema: 'arriendo', title: 'Law', url: 'https://example.test/law' },
    { id: 'src-2', kind: 'feed' as const, tema: 'consumo', title: 'News', url: 'https://example.test/rss' },
  ];
  const app = express();
  app.use('/legal', createLegalRadarRouter({
    listUpdatesUseCase: new ListLegalUpdatesUseCase(repository, ['arriendo', 'consumo'], () => NOW),
    statusUseCase: new GetLegalRadarStatusUseCase(sources, repository),
  }));
  app.use(errorHandler);
  return app;
}

describe('legal radar routes', () => {
  it('requires authentication', async () => {
    const app = await buildApp();
    expect((await request(app).get('/legal/updates')).status).toBe(401);
  });

  it('lists recent updates newest first and excludes those outside the lookback window', async () => {
    const app = await buildApp();
    const res = await request(app).get('/legal/updates').set('Authorization', auth);
    expect(res.body.map((item: { source_id: string; tema: string }) => item.tema)).toEqual(['consumo', 'arriendo']);
  });

  it('filters by topic and returns an empty list for an unknown topic', async () => {
    const app = await buildApp();
    const arriendo = await request(app).get('/legal/updates?tema=arriendo').set('Authorization', auth);
    expect(arriendo.body).toHaveLength(1);
    const unknown = await request(app).get('/legal/updates?tema=laboral').set('Authorization', auth);
    expect(unknown.body).toEqual([]);
  });

  it('reports the last check per source and null for never-checked ones', async () => {
    const app = await buildApp();
    const res = await request(app).get('/legal/status').set('Authorization', auth);
    expect(res.body).toEqual([
      { id: 'src-1', tema: 'arriendo', title: 'Law', kind: 'page', last_checked_at: NOW.toISOString() },
      { id: 'src-2', tema: 'consumo', title: 'News', kind: 'feed', last_checked_at: null },
    ]);
  });
});

describe('LegalRadarScheduler', () => {
  it('does not start a second run while one is in progress', async () => {
    let release: () => void = () => undefined;
    const execute = vi.fn(() => new Promise((resolve) => { release = () => resolve({ checked: 0, newUpdates: 0, failed: 0, results: [] }); }));
    const scheduler = new LegalRadarScheduler({ execute } as unknown as RefreshLegalSourcesUseCase, 60);
    const first = scheduler.tick();
    expect(await scheduler.tick()).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('survives a crashing run and allows the next one', async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ checked: 1, newUpdates: 0, failed: 0, results: [] });
    const scheduler = new LegalRadarScheduler({ execute } as unknown as RefreshLegalSourcesUseCase, 60);
    expect(await scheduler.tick()).toBe(true);
    expect(await scheduler.tick()).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
