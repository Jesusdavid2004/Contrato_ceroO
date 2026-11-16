import type {
  AnalysisStaging,
  FetchedStagedAnalysis,
  StagedAnalysisInput,
  StagedAnalysisRef,
} from '../../domain/services/AnalysisStaging';
import { stagingUriFor } from '../../domain/services/AnalysisStaging';

/** Staging en memoria para pruebas: misma semantica, sin disco. */
export class InMemoryStaging implements AnalysisStaging {
  private readonly entries = new Map<string, { buffer: Buffer; mimeType: string; expiresAt: number }>();

  public async stage(key: string, input: StagedAnalysisInput, ttlMs: number): Promise<StagedAnalysisRef> {
    const uri = stagingUriFor(key);
    const expiresAt = new Date(Date.now() + ttlMs);
    this.entries.set(uri, {
      buffer: Buffer.from(input.buffer),
      mimeType: input.mimeType,
      expiresAt: expiresAt.getTime(),
    });
    return { uri, expiresAt };
  }

  public async fetch(uri: string): Promise<FetchedStagedAnalysis | null> {
    const entry = this.entries.get(uri);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(uri);
      return null;
    }
    return { buffer: Buffer.from(entry.buffer), mimeType: entry.mimeType };
  }

  public async remove(uri: string): Promise<void> {
    this.entries.delete(uri);
  }

  public async purgeExpired(now: Date = new Date()): Promise<number> {
    let purged = 0;
    for (const [uri, entry] of this.entries) {
      if (entry.expiresAt <= now.getTime()) {
        this.entries.delete(uri);
        purged += 1;
      }
    }
    return purged;
  }
}
