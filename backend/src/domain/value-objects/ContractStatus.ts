export type ContractStatus = 'UPLOADED' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED';

export const ContractStatuses: Record<ContractStatus, ContractStatus> = {
  UPLOADED: 'UPLOADED',
  EXTRACTING: 'EXTRACTING',
  ANALYZING: 'ANALYZING',
  READY: 'READY',
  FAILED: 'FAILED',
};
