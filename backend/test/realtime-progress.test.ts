import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createApp } from '../src/app';
import { getRealtimeContext } from '../src/presentation/realtime/realtimeContext';
import { RealtimeServer } from '../src/presentation/realtime/realtimeServer';
import { InMemoryAnalysisEventBus } from '../src/infrastructure/realtime/InMemoryAnalysisEventBus';
import {
  parseServerEvent,
  type RealtimeEvent,
} from '../src/presentation/realtime/realtimeProtocol';
import { RealtimeTicketStore } from '../src/presentation/realtime/realtimeTickets';

function toEvent(data: unknown): RealtimeEvent {
  const text = typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
  return parseServerEvent(JSON.parse(text) as unknown);
}

describe('RealtimeTicketStore', () => {
  it('emite tickets de un solo uso con TTL', () => {
    const store = new RealtimeTicketStore();
    const issued = store.issue('user-1', 1_000);
    expect(issued.userId).toBe('user-1');
    expect(store.consume(issued.ticket, 2_000)).toBe('user-1');
    expect(store.consume(issued.ticket, 3_000)).toBeNull();
  });

  it('rechaza tickets vencidos', () => {
    const store = new RealtimeTicketStore();
    const issued = store.issue('user-1', 1_000);
    expect(store.consume(issued.ticket, 1_000 + RealtimeTicketStore.TICKET_TTL_MS + 1)).toBeNull();
  });
});

describe('InMemoryAnalysisEventBus', () => {
  it('secuencia por contrato y emite en orden', async () => {
    const ticketStore = new RealtimeTicketStore();
    const server = new RealtimeServer(ticketStore, async () => ({
      status: 'UPLOADED',
      failureMessageKey: null,
      globalRiskScore: 0,
    }));
    const httpServer = createServer();
    server.attach(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const testPort = (httpServer.address() as AddressInfo).port;
    try {
      const issued = ticketStore.issue('user-9');
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(
          `ws://127.0.0.1:${testPort}/api/realtime?ticket=${issued.ticket}`,
        );
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error('open timeout'));
        }, 5_000);
        socket.on('open', () => {
          clearTimeout(timer);
          resolve(socket);
        });
        socket.on('error', () => undefined);
      });
      const events: RealtimeEvent[] = [];
      ws.on('message', (data) => {
        events.push(toEvent(data));
      });
      const bus = new InMemoryAnalysisEventBus(server);
      try {
        ws.send(JSON.stringify({ action: 'subscribe', contractId: 'contract-1' }));
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('snapshot timeout')), 5_000);
          const check = setInterval(() => {
            if (events.some((event) => event.type === 'snapshot')) {
              clearTimeout(timer);
              clearInterval(check);
              resolve();
            }
          }, 20);
        });
        const at = new Date('2026-01-01T00:00:00.000Z');
        await bus.publish({
          contractId: 'contract-1', userId: 'user-9', jobId: 'contract-1',
          type: 'stage', payload: { status: 'ANALYZING' }, occurredAt: at,
        });
        await bus.publish({
          contractId: 'contract-1', userId: 'user-9', jobId: 'contract-1',
          type: 'completed', payload: { status: 'READY', globalRiskScore: 42 }, occurredAt: at,
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('events timeout')), 5_000);
          const check = setInterval(() => {
            if (events.filter((event) => event.type !== 'snapshot').length >= 2) {
              clearTimeout(timer);
              clearInterval(check);
              resolve();
            }
          }, 20);
        });
        const live = events.filter((event) => event.type !== 'snapshot');
        expect(live.map((event) => event.type)).toEqual(['stage', 'completed']);
        expect(live.map((event) => event.sequence)).toEqual([0, 1]);
        expect(live[1].payload).toMatchObject({ status: 'READY', globalRiskScore: 42 });
      } finally {
        ws.close();
      }
    } finally {
      await server.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});

