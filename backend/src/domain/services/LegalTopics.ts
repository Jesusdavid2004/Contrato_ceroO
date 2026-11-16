import type { ContractType } from '../value-objects/ContractType';

/**
 * Curated legal topics (`tema`) that are relevant for each contract type.
 * An empty list means "no curated coverage": callers must not retrieve legal
 * context at all rather than risk citing a norm from another domain because
 * of semantic similarity.
 */
const TEMAS_BY_CONTRACT_TYPE: Record<string, readonly string[]> = {
  LEASE: ['arriendo'],
  SERVICE: ['consumo'],
};

export function temasForContractType(contractType: ContractType | string): readonly string[] {
  return TEMAS_BY_CONTRACT_TYPE[contractType] ?? [];
}
