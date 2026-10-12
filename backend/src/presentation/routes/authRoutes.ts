import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RegisterUserUseCase, LoginUseCase } from '../../application/use-cases/AuthUseCases';
import type { RefreshSessionUseCase, DeleteAccountUseCase } from '../../application/use-cases/SessionUseCases';
import { requireAuth } from '../middleware/authMiddleware';
import { authLimiter } from '../middleware/rateLimiter';
import { setRefreshTokenCookie, clearRefreshTokenCookie, REFRESH_COOKIE_NAME } from '../utils/cookies';

export function createAuthRouter(deps: {
  registerUserUseCase: RegisterUserUseCase;
  loginUseCase: LoginUseCase;
  refreshSessionUseCase: RefreshSessionUseCase;
  deleteAccountUseCase: DeleteAccountUseCase;
}): Router {
  const router = Router();

  // POST /register
  router.post(
    '/register',
    authLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await deps.registerUserUseCase.execute(req.body);
        setRefreshTokenCookie(res, result.refreshToken);

        // Include both accessToken and token for backwards compatibility
        res.status(201).json({
          user: result.user,
          accessToken: result.accessToken,
          token: result.accessToken,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /login
  router.post(
    '/login',
    authLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await deps.loginUseCase.execute(req.body);
        setRefreshTokenCookie(res, result.refreshToken);

        res.status(200).json({
          user: result.user,
          accessToken: result.accessToken,
          token: result.accessToken,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /refresh
  router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      const result = await deps.refreshSessionUseCase.execute(refreshToken);
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        user: result.user,
        accessToken: result.accessToken,
        token: result.accessToken,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /logout
  router.post('/logout', (_req: Request, res: Response) => {
    clearRefreshTokenCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
  });

  // GET /me
  router.get('/me', requireAuth, (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
  });

  // DELETE /me (Hard delete account)
  router.delete('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      await deps.deleteAccountUseCase.execute(userId);
      clearRefreshTokenCookie(res);
      res.status(200).json({ message: 'Account permanently deleted' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
