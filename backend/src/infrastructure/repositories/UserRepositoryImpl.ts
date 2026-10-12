import type { UserRepository } from '../../domain/repositories/UserRepository';
import { User } from '../../domain/entities/User';
import type { Pool } from 'pg';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  public async findById(id: string): Promise<User | null> {
    const res = await this.pool.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE id = $1',
      [id],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return new User({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
    });
  }

  public async findByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return new User({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
    });
  }

  public async save(user: User): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash`,
      [user.id, user.name, user.email, user.passwordHash, user.createdAt],
    );
  }

  public async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
}

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const lower = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email === lower) return user;
    }
    return null;
  }

  public async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  public async delete(id: string): Promise<void> {
    this.users.delete(id);
  }
}
