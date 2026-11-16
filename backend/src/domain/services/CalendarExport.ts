import type { Reminder } from '../entities/Reminder';

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function utcStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function zonedDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

/**
 * Exporta recordatorios a .ics sin crear eventos en cuentas externas:
 * archivo descargable con zona horaria explicita por evento.
 */
export function buildIcsCalendar(reminders: Reminder[], now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ContratoClaro//Reminders//ES'];
  for (const reminder of reminders) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${reminder.id}@contratoclaro`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;TZID=${reminder.timezone}:${zonedDateTime(reminder.dueAt, reminder.timezone)}`,
      `SUMMARY:${escapeIcs(reminder.title)}`,
      `DESCRIPTION:${escapeIcs(`ContratoClaro · contrato ${reminder.contractId}`)}`,
      `STATUS:${reminder.status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
