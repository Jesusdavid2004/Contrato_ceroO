/**
 * Puerto de publicacion de eventos de analisis. El estado definitivo vive
 * en PostgreSQL; el publicador solo avisa (identificadores + estado) para
 * que los suscriptos del socket pidan el detalle por HTTP.
 */
export type AnalysisEventType = 'stage' | 'completed' | 'failed' | 'notification';

export interface AnalysisEventPayload {
  status?: string;
  failureMessageKey?: string | null;
  globalRiskScore?: number;
  kind?: string;
  messageKey?: string;
}

export interface AnalysisEvent {
  contractId: string;
  userId: string;
  jobId: string;
  type: AnalysisEventType;
  payload: AnalysisEventPayload;
  occurredAt: Date;
}

export interface AnalysisEventPublisher {
  publish(event: AnalysisEvent): Promise<void>;
}
