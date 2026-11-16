import type { ContractRepository } from '../../domain/repositories/ContractRepository';

/**
 * Startup recovery for analysis jobs interrupted by a restart or crash.
 * Contracts still sitting in EXTRACTING/ANALYZING past the job timeout are
 * marked FAILED with a translated message key instead of polling forever.
 * Primera red: el runner reclama leases vencidos de la cola durable; esto
 * cubre contratos que quedaron a medias sin trabajo pendiente.
 */
export const STUCK_JOB_FAILURE_KEY = 'errors.analysis_interrupted';

export class RecoverStuckContractsUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly timeoutMs: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(): Promise<number> {
    const cutoff = new Date(this.clock().getTime() - this.timeoutMs);
    const stuck = await this.contractRepository.findStuckContracts(cutoff);
    for (const contract of stuck) {
      contract.markFailed(STUCK_JOB_FAILURE_KEY);
      await this.contractRepository.save(contract);
    }
    return stuck.length;
  }
}
