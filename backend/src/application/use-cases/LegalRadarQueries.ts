import type { LegalUpdate } from '../../domain/entities/LegalUpdate';
import type { LegalSourceState, LegalUpdatesRepository } from '../../domain/repositories/LegalUpdatesRepository';
import type { LegalSourceDefinition } from '../../domain/services/LegalSources';

export const RADAR_DEFAULT_LOOKBACK_DAYS = 30;
export const RADAR_MAX_UPDATES = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ListLegalUpdatesUseCase {
  constructor(
    private readonly updates: LegalUpdatesRepository,
    private readonly knownTemas: readonly string[],
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** `tema` narrows the feed; an unknown topic yields an empty list rather than an error. */
  public async execute(input: { tema?: string }): Promise<LegalUpdate[]> {
    const temas = input.tema ? this.knownTemas.filter((tema) => tema === input.tema) : this.knownTemas;
    return this.updates.listRecent({
      temas,
      since: new Date(this.clock().getTime() - RADAR_DEFAULT_LOOKBACK_DAYS * MS_PER_DAY),
      limit: RADAR_MAX_UPDATES,
    });
  }
}

export interface RadarSourceStatus {
  id: string;
  tema: string;
  title: string;
  kind: string;
  lastCheckedAt: Date | null;
}

export class GetLegalRadarStatusUseCase {
  constructor(
    private readonly sources: readonly LegalSourceDefinition[],
    private readonly updates: LegalUpdatesRepository,
  ) {}

  public async execute(): Promise<RadarSourceStatus[]> {
    const states = await this.updates.listSourceStates();
    const byId = new Map<string, LegalSourceState>(states.map((state) => [state.sourceId, state]));
    return this.sources.map((source) => ({
      id: source.id,
      tema: source.tema,
      title: source.title,
      kind: source.kind,
      lastCheckedAt: byId.get(source.id)?.checkedAt ?? null,
    }));
  }
}
