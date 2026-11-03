import type {
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ObjectionLetterRequest,
} from '../../domain/services/AIProvider';

/**
 * Hybrid provider: routes by tier so the on-device model and the hosted
 * model work TOGETHER instead of replacing each other.
 *
 * - fast tier (every clause, every upload): the local neural provider.
 *   Free, instant, offline. Handles the bulk of the work.
 * - smart tier (low-confidence rechecks + objection letters): the hosted
 *   provider (Anthropic or Gemini) when a key is configured, otherwise the
 *   same local provider. The API is only spent where judgment matters.
 */
export class TieredAIProvider implements AIProvider {
  constructor(
    private readonly fast: AIProvider,
    private readonly smart: AIProvider,
  ) {}

  public classifyClauses(
    request: ClassifyClausesRequest,
    tier: 'fast' | 'smart' = 'fast',
  ): Promise<ClauseClassificationResult> {
    return (tier === 'smart' ? this.smart : this.fast).classifyClauses(request, tier);
  }

  public generateObjectionLetter(request: ObjectionLetterRequest): Promise<string> {
    return this.smart.generateObjectionLetter(request);
  }
}
