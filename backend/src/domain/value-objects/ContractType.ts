export type ContractType = 'LEASE' | 'SERVICE' | 'EMPLOYMENT' | 'OTHER';

export const ContractTypes: Record<ContractType, ContractType> = {
  LEASE: 'LEASE',
  SERVICE: 'SERVICE',
  EMPLOYMENT: 'EMPLOYMENT',
  OTHER: 'OTHER',
};
