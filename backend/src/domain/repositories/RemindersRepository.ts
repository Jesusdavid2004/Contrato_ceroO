import type { Reminder } from '../entities/Reminder';

export interface CreateReminderInput {
  contractId: string;
  userId: string;
  title: string;
  dueAt: Date;
  timezone: string;
}

export interface RemindersRepository {
  /** Idempotente: pendiente duplicado retorna el existente. */
  create(input: CreateReminderInput & { id: string }): Promise<{ reminder: Reminder; created: boolean }>;
  listByContract(contractId: string): Promise<Reminder[]>;
  findById(id: string): Promise<Reminder | null>;
  complete(id: string): Promise<Reminder | null>;
}
