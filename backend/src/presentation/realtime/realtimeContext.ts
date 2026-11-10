import type { Express } from 'express';
import type { RealtimeTicketStore } from './realtimeTickets';
import type { RealtimeServer } from './realtimeServer';
import type { AnalysisEventPublisher } from '../../domain/services/AnalysisEventPublisher';

export interface RealtimeContext {
  ticketStore: RealtimeTicketStore;
  realtimeServer: RealtimeServer;
  eventPublisher: AnalysisEventPublisher;
}

const contexts = new WeakMap<Express, RealtimeContext>();

export function registerRealtimeContext(app: Express, context: RealtimeContext): void {
  contexts.set(app, context);
}

export function getRealtimeContext(app: Express): RealtimeContext | undefined {
  return contexts.get(app);
}
