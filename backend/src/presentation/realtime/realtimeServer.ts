import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  REALTIME_SCHEMA_VERSION,
  clientMessageSchema,
  type RealtimeEvent,
} from './realtimeProtocol';
import type { RealtimeTicketStore } from './realtimeTickets';
import { logger } from '../../shared/logger';

export interface OwnedContractSnapshot {
  status: 'UPLOADED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED';
  failureMessageKey: string | null;
  globalRiskScore: number;
}

/** Retorna el contrato si pertenece al usuario, 'forbidden' o null. */
export type LoadOwnedContract = (
  userId: string,
  contractId: string,
) => Promise<OwnedContractSnapshot | 'forbidden' | null>;

export interface RealtimeServerOptions {
  paths?: string[];
  allowedOrigins?: string[];
  maxConnectionsPerUser?: number;
  maxSubscriptionsPerConnection?: number;
  maxMessagesPerMinute?: number;
  maxMessageChars?: number;
  heartbeatIntervalMs?: number;
  slowConsumerBytes?: number;
  now?: () => number;
}

interface ConnectionState {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;
  isAlive: boolean;
  windowStart: number;
  messageCount: number;
  connectedAt: number;
}

/**
 * Servidor WebSocket de progreso de analisis. Solo transporte,
 * autenticacion y suscripciones: la secuencia y persistencia de eventos
 * las own el bus/outbox, el estado definitivo vive en PostgreSQL.
 */
export class RealtimeServer {
  private wss: WebSocketServer | null = null;
  private readonly connections = new Set<ConnectionState>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private readonly paths: string[];
  private readonly allowedOrigins: string[];
  private readonly maxConnectionsPerUser: number;
  private readonly maxSubscriptionsPerConnection: number;
  private readonly maxMessagesPerMinute: number;
  private readonly maxMessageChars: number;
  private readonly heartbeatIntervalMs: number;
  private readonly slowConsumerBytes: number;
  private readonly now: () => number;

  constructor(
    private readonly ticketStore: RealtimeTicketStore,
    private readonly loadOwnedContract: LoadOwnedContract,
    options: RealtimeServerOptions = {},
  ) {
    this.paths = options.paths ?? ['/api/v1/realtime', '/api/realtime'];
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.maxConnectionsPerUser = options.maxConnectionsPerUser ?? 10;
    this.maxSubscriptionsPerConnection = options.maxSubscriptionsPerConnection ?? 20;
    this.maxMessagesPerMinute = options.maxMessagesPerMinute ?? 30;
    this.maxMessageChars = options.maxMessageChars ?? 4096;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    this.slowConsumerBytes = options.slowConsumerBytes ?? 1024 * 1024;
    this.now = options.now ?? Date.now;
  }

