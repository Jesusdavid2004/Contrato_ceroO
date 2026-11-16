import { describe, it, expect } from 'vitest';
import { buildIcsCalendar } from '../src/domain/services/CalendarExport';
import { Reminder } from '../src/domain/entities/Reminder';
import { CreateReminderUseCase, CompleteReminderUseCase } from '../src/application/use-cases/ReminderUseCases';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { InMemoryRemindersRepository } from '../src/infrastructure/repositories/RemindersRepositoryImpl';
import { Contract } from '../src/domain/entities/Contract';
import { ReminderDateError } from '../src/domain/exceptions/index';

function leaseContract(): Contract {
  return new Contract({
    id: 'contract-reminders-1',
    ownerId: 'user-1',
    title: 'Lease',
    fileName: 'lease.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
  });
}

describe('Reminders', () => {
  it('crea idempotente y completa', async () => {
    const contracts = new InMemoryContractRepository();
    const reminders = new InMemoryRemindersRepository();
    await contracts.save(leaseContract());
    const create = new CreateReminderUseCase(contracts, reminders, () => new Date('2026-11-01T00:00:00.000Z'));

    const first = await create.execute({
      contractId: 'contract-reminders-1',
      userId: 'user-1',
      title: 'Preaviso de terminación',
      dueAt: new Date('2026-12-01T15:00:00.000Z'),
      timezone: 'America/Bogota',
    });
    expect(first.created).toBe(true);
    expect(first.reminder.status).toBe('pending');

    const duplicate = await create.execute({
      contractId: 'contract-reminders-1',
      userId: 'user-1',
      title: 'Preaviso de terminación',
      dueAt: new Date('2026-12-01T15:00:00.000Z'),
      timezone: 'America/Bogota',
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.reminder.id).toBe(first.reminder.id);

    const done = await new CompleteReminderUseCase(contracts, reminders).execute({
      reminderId: first.reminder.id,
      userId: 'user-1',
    });
    expect(done.status).toBe('done');
  });

  it('rechaza fechas pasadas', async () => {
    const contracts = new InMemoryContractRepository();
    const reminders = new InMemoryRemindersRepository();
    await contracts.save(leaseContract());
    const create = new CreateReminderUseCase(contracts, reminders, () => new Date('2026-11-01T00:00:00.000Z'));
    await expect(create.execute({
      contractId: 'contract-reminders-1',
      userId: 'user-1',
      title: 'Vencido',
      dueAt: new Date('2026-10-01T00:00:00.000Z'),
      timezone: 'America/Bogota',
    })).rejects.toBeInstanceOf(ReminderDateError);
  });

  it('exporta .ics con zona horaria explicita y escapes', () => {
    const ics = buildIcsCalendar([
      new Reminder({
        id: 'reminder-1',
        contractId: 'contract-reminders-1',
        userId: 'user-1',
        title: 'Preaviso; terminación, fin',
        dueAt: new Date('2026-12-01T15:00:00.000Z'),
        timezone: 'America/Bogota',
      }),
    ]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:reminder-1@contratoclaro');
    expect(ics).toContain('DTSTART;TZID=America/Bogota:20261201T100000');
    expect(ics).toContain('SUMMARY:Preaviso\\; terminación\\, fin');
    expect(ics).toContain('END:VEVENT');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
