import type {
  AIClauseSegmenter,
  ClauseSegmenter,
  HeadingClauseSegmenter,
  SegmentedClause,
} from '../../domain/services/InfrastructureInterfaces';

const MIN_REGEX_CLAUSE_COUNT = 3;

export class AdaptiveClauseSegmenter implements ClauseSegmenter {
  constructor(
    private readonly regexSegmenter: HeadingClauseSegmenter,
    private readonly aiSegmenter: AIClauseSegmenter,
  ) {}

  public async segment(text: string): Promise<SegmentedClause[]> {
    const regexClauses = this.regexSegmenter.segmentHeadings(text);
    if (regexClauses.length >= MIN_REGEX_CLAUSE_COUNT) {
      return regexClauses;
    }
    return this.aiSegmenter.segment(text);
  }
}
