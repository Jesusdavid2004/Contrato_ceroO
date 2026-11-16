import type {
  AnalysisEvent,
  AnalysisEventPublisher,
} from '../../domain/services/AnalysisEventPublisher';
import type { RealtimeServer } from '../../presentation/realtime/realtimeServer';

/**
 * Bus directo para modo pruebas/memoria: secuencia por contrato en memoria
 * y emite al servidor WebSocket. Semantica visible identica al outbox
 * duradero; sin persistencia (documentado como limite).
 */
export class InMemoryAnalysisEventBus implements AnalysisEventPublisher {
  private readonly sequences = new Map<string, number>();

  constructor(private readonly realtimeServer: RealtimeServer) {}

  public async publish(event: AnalysisEvent): Promise<void> {
    const next = (this.sequences.get(event.contractId) ?? -1) + 1;
    this.sequences.set(event.contractId, next);
    this.realtimeServer.publishContractEvent({
      contractId: event.contractId,
      jobId: event.jobId,
      type: event.type,
      sequence: next,
      payload: { ...event.payload },
      occurredAt: event.occurredAt,
    });
  }
}
