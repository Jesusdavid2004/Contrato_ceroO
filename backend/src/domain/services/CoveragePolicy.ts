import type { ContractType } from '../value-objects/ContractType';
import type { Jurisdiction } from '../value-objects/Jurisdiction';

/** Papel declarado por el usuario al subir el contrato. */
export type UserRole = 'tenant' | 'consumer' | 'employee' | 'other';

export const UserRoles: Record<UserRole, UserRole> = {
  tenant: 'tenant',
  consumer: 'consumer',
  employee: 'employee',
  other: 'other',
};

/**
 * Cobertura del analisis para un (jurisdiccion, tipo):
 * - experimental: perfil inicial con corpus curado, sin revision juridica;
 *   jamas presentarlo como validado.
 * - supported: reservado a combinaciones con revision juridica registrada.
 * - unsupported: solo lectura informativa limitada, sin conclusiones locales.
 */
export type CoverageStatus = 'supported' | 'experimental' | 'unsupported';

/** Version de las reglas de cobertura registrada en cada analisis. */
export const COVERAGE_RULES_VERSION = 'coverage-rules-v1';

export interface CoverageScope {
  jurisdiction: string;
  contractType: string;
  status: CoverageStatus;
  rulesVersion: string;
}

const EXPERIMENTAL_SCOPES: ReadonlyArray<{ jurisdiction: string; contractType: ContractType }> = [
  // Perfil inicial: arrendamiento de vivienda urbana en Colombia.
  { jurisdiction: 'CO', contractType: 'LEASE' },
];

/** Clasifica la cobertura sin inventar respaldo donde no lo hay. */
export function resolveCoverage(jurisdiction: string, contractType: string): CoverageScope {
  const scope = EXPERIMENTAL_SCOPES.find(
    (entry) => entry.jurisdiction === jurisdiction && entry.contractType === contractType,
  );
  return {
    jurisdiction,
    contractType,
    status: scope ? 'experimental' : 'unsupported',
    rulesVersion: COVERAGE_RULES_VERSION,
  };
}

/** Alcance registrado para una combinacion tipada del dominio. */
export function resolveTypedCoverage(
  jurisdiction: Jurisdiction,
  contractType: ContractType,
): CoverageScope {
  return resolveCoverage(jurisdiction, contractType);
}
