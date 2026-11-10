import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import type { RealtimeTicketStore } from './realtimeTickets';

export function createRealtimeRouter(deps: {
  ticketStore: RealtimeTicketStore;
}): Router {
  const router = Router();

  // POST /ticket (issue a single-use WebSocket ticket, TTL 60 s)
  router.post('/ticket', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const issued = deps.ticketStore.issue(req.user!.id);
      res.status(201).json({
        ticket: issued.ticket,
        expiresAt: issued.expiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
