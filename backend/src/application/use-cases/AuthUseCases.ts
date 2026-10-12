import { z } from 'zod';
import type { UserRepository } from '../../domain/repositories/UserRepository';
import { User } from '../../domain/entities/User';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
} from '../../domain/exceptions/index';
import { PasswordService, TokenService } from '../../infrastructure/security/SecurityServices';
import crypto from 'node:crypto';

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export class RegisterUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: RegisterInput) {
    const input = registerSchema.parse(rawInput);
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyExistsError(input.email);
    }

    const passwordHash = await PasswordService.hash(input.password);
    const user = new User({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      email: input.email.trim(),
      passwordHash,
    });

    await this.userRepository.save(user);

    const tokens = TokenService.generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      user: user.toJSON(),
      ...tokens,
    };
  }
}

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export class LoginUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: LoginInput) {
    const input = loginSchema.parse(rawInput);
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isValid = await PasswordService.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const tokens = TokenService.generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      user: user.toJSON(),
      ...tokens,
    };
  }
}
