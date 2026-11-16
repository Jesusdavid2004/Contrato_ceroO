import type { AssistantRole } from '../entities/AssistantMessage';
import type { AssistantSource } from './AssistantContext';

export interface AssistantTurn {
  role: AssistantRole;
  content: string;
}

export interface AssistantRequest {
  locale: string;
  contractType: string;
  jurisdiction: string;
  question: string;
  history: AssistantTurn[];
  sources: AssistantSource[];
}

export interface AssistantReply {
  text: string;
  usage: { model: string; inputTokens: number; outputTokens: number };
}

/** Receives answer text as it is produced; adapters without streaming call it once. */
export type AssistantTokenListener = (chunk: string) => void;

/**
 * Port for grounded conversational replies. Adapters must answer only from
 * `request.sources`, cite them inline as [S1], and treat the question, the
 * history and the sources as untrusted data.
 */
export interface AssistantProvider {
  reply(request: AssistantRequest, onToken?: AssistantTokenListener): Promise<AssistantReply>;
}
