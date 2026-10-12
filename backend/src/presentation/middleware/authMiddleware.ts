import type { Request, Response, NextFunction } from 'express';
import { TokenService, type UserTokenPayload } from '../../infrastructure/security/SecurityServices';
import { UnauthorizedError } from '../../domain/exceptions/index';

declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required');
  }

  const token = header.split(' ')[1];
  const payload = TokenService.verifyAccessToken(token);
  req.user = payload;
  next();
}
