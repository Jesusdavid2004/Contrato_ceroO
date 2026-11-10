import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { COVERAGE_RULES_VERSION } from '../src/domain/services/CoveragePolicy';

describe('Contract context (role and coverage)', () => {
  const app = createApp({ inMemory: true });
  const suffix = Date.now();
  let token = '';

  it('registers a user for context uploads', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Context User',
      email: `ctx_${suffix}@example.com`,
      password: 'Password123!',
    });
    expect(res.status).toBe(201);
    token = res.body.accessToken as string;
  });

  it('records role and experimental coverage for CO+LEASE', async () => {
    const res = await request(app)
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${token}`)
      .field('contract_type', 'LEASE')
      .field('jurisdiction', 'CO')
      .field('locale', 'es')
      .field('user_role', 'tenant')
      .attach('contract', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'lease.pdf');

    expect(res.status).toBe(201);
    expect(res.body.user_role).toBe('tenant');
    expect(res.body.coverage_status).toBe('experimental');
    expect(res.body.coverage_rules_version).toBe(COVERAGE_RULES_VERSION);
  });

  it('defaults role and marks out-of-profile scopes unsupported', async () => {
    const res = await request(app)
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${token}`)
      .field('contract_type', 'SERVICE')
      .field('jurisdiction', 'US')
      .attach('contract', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'svc.pdf');

    expect(res.status).toBe(201);
    expect(res.body.user_role).toBe('other');
    expect(res.body.coverage_status).toBe('unsupported');
    expect(res.body.coverage_rules_version).toBe(COVERAGE_RULES_VERSION);
  });

  it('rejects unknown roles at the boundary', async () => {
    const res = await request(app)
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${token}`)
      .field('user_role', 'landlord')
      .attach('contract', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'x.pdf');

    expect(res.status).toBe(422);
  });

  it('migration 1700000000007 declares context columns and honest backfill', () => {
    const file = fs.readFileSync(
      path.resolve(__dirname, '..', 'migrations', '1700000000007_contract_context.cjs'),
      'utf8',
    );
    expect(file).toContain('user_role');
    expect(file).toContain('coverage_status');
    expect(file).toContain('coverage_rules_version');
    expect(file).toContain("'experimental'");
    expect(file).toContain("'unsupported'");
    expect(file).not.toContain("'supported'");
    // NOTE: real execution against PostgreSQL is pending (no local DB).
  });
});
