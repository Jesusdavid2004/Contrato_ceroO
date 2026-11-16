import crypto from 'node:crypto';

export interface IssuedRealtimeTicket {
  ticket: string;
  userId: string;
  expiresAt: Date;
}

/**
 * Tickets opacos de un solo uso para el upgrade WebSocket. Atados al userId,
 * TTL corto y tope por usuario para acotar memoria. Epiferos por diseno:
 * al reconectar el cliente pide uno nuevo por HTTP autenticado. Limite
 * honesto: con varias replicas cada instancia acepta sus propios tickets.
 */
export class RealtimeTicketStore {
  public static readonly TICKET_TTL_MS = 60_000;
  public static readonly MAX_TICKETS_PER_USER = 20;

  private readonly tickets = new Map<string, { userId: string; expiresAt: number }>();

  public issue(userId: string, now: number = Date.now()): IssuedRealtimeTicket {
    this.purgeExpired(now);
    let owned = 0;
    let oldestTicket: string | null = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [ticket, entry] of this.tickets) {
      if (entry.userId !== userId) continue;
      owned += 1;
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestTicket = ticket;
      }
    }
    if (owned >= RealtimeTicketStore.MAX_TICKETS_PER_USER && oldestTicket) {
      this.tickets.delete(oldestTicket);
    }
    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(now + RealtimeTicketStore.TICKET_TTL_MS);
    this.tickets.set(ticket, { userId, expiresAt: expiresAt.getTime() });
    return { ticket, userId, expiresAt };
  }

  /** Consume el ticket (un solo uso). Retorna el userId o null si es invalido. */
  public consume(ticket: string, now: number = Date.now()): string | null {
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (entry.expiresAt < now) return null;
    return entry.userId;
  }

  public size(): number {
    return this.tickets.size;
  }

  private purgeExpired(now: number): void {
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }
}
