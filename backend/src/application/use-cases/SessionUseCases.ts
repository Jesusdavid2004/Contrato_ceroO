import type { UserRepository } from '../../domain/repositories/UserRepository';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { FileStorage } from '../../domain/services/InfrastructureInterfaces';
import { UnauthorizedError } from '../../domain/exceptions/index';
import { TokenService } from '../../infrastructure/security/SecurityServices';

export class RefreshSessionUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    const payload = TokenService.verifyRefreshToken(refreshToken);
    const user = await this.userRepository.findById(payload.id);
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
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

export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly contractRepository: ContractRepository,
    private readonly fileStorage: FileStorage,
  ) {}

  public async execute(userId: string): Promise<void> {
    // 1. Fetch user contracts and clean up stored files
    const contracts = await this.contractRepository.findByOwnerId(userId);
    for (const contract of contracts) {
      await this.fileStorage.delete(contract.id);
      await this.contractRepository.delete(contract.id);
    }

    // 2. Hard delete user account row
    await this.userRepository.delete(userId);
  }
}
