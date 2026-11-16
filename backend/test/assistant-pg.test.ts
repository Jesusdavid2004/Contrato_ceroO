import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { AssistantMessage } from '../src/domain/entities/AssistantMessage';
import { Contract } from '../src/domain/entities/Contract';
import { LegalUpdate } from '../src/domain/entities/LegalUpdate';
import { PostgresAssistantConversationRepository } from '../src/infrastructure/repositories/AssistantConversationRepositoryImpl';
import { PostgresContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { PostgresLegalUpdatesRepository } from '../src/infrastructure/repositories/LegalUpdatesRepositoryImpl';

// Runs only against a migrated test database: PG_TEST_URL=postgresql://user:pass@host:port/db
const PG_URL = process.env.PG_TEST_URL;

describe.runIf(PG_URL)('assistant and legal radar persistence (PostgreSQL)', () => {
  const pool = new Pool({ connectionString: PG_URL });
  const suffix = Date.now();
  const userId = `assistant-pg-user-${suffix}`;
  const contractId = `assistant-pg-contract-${suffix}`;
  const sourceId = `source-${suffix}`;
  const conversations = new PostgresAssistantConversationRepository(pool);
  const updates = new PostgresLegalUpdatesRepository(pool);

  beforeAll(async () => {
    await pool.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [userId, `${userId}@example.test`, 'hash', 'Assistant Pg'],
    );
    await new PostgresContractRepository(pool).save(new Contract({
      id: contractId, ownerId: userId, title: 'T', fileName: 'f.pdf', contractType: 'LEASE', jurisdiction: 'CO', locale: 'es',
    }));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM legal_updates WHERE source_id = $1', [sourceId]).catch(() => undefined);
    await pool.query('DELETE FROM legal_source_state WHERE source_id = $1', [sourceId]).catch(() => undefined);
    await pool.query('DELETE FROM contracts WHERE id = $1', [contractId]).catch(() => undefined);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
    await pool.end();
  });

  it('stores messages with citations, lists the latest ones oldest first and counts user questions', async () => {
    const base = Date.now();
    for (let index = 0; index < 4; index += 1) {
      await conversations.append(new AssistantMessage({
        id: `msg-${suffix}-${index}`,
        contractId,
        userId,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message ${index}`,
        citations: index % 2 === 1
          ? [{ sourceId: 'S1', kind: 'clause', label: 'clause:c1', quote: 'quote', verifiedAt: '2026-11-03' }]
          : [],
        grounded: index % 2 === 1,
        createdAt: new Date(base + index * 1000),
      }));
    }
    const latest = await conversations.listByContract(contractId, 3);
    expect(latest.map((message) => message.content)).toEqual(['message 1', 'message 2', 'message 3']);
    expect(latest[0].citations[0]).toMatchObject({ sourceId: 'S1', verifiedAt: '2026-11-03' });
    expect(await conversations.countUserMessagesSince(userId, new Date(base - 1000))).toBe(2);
    expect(await conversations.countUserMessagesSince(userId, new Date(base + 60_000))).toBe(0);
  });

  it('hard-deletes the conversation with the contract', async () => {
    expect(await conversations.deleteByContract(contractId)).toBe(4);
    await conversations.append(new AssistantMessage({ id: `msg-${suffix}-x`, contractId, userId, role: 'user', content: 'again' }));
    await pool.query('DELETE FROM contracts WHERE id = $1', [contractId]);
    const left = await pool.query('SELECT 1 FROM assistant_messages WHERE contract_id = $1', [contractId]);
    expect(left.rowCount).toBe(0);
  });

  it('deduplicates legal updates by source and hash and filters by topic and date', async () => {
    const update = new LegalUpdate({
      id: `upd-${suffix}-1`, sourceId, tema: 'arriendo', kind: 'news', title: 'Titulo',
      sourceUrl: 'https://example.test/a', contentHash: 'hash-a', detectedAt: new Date(),
    });
    expect(await updates.saveIfNew(update)).toBe(true);
    expect(await updates.saveIfNew(new LegalUpdate({ ...update, id: `upd-${suffix}-2` }))).toBe(false);
    const found = await updates.listRecent({ temas: ['arriendo'], since: new Date(Date.now() - 60_000), limit: 500 });
    expect(found.some((item) => item.id === `upd-${suffix}-1` && item.kind === 'news')).toBe(true);
    expect(await updates.listRecent({ temas: [], since: new Date(0), limit: 5 })).toEqual([]);
  });

  it('upserts the source state', async () => {
    await updates.saveSourceState({ sourceId, contentHash: 'one', checkedAt: new Date('2026-11-01T00:00:00.000Z') });
    await updates.saveSourceState({ sourceId, contentHash: 'two', checkedAt: new Date('2026-11-02T00:00:00.000Z') });
    expect(await updates.getSourceState(sourceId)).toMatchObject({ contentHash: 'two' });
    expect((await updates.listSourceStates()).some((state) => state.sourceId === sourceId)).toBe(true);
  });
});
