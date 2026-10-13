import type { AnalyzeContractInput, AnalyzeContractUseCase } from '../../application/use-cases/AnalyzeContractUseCase';
import { logger } from '../../shared/logger';

const MAX_CONCURRENT_ANALYSES = 2;

export class InProcessAnalysisWorker {
  private readonly queue: AnalyzeContractInput[] = [];
  private activeCount = 0;

  constructor(private readonly analyzeContractUseCase: AnalyzeContractUseCase) {}

  public enqueue(input: AnalyzeContractInput): void {
    this.queue.push(input);
    this.processNext();
  }

  private processNext(): void {
    while (this.activeCount < MAX_CONCURRENT_ANALYSES && this.queue.length > 0) {
      const input = this.queue.shift();
      if (!input) return;
      this.activeCount += 1;
      void this.analyzeContractUseCase.execute(input)
        .catch((error: unknown) => {
          logger.error('Contract analysis job failed', {
            contractId: input.contractId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        })
        .finally(() => {
          this.activeCount -= 1;
          this.processNext();
        });
    }
  }
}
