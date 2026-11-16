import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type {
  GetLegalRadarStatusUseCase,
  ListLegalUpdatesUseCase,
} from '../../application/use-cases/LegalRadarQueries';
import { requireAuth } from '../middleware/authMiddleware';

const updatesQuerySchema = z.object({ tema: z.string().trim().min(1).max(40).optional() });

export function createLegalRadarRouter(deps: {
  listUpdatesUseCase: ListLegalUpdatesUseCase;
  statusUseCase: GetLegalRadarStatusUseCase;
}): Router {
  const router = Router();

  router.get('/updates', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = updatesQuerySchema.parse(req.query);
      const updates = await deps.listUpdatesUseCase.execute({ tema: query.tema });
      res.status(200).json(updates.map((update) => update.toJSON()));
    } catch (error) {
      next(error);
    }
  });

  router.get('/status', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sources = await deps.statusUseCase.execute();
      res.status(200).json(sources.map((source) => ({
        id: source.id,
        tema: source.tema,
        title: source.title,
        kind: source.kind,
        last_checked_at: source.lastCheckedAt?.toISOString() ?? null,
      })));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
