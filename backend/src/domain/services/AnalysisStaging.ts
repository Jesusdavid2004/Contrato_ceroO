/**
 * Staging temporal privado para bytes de analisis. Existe porque la cola
 * duradera necesita los bytes despues de un reinicio: no es conservacion
 * permanente (eso sigue gobernado por CONTRACT_FILE_RETENTION) sino un
 * area cifrada con TTL y borrado al terminar o al vencer.
 */
export interface StagedAnalysisInput {
  buffer: Buffer;
  mimeType: string;
}

export interface StagedAnalysisRef {
  uri: string;
  expiresAt: Date;
}

export interface FetchedStagedAnalysis {
  buffer: Buffer;
  mimeType: string;
}

export interface AnalysisStaging {
  stage(key: string, input: StagedAnalysisInput, ttlMs: number): Promise<StagedAnalysisRef>;
  fetch(uri: string): Promise<FetchedStagedAnalysis | null>;
  remove(uri: string): Promise<void>;
  purgeExpired(now?: Date): Promise<number>;
}

export function stagingUriFor(key: string): string {
  return `staging:${key}`;
}
