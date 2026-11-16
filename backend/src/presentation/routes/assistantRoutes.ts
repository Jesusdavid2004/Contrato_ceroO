import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AskAssistantUseCase } from '../../application/use-cases/AskAssistantUseCase';
import type {
  ClearAssistantConversationUseCase,
  ListAssistantMessagesUseCase,
} from '../../application/use-cases/AssistantHistoryUseCases';
import type { GetContractGuidanceUseCase } from '../../application/use-cases/GetContractGuidanceUseCase';
import { requireAuth } from '../middleware/authMiddleware';
import { aiIpLimiter, aiUserLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validationMiddleware';
import { askAssistantBodySchema } from '../schemas/assistantSchemas';
import { openSse, sendSse, sendSseError, wantsEventStream } from '../utils/serverSentEvents';

export interface AssistantRouterDeps {
  askAssistantUseCase: AskAssistantUseCase;
  listMessagesUseCase: ListAssistantMessagesUseCase;
  clearConversationUseCase: ClearAssistantConversationUseCase;
  getGuidanceUseCase: GetContractGuidanceUseCase;
}

/** Mounted under `/contracts`: every route is scoped to one owned contract. */
export function createAssistantRouter(deps: AssistantRouterDeps): Router {
  const router = Router();

  router.post(
    '/:id/assistant/messages',
    requireAuth,
    aiIpLimiter,
    aiUserLimiter,
    validateBody(askAssistantBodySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      const input = { contractId: String(req.params.id), userId: req.user!.id, question: req.body.question as string };
      if (!wantsEventStream(req.headers.accept)) {
        try {
          const { assistantMessage } = await deps.askAssistantUseCase.execute(input);
          res.status(200).json(assistantMessage.toJSON());
        } catch (error) {
          next(error);
        }
        return;
      }
      await streamAnswer(res, next, deps.askAssistantUseCase, input);
    },
  );

  router.get('/:id/assistant/messages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messages = await deps.listMessagesUseCase.execute({ contractId: String(req.params.id), userId: req.user!.id });
      res.status(200).json(messages.map((message) => message.toJSON()));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id/assistant/messages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const removed = await deps.clearConversationUseCase.execute({ contractId: String(req.params.id), userId: req.user!.id });
      res.status(200).json({ removed });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/guidance', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guidance = await deps.getGuidanceUseCase.execute({ contractId: String(req.params.id), userId: req.user!.id });
      res.status(200).json({
        contract_id: guidance.contractId,
        locale: guidance.locale,
        global_risk_score: guidance.globalRiskScore,
        pending_legal_updates: guidance.pendingLegalUpdates,
        steps: guidance.steps.map((step) => ({
          id: step.id,
          kind: step.kind,
          priority: step.priority,
          message_key: step.messageKey,
          params: step.params,
          clause_id: step.clauseId,
        })),
        narration: guidance.narration.map((segment) => ({
          id: segment.id,
          kind: segment.kind,
          message_key: segment.messageKey,
          params: segment.params,
          clause_id: segment.clauseId,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function streamAnswer(
  res: Response,
  next: NextFunction,
  useCase: AskAssistantUseCase,
  input: { contractId: string; userId: string; question: string },
): Promise<void> {
  // Failures before the first token (ownership, quota, not ready) keep their
  // normal HTTP status; once the stream is open errors become `error` events.
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    openSse(res);
  };
  try {
    const { assistantMessage } = await useCase.execute({
      ...input,
      onToken: (text) => {
        open();
        sendSse(res, 'token', { text });
      },
    });
    open();
    sendSse(res, 'done', assistantMessage.toJSON());
    res.end();
  } catch (error) {
    if (!opened) {
      next(error);
      return;
    }
    sendSseError(res, error);
    res.end();
  }
}
