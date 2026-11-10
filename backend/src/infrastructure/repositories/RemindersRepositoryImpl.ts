import type { Pool } from 'pg';
import { Reminder } from '../../domain/entities/Reminder';
import type {
  CreateReminderInput,
  RemindersRepository,
} from '../../domain/repositories/RemindersRepository';

interface ReminderRow {
  id: string;
  contract_id: string;
  user_id: string;
  title: string;
  due_at: Date | string;
  timezone: string;
  status: string;
  created_at: Date | string;
}

function toReminder(row: ReminderRow): Reminder {
  return new Reminder({
    id: row.id,
    contractId: row.contract_id,
    userId: row.user_id,
    title: row.title,
    dueAt: new Date(row.due_at),
    timezone: row.timezone,
    status: row.status as Reminder['status'],
    createdAt: new Date(row.created_at),
  });
}

const SELECT_COLUMNS = 'id, contract_id, user_id, title, due_at, timezone, status, created_at';

export class PostgresRemindersRepository implements RemindersRepository {
  constructor(private readonly pool: Pool) {}

  public async create(input: CreateReminderInput & { id: string }): Promise<{ reminder: Reminder; created: boolean }> {
    const inserted = await this.pool.query(
      `INSERT INTO reminders (id, contract_id, user_id, title, due_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contract_id, title, due_at) WHERE status = 'pending' DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.contractId, input.userId, input.title, input.dueAt, input.timezone],
    );
    if (inserted.rows.length > 0) {
      return { reminder: toReminder(inserted.rows[0] as ReminderRow), created: true };
    }
    const existing = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM reminders
       WHERE contract_id = $1 AND title = $2 AND due_at = $3 AND status = 'pending'`,
      [input.contractId, input.title, input.dueAt],
    );
    if (existing.rows.length === 0) {
      throw new Error('Reminder conflicted but no pending reminder exists.');
    }
    return { reminder: toReminder(existing.rows[0] as ReminderRow), created: false };
  }

  public async listByContract(contractId: string): Promise<Reminder[]> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM reminders WHERE contract_id = $1 ORDER BY due_at ASC, id ASC`,
      [contractId],
    );
    return (res.rows as ReminderRow[]).map(toReminder);
  }

  public async findById(id: string): Promise<Reminder | null> {
    const res = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM reminders WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return toReminder(res.rows[0] as ReminderRow);
  }

  public async complete(id: string): Promise<Reminder | null> {
    const res = await this.pool.query(
      `UPDATE reminders SET status = 'done' WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return toReminder(res.rows[0] as ReminderRow);
  }
}

export class InMemoryRemindersRepository implements RemindersRepository {
  private readonly reminders = new Map<string, Reminder>();

  public async create(input: CreateReminderInput & { id: string }): Promise<{ reminder: Reminder; created: boolean }> {
    const duplicate = [...this.reminders.values()].find(
      (reminder) => reminder.contractId === input.contractId
        && reminder.title === input.title
        && reminder.dueAt.getTime() === input.dueAt.getTime()
        && reminder.status === 'pending',
    );
    if (duplicate) return { reminder: duplicate, created: false };
    const reminder = new Reminder({
      id: input.id,
      contractId: input.contractId,
      userId: input.userId,
      title: input.title,
      dueAt: input.dueAt,
      timezone: input.timezone,
    });
    this.reminders.set(reminder.id, reminder);
    return { reminder, created: true };
  }

  public async listByContract(contractId: string): Promise<Reminder[]> {
    return [...this.reminders.values()]
      .filter((reminder) => reminder.contractId === contractId)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }

  public async findById(id: string): Promise<Reminder | null> {
    return this.reminders.get(id) ?? null;
  }

  public async complete(id: string): Promise<Reminder | null> {
    const current = this.reminders.get(id);
    if (!current) return null;
    const done = new Reminder({
      id: current.id,
      contractId: current.contractId,
      userId: current.userId,
      title: current.title,
      dueAt: current.dueAt,
      timezone: current.timezone,
      status: 'done',
      createdAt: current.createdAt,
    });
    this.reminders.set(id, done);
    return done;
  }
}
