import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { PostgresFactsRepository } from '../src/infrastructure/repositories/FactsRepositoryImpl';
import { PostgresProposalsRepository } from '../src/infrastructure/repositories/ProposalsRepositoryImpl';
import {
  PostgresAnalysisEventOutbox,
} from '../src/infrastructure/realtime/PostgresAnalysisEventOutbox';
import { RealtimeTicketStore } from '../src/presentation/realtime/realtimeTickets';
import { RealtimeServer } from '../src/presentation/realtime/realtimeServer';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import { ObjectionLetter } from '../src/domain/entities/ObjectionLetter';

// Solo corre con base de desarrollo/pruebas: PG_TEST_URL=postgresql://user:pass@host:port/db
// Las migraciones se aplican antes via `node backend/scripts/migrate.cjs up`.
const PG_URL = process.env.PG_TEST_URL;

describe.runIf(PG_URL)('PostgreSQL roundtrips (dev DB)', () => {
  const pool = new Pool({ connectionString: PG_URL });
  const suffix = Date.now();
  const userId = `pg-user-${suffix}`;
  const contractId = `contract-pg-${suffix}`;

  const contracts = new PostgresContractRepository(pool);
  const facts = new PostgresFactsRepository(pool);

  beforeAll(async () => {
    await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [userId, `${userId}@example.test`, 'hash', 'Pg User'],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM contracts WHERE id = $1', [contractId]).catch(() => undefined);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
    await pool.end();
  });

  it('tiene las columnas de las migraciones 006 a 011', async () => {
    const res = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('analysis_event_outbox', 'contract_facts', 'clause_proposals', 'objection_letters', 'contracts', 'clauses')
       AND column_name IN ('sequence', 'coverage_status', 'start_offset', 'value', 'proposed_text', 'recipient', 'user_role', 'page_number')`,
    );
    const found = new Set(res.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const expected of [
      'analysis_event_outbox.sequence',
      'contracts.coverage_status',
      'contracts.user_role',
      'clauses.start_offset',
      'clauses.page_number',
      'contract_facts.value',
      'clause_proposals.proposed_text',
      'objection_letters.recipient',
    ]) {
      expect(found.has(expected), expected).toBe(true);
    }
  });

  it('guarda y lee contratos con contexto y evidencia', async () => {
    const contract = new Contract({
      id: contractId,
      ownerId: userId,
      title: 'Lease',
      fileName: 'lease.pdf',
      contractType: 'LEASE',
      jurisdiction: 'CO',
      locale: 'es',
      userRole: 'tenant',
      clauses: [
        new Clause({
          id: 'pg-clause-1',
          orderIndex: 1,
          originalText: 'El canon sube cada mes.',
          riskLevel: 'high',
          confidence: 0.9,
          plainExplanation: 'Reajuste unilateral.',
          startOffset: 0,
          endOffset: 24,
        }),
      ],
    });
    contract.markReady();
    await contracts.save(contract);

    const loaded = await contracts.findById(contractId);
    expect(loaded?.userRole).toBe('tenant');
    expect(loaded?.coverageStatus).toBe('experimental');
    expect(loaded?.coverageRulesVersion).toBeTruthy();
    expect(loaded?.clauses).toHaveLength(1);
    expect(loaded?.clauses[0].startOffset).toBe(0);
    expect(loaded?.clauses[0].endOffset).toBe(24);
    expect(loaded?.clauses[0].pageNumber).toBeNull();
  });

  it('guarda, lee y actualiza datos', async () => {
    await facts.saveFacts(contractId, [
      { key: 'amount', value: '900.000', status: 'found', evidenceClauseId: 'pg-clause-1', evidenceQuote: '$900.000' },
    ]);
    const updated = await facts.updateFact(contractId, 'amount', '900.000', 'confirmed');
    expect(updated).toMatchObject({ key: 'amount', status: 'confirmed' });
    const all = await facts.getFacts(contractId);
    expect(all.find((fact) => fact.key === 'amount')?.status).toBe('confirmed');
  });

  it('crea, lista y actualiza propuestas con version', async () => {
    const repo = new PostgresProposalsRepository(pool);
    const first = await repo.create({
      id: `proposal-pg-1-${suffix}`,
      contractId,
      clauseId: 'pg-clause-1',
      originalText: 'El canon sube cada mes.',
      proposedText: 'El canon se reajusta cada año.',
      reason: 'Previsibilidad.',
      version: (await repo.maxVersionForClause('pg-clause-1')) + 1,
    });
    expect(first.version).toBe(1);
    const second = await repo.create({
      id: `proposal-pg-2-${suffix}`,
      contractId,
      clauseId: 'pg-clause-1',
      originalText: 'El canon sube cada mes.',
      proposedText: 'El canon se reajusta cada dos años.',
      reason: 'Mejor.',
      version: (await repo.maxVersionForClause('pg-clause-1')) + 1,
    });
    expect(second.version).toBe(2);
    const accepted = await repo.update(first.id, { status: 'accepted' });
    expect(accepted?.status).toBe('accepted');
    expect(await repo.listByContract(contractId)).toHaveLength(2);
  });

  it('guarda cartas con opciones y publica el outbox', async () => {
    await contracts.saveObjectionLetter(new ObjectionLetter({
      contractId,
      locale: 'es',
      content: 'Carta de prueba.',
      recipient: 'Arrendador',
      purpose: 'adjustment',
      tone: 'firm',
      selectedClauseIds: ['pg-clause-1'],
    }));
    const letter = await contracts.getObjectionLetter(contractId);
    expect(letter).toMatchObject({
      recipient: 'Arrendador',
      purpose: 'adjustment',
      tone: 'firm',
      selectedClauseIds: ['pg-clause-1'],
    });

    const server = new RealtimeServer(new RealtimeTicketStore(), async () => null);
    const outbox = new PostgresAnalysisEventOutbox(pool);
    await outbox.publish({
      contractId,
      userId,
      jobId: contractId,
      type: 'stage',
      payload: { status: 'ANALYZING' },
      occurredAt: new Date(),
    });
    expect(await outbox.publishPending(server)).toBe(1);
    expect(await outbox.publishPending(server)).toBe(0);
  });

  it('borrar el contrato arrastra datos y propuestas (cascada)', async () => {
    await contracts.delete(contractId);
    expect(await facts.getFacts(contractId)).toHaveLength(0);
    const repo = new PostgresProposalsRepository(pool);
    expect(await repo.listByContract(contractId)).toHaveLength(0);
  });
});
