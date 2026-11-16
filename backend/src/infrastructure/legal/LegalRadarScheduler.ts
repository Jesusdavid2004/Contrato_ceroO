import type { RefreshLegalSourcesUseCase } from '../../application/use-cases/RefreshLegalSourcesUseCase';
import { logger } from '../../shared/logger';

const MS_PER_MINUTE = 60_000;
export const RADAR_STARTUP_DELAY_MS = 15_000;

/**
 * Runs the legal radar on a fixed interval inside the API process.
 * Runs never overlap (a slow run delays the next tick) and never throw: the
 * use case already isolates per-source failures.
 */
export class LegalRadarScheduler {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly useCase: RefreshLegalSourcesUseCase,
    private readonly intervalMinutes: number,
  ) {}

  public start(): void {
    if (this.timer) return;
    this.startupTimer = setTimeout(() => void this.tick(), RADAR_STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), this.intervalMinutes * MS_PER_MINUTE);
    this.startupTimer.unref();
    this.timer.unref();
    logger.info('Legal radar scheduled', { intervalMinutes: this.intervalMinutes });
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.timer = null;
    this.startupTimer = null;
  }

  /** Exposed for tests and for an on-demand refresh. Returns false when a run is already in progress. */
  public async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const summary = await this.useCase.execute();
      logger.info('Legal radar run finished', {
        checked: summary.checked,
        newUpdates: summary.newUpdates,
        failed: summary.failed,
      });
    } catch (error) {
      logger.error('Legal radar run crashed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    } finally {
      this.running = false;
    }
    return true;
  }
}