describe('Progreso de analisis por WebSocket', () => {
  const app = createApp({ inMemory: true });
  let server: Server;
  let port = 0;

  let tokenA = '';
  let tokenB = '';

  const wsUrl = (ticket: string): string =>
    `ws://127.0.0.1:${port}/api/v1/realtime?ticket=${encodeURIComponent(ticket)}`;

  async function ticketFor(token: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/realtime/ticket')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(typeof res.body.ticket).toBe('string');
    return res.body.ticket as string;
  }

  function connect(ticket: string, origin?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = origin ? new WebSocket(wsUrl(ticket), [], { origin }) : new WebSocket(wsUrl(ticket));
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket open timeout'));
      }, 5_000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.on('error', () => {
        // Los rechazos de upgrade se afirman con unexpected-response.
      });
    });
  }

  function upgradeStatus(ticket: string | null, origin?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = ticket ? wsUrl(ticket) : `ws://127.0.0.1:${port}/api/v1/realtime`;
      const ws = origin ? new WebSocket(url, [], { origin }) : new WebSocket(url);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error('upgrade status timeout'));
        }
      }, 5_000);
      ws.on('unexpected-response', (_req, res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(res.statusCode ?? 0);
          ws.close();
        }
      });
      ws.on('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          reject(new Error('upgrade should have been rejected'));
        }
      });
      ws.on('error', () => {
        // Ignorado: el codigo real llega por unexpected-response.
      });
    });
  }

  function waitFor(
    events: RealtimeEvent[],
    predicate: (event: RealtimeEvent) => boolean,
    timeoutMs: number,
  ): Promise<RealtimeEvent> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const found = events.find(predicate);
        if (found) {
          clearInterval(timer);
          resolve(found);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error('event wait timeout'));
        }
      }, 50);
    });
  }

  beforeAll(async () => {
    const context = getRealtimeContext(app);
    expect(context).toBeDefined();
    server = createServer(app);
    context?.realtimeServer.attach(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;

    const suffix = Date.now();
    const resA = await request(app).post('/api/v1/auth/register').send({
      name: 'Rita Realtime',
      email: `rita_${suffix}@example.com`,
      password: 'Password123!',
    });
    expect(resA.status).toBe(201);
    tokenA = resA.body.accessToken as string;

    const resB = await request(app).post('/api/v1/auth/register').send({
      name: 'Bruno Otro',
      email: `bruno_${suffix}@example.com`,
      password: 'Password123!',
    });
    expect(resB.status).toBe(201);
    tokenB = resB.body.accessToken as string;
  });

  afterAll(async () => {
    await getRealtimeContext(app)?.realtimeServer.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('exige Bearer para emitir tickets', async () => {
    const res = await request(app).post('/api/v1/realtime/ticket');
    expect(res.status).toBe(401);
  });

  it('rechaza upgrade sin ticket con 401', async () => {
    await expect(upgradeStatus(null)).resolves.toBe(401);
  });

  it('rechaza tickets reutilizados con 401', async () => {
    const ticket = await ticketFor(tokenA);
    const first = await connect(ticket);
    first.close();
    await expect(upgradeStatus(ticket)).resolves.toBe(401);
  });

  it('rechaza origen fuera de la allowlist con 403', async () => {
    const ticket = await ticketFor(tokenA);
    await expect(upgradeStatus(ticket, 'https://evil.example')).resolves.toBe(403);
  });

  it('responde pong al ping de aplicacion', async () => {
    const events: RealtimeEvent[] = [];
    const ws = await connect(await ticketFor(tokenA));
    ws.on('message', (data) => {
      events.push(toEvent(data));
    });
    try {
      ws.send(JSON.stringify({ action: 'ping' }));
      const pong = await waitFor(events, (event) => event.type === 'pong', 5_000);
      expect(pong.schemaVersion).toBe(1);
    } finally {
      ws.close();
    }
  });

  it('aisla suscripciones entre usuarios y publica el avance real', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const upload = await request(app)
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('contract_type', 'LEASE')
      .field('jurisdiction', 'CO')
      .field('locale', 'es')
      .attach('contract', pdf, 'lease.pdf');
    expect(upload.status).toBe(201);
    const contractId = upload.body.id as string;

    // Usuario B no puede suscribirse al contrato de A.
    const eventsB: RealtimeEvent[] = [];
    const wsB = await connect(await ticketFor(tokenB));
    wsB.on('message', (data) => {
      eventsB.push(toEvent(data));
    });
    try {
      wsB.send(JSON.stringify({ action: 'subscribe', contractId }));
      const forbidden = await waitFor(eventsB, (event) => event.type === 'error', 5_000);
      expect(forbidden.contractId).toBe(contractId);
      expect((forbidden.payload as { code: string }).code).toBe('FORBIDDEN');
    } finally {
      wsB.close();
    }

    // Usuario A recibe snapshot y concilia el estado terminal real del worker.
    const eventsA: RealtimeEvent[] = [];
    const wsA = await connect(await ticketFor(tokenA));
    wsA.on('message', (data) => {
      eventsA.push(toEvent(data));
    });
    try {
      wsA.send(JSON.stringify({ action: 'subscribe', contractId }));
      const snapshot = await waitFor(eventsA, (event) => event.type === 'snapshot', 5_000);
      expect(snapshot.contractId).toBe(contractId);
      expect(snapshot.jobId).toBe(contractId);
      expect(snapshot.sequence).toBe(0);

      const snapshotStatus = (snapshot.payload as { status: string }).status;
      if (snapshotStatus === 'READY' || snapshotStatus === 'FAILED') {
        // El analisis termino antes de suscribirse: el snapshot es la
        // evidencia y se concilia por HTTP (sin replay en el bus).
        const status = await request(app)
          .get(`/api/v1/contracts/${contractId}/status`)
          .set('Authorization', `Bearer ${tokenA}`);
        expect(status.body.status).toBe(snapshotStatus);
      } else {
        const terminal = await waitFor(
          eventsA,
          (event) => event.type === 'completed' || event.type === 'failed',
          25_000,
        );
        expect(terminal.jobId).toBe(contractId);
      }

      const ordered = eventsA.filter(
        (event) => event.jobId === contractId
          && (event.type === 'stage' || event.type === 'completed' || event.type === 'failed'),
      );
      for (let index = 1; index < ordered.length; index += 1) {
        expect(ordered[index].sequence).toBeGreaterThan(ordered[index - 1].sequence);
      }
    } finally {
      wsA.close();
    }
  }, 30_000);

  it('suscribirse a un contrato inexistente responde NOT_FOUND', async () => {
    const events: RealtimeEvent[] = [];
    const ws = await connect(await ticketFor(tokenA));
    ws.on('message', (data) => {
      events.push(toEvent(data));
    });
    try {
      ws.send(JSON.stringify({ action: 'subscribe', contractId: 'contract-missing' }));
      const error = await waitFor(events, (event) => event.type === 'error', 5_000);
      expect((error.payload as { code: string }).code).toBe('NOT_FOUND');
    } finally {
      ws.close();
    }
  });

  it('borrar la cuenta cierra sus conexiones con 4401', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Tomas Temporal',
      email: `tomas_${Date.now()}@example.com`,
      password: 'Password123!',
    });
    expect(res.status).toBe(201);
    const token = res.body.accessToken as string;

    const ws = await connect(await ticketFor(token));
    const closed = new Promise<number>((resolve) => {
      ws.on('close', (code: number) => resolve(code));
    });
    const del = await request(app)
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    await expect(closed).resolves.toBe(4401);
  });
});
