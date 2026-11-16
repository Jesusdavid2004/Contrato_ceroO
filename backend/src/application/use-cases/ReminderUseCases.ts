import { randomUUID } from 'node:crypto';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { RemindersRepository } from '../../domain/repositories/RemindersRepository';
import { Reminder } from '../../domain/entities/Reminder';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  ReminderDateError,
  ReminderNotFoundError,
} from '../../domain/exceptions/index';

export class CreateReminderUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly remindersRepository: RemindersRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
    title: string;
    dueAt: Date;
    timezone: string;
  }): Promise<{ reminder: Reminder; created: boolean }> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);
    if (input.dueAt.getTime() <= this.clock().getTime()) {
      throw new ReminderDateError();
    }
    return this.remindersRepository.create({
      id: `reminder-${randomUUID()}`,
      contractId: contract.id,
      userId: input.userId,
      title: input.title.trim(),
      dueAt: input.dueAt,
      timezone: input.timezone,
    });
  }
}

export class CompleteReminderUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly remindersRepository: RemindersRepository,
  ) {}

  public async execute(input: { reminderId: string; userId: string }): Promise<Reminder> {
    const reminder = await this.remindersRepository.findById(input.reminderId);
    if (!reminder) throw new ReminderNotFoundError(input.reminderId);
    const contract = await this.contractRepository.findById(reminder.contractId);
    if (!contract) throw new ContractNotFoundError(reminder.contractId);
    if (contract.ownerId !== input.userId || reminder.userId !== input.userId) {
      throw new ContractOwnershipError(reminder.contractId);
    }
    const done = await this.remindersRepository.complete(reminder.id);
    if (!done) throw new ReminderNotFoundError(reminder.id);
    return done;
  }
}
