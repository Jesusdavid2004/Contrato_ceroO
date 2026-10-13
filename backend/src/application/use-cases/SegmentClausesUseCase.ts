import type {
  ClauseSegmenter,
  SegmentedClause,
} from '../../domain/services/InfrastructureInterfaces';

export class SegmentClausesUseCase {
  constructor(private readonly clauseSegmenter: ClauseSegmenter) {}

  public async execute(input: { contractText: string }): Promise<SegmentedClause[]> {
    return this.clauseSegmenter.segment(input.contractText);
  }
}