  public attach(httpServer: HttpServer): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: this.maxMessageChars });
    httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handleUpgrade(req, socket, head);
    });
    this.heartbeatTimer = setInterval(() => {
      for (const state of this.connections) {
        if (state.ws.readyState !== WebSocket.OPEN) continue;
        if (!state.isAlive) {
          state.ws.close(4408, 'stale connection');
          continue;
        }
        state.isAlive = false;
        state.ws.ping();
      }
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }

  /** Emite un evento ya secuenciado a los suscriptos. Retorna entregados. */
  public broadcast(contractId: string, event: RealtimeEvent): number {
    let delivered = 0;
    const serialized = JSON.stringify(event);
    for (const state of [...this.connections]) {
      if (!state.subscriptions.has(contractId)) continue;
      if (state.ws.readyState !== WebSocket.OPEN) continue;
      if (state.ws.bufferedAmount > this.slowConsumerBytes) {
        state.ws.close(4411, 'slow consumer');
        this.connections.delete(state);
        continue;
      }
      state.ws.send(serialized, (error?: Error) => {
        if (error) {
          logger.warn('Realtime send failed', { errorName: error.name });
        }
      });
      delivered += 1;
    }
    return delivered;
  }

  public closeUserConnections(userId: string, reason = 'account deleted'): number {
    let closed = 0;
    for (const state of this.connections) {
      if (state.userId !== userId) continue;
      state.ws.close(4401, reason);
      closed += 1;
    }
    return closed;
  }

  public connectionCount(): number {
    return this.connections.size;
  }

  public async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const state of this.connections) {
      try {
        state.ws.close(1001, 'server shutting down');
      } catch {
        // ignore: el socket ya puede estar cerrado
      }
    }
    this.connections.clear();
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
      this.wss = null;
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    if (!this.wss) {
      socket.destroy();
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? '', 'http://localhost');
    } catch {
      this.rejectUpgrade(socket, 400);
      return;
    }
    if (!this.paths.includes(url.pathname)) {
      // No es nuestra ruta: se deja al resto de manejadores/servidor.
      return;
    }
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.includes(origin)) {
      this.rejectUpgrade(socket, 403);
      return;
    }
    const ticket = url.searchParams.get('ticket');
    const userId = ticket ? this.ticketStore.consume(ticket, this.now()) : null;
    if (!userId) {
      this.rejectUpgrade(socket, 401);
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.registerConnection(ws, userId);
    });
  }

  private rejectUpgrade(socket: Socket, status: number): void {
    socket.write(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private registerConnection(ws: WebSocket, userId: string): void {
    const owned = [...this.connections]
      .filter((state) => state.userId === userId)
      .sort((a, b) => a.connectedAt - b.connectedAt);
    while (owned.length >= this.maxConnectionsPerUser) {
      const oldest = owned.shift();
      if (!oldest) break;
      oldest.ws.close(4401, 'replaced by a newer connection');
      this.connections.delete(oldest);
    }
    const state: ConnectionState = {
      ws,
      userId,
      subscriptions: new Set<string>(),
      isAlive: true,
      windowStart: this.now(),
      messageCount: 0,
      connectedAt: this.now(),
    };
    this.connections.add(state);
    ws.on('message', (data: unknown) => {
      void this.handleMessage(state, data);
    });
    ws.on('pong', () => {
      state.isAlive = true;
    });
    ws.on('close', () => {
      this.connections.delete(state);
    });
    ws.on('error', (error: Error) => {
      logger.warn('Realtime connection error', { errorName: error.name });
    });
  }

  private async handleMessage(state: ConnectionState, data: unknown): Promise<void> {
    if (state.ws.readyState !== WebSocket.OPEN) return;
    const now = this.now();
    if (now - state.windowStart >= 60_000) {
      state.windowStart = now;
      state.messageCount = 0;
    }
    state.messageCount += 1;
    if (state.messageCount > this.maxMessagesPerMinute) {
      this.sendError(state, 'RATE_LIMITED', 'errors.realtime_rate_limited');
      state.ws.close(4409, 'rate limited');
      return;
    }
    const text = this.toText(data);
    if (text === null || text.length > this.maxMessageChars) {
      this.sendError(state, 'MESSAGE_TOO_LARGE', 'errors.realtime_message_too_large');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      this.sendError(state, 'INVALID_MESSAGE', 'errors.realtime_invalid_message');
      return;
    }
    const message = clientMessageSchema.safeParse(parsed);
    if (!message.success) {
      this.sendError(state, 'INVALID_MESSAGE', 'errors.realtime_invalid_message');
      return;
    }
    switch (message.data.action) {
      case 'ping':
        this.sendEvent(state, {
          type: 'pong',
          sequence: 0,
          payload: {},
        });
        return;
      case 'unsubscribe':
        state.subscriptions.delete(message.data.contractId);
        return;
      case 'subscribe': {
        const contractId = message.data.contractId;
        let owned: OwnedContractSnapshot | 'forbidden' | null;
        try {
          owned = await this.loadOwnedContract(state.userId, contractId);
        } catch {
          this.sendError(state, 'NOT_FOUND', 'errors.contract_not_found', contractId);
          return;
        }
        if (owned === null) {
          this.sendError(state, 'NOT_FOUND', 'errors.contract_not_found', contractId);
          return;
        }
        if (owned === 'forbidden') {
          this.sendError(state, 'FORBIDDEN', 'errors.contract_forbidden', contractId);
          return;
        }
        if (!state.subscriptions.has(contractId)
          && state.subscriptions.size >= this.maxSubscriptionsPerConnection) {
          this.sendError(state, 'SUBSCRIPTION_LIMIT', 'errors.realtime_subscription_limit', contractId);
          return;
        }
        state.subscriptions.add(contractId);
        this.sendEvent(state, {
          type: 'snapshot',
          contractId,
          jobId: contractId,
          sequence: 0,
          payload: {
            status: owned.status,
            failureMessageKey: owned.failureMessageKey,
          },
        });
        return;
      }
    }
  }

  private toText(data: unknown): string | null {
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (Array.isArray(data)) {
      const parts = data.filter((part): part is Buffer => Buffer.isBuffer(part));
      if (parts.length !== data.length) return null;
      return Buffer.concat(parts).toString('utf8');
    }
    return null;
  }

  private sendEvent(state: ConnectionState, event: {
    type: RealtimeEvent['type'];
    contractId?: string;
    jobId?: string;
    sequence: number;
    payload: Record<string, unknown>;
  }): void {
    if (state.ws.readyState !== WebSocket.OPEN) return;
    const envelope: RealtimeEvent = {
      eventId: randomUUID(),
      schemaVersion: REALTIME_SCHEMA_VERSION,
      type: event.type,
      contractId: event.contractId,
      jobId: event.jobId,
      sequence: event.sequence,
      occurredAt: new Date(this.now()).toISOString(),
      payload: event.payload,
    };
    state.ws.send(JSON.stringify(envelope), (error?: Error) => {
      if (error) logger.warn('Realtime send failed', { errorName: error.name });
    });
  }

  private sendError(
    state: ConnectionState,
    code: string,
    messageKey: string,
    contractId?: string,
  ): void {
    this.sendEvent(state, {
      type: 'error',
      contractId,
      sequence: 0,
      payload: { code, messageKey },
    });
  }
}
