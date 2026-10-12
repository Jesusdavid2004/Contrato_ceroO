import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../shared/config';
import { UnauthorizedError } from '../../domain/exceptions/index';

export interface UserTokenPayload {
  id: string;
  email: string;
  name: string;
  type: 'access' | 'refresh';
}

export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  public static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export class TokenService {
  public static generateTokens(user: { id: string; email: string; name: string }): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessPayload: UserTokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      type: 'access',
    };

    const refreshPayload: UserTokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      type: 'refresh',
    };

    const accessToken = jwt.sign(accessPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(refreshPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  public static verifyAccessToken(token: string): UserTokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as UserTokenPayload;
      if (decoded.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }
      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  public static verifyRefreshToken(token: string): UserTokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as UserTokenPayload;
      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }
      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}
