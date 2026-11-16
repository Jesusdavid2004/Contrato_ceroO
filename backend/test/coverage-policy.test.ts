import { describe, it, expect } from 'vitest';
import {
  COVERAGE_RULES_VERSION,
  resolveCoverage,
} from '../src/domain/services/CoveragePolicy';

describe('CoveragePolicy', () => {
  it('marca CO+LEASE como experimental con version de reglas', () => {
    expect(resolveCoverage('CO', 'LEASE')).toEqual({
      jurisdiction: 'CO',
      contractType: 'LEASE',
      status: 'experimental',
      rulesVersion: COVERAGE_RULES_VERSION,
    });
  });

  it('marca el resto como no soportado sin inventar respaldo', () => {
    expect(resolveCoverage('CO', 'SERVICE').status).toBe('unsupported');
    expect(resolveCoverage('US', 'LEASE').status).toBe('unsupported');
    expect(resolveCoverage('OTHER', 'OTHER').status).toBe('unsupported');
  });

  it('reserva supported para revision juridica registrada', () => {
    const statuses = [
      resolveCoverage('CO', 'LEASE').status,
      resolveCoverage('CO', 'SERVICE').status,
      resolveCoverage('MX', 'EMPLOYMENT').status,
    ];
    expect(statuses).not.toContain('supported');
  });
});
