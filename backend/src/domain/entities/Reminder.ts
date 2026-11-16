export type ReminderStatus = 'pending' | 'done';

export interface ReminderProps {
  id: string;
  contractId: string;
  userId: string;
  title: string;
  dueAt: Date;
  timezone: string;
  status?: ReminderStatus;
  createdAt?: Date;
}

/** Recordatorio interno (sin correo ni canales externos). */
export class Reminder {
  public readonly id: string;
  public readonly contractId: string;
  public readonly userId: string;
  public readonly title: string;
  public readonly dueAt: Date;
  public readonly timezone: string;
  public readonly status: ReminderStatus;
  public readonly createdAt: Date;

  constructor(props: ReminderProps) {
    this.id = props.id;
    this.contractId = props.contractId;
    this.userId = props.userId;
    this.title = props.title;
    this.dueAt = props.dueAt;
    this.timezone = props.timezone;
    this.status = props.status ?? 'pending';
    this.createdAt = props.createdAt || new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      contract_id: this.contractId,
      user_id: this.userId,
      title: this.title,
      due_at: this.dueAt.toISOString(),
      timezone: this.timezone,
      status: this.status,
      created_at: this.createdAt.toISOString(),
    };
  }
}
