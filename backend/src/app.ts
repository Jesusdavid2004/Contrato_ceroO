import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './shared/config';
import { errorHandler } from './shared/errors/errorHandler';

// Infrastructure
import { pool } from './infrastructure/database/pool';
import { PostgresUserRepository, InMemoryUserRepository } from './infrastructure/repositories/UserRepositoryImpl';
import { PostgresContractRepository, InMemoryContractRepository } from './infrastructure/repositories/ContractRepositoryImpl';
import { LocalFileStorage } from './infrastructure/services/LocalFileStorage';

// Use Cases
import { RegisterUserUseCase, LoginUseCase } from './application/use-cases/AuthUseCases';
import { RefreshSessionUseCase, DeleteAccountUseCase } from './application/use-cases/SessionUseCases';
import { UploadContractUseCase } from './application/use-cases/UploadContractUseCase';

// Routes
import { createAuthRouter } from './presentation/routes/authRoutes';
import { createContractRouter } from './presentation/routes/contractRoutes';

export function createApp(options?: { inMemory?: boolean }) {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: [config.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());

  // Repositories & storage wiring
  const isInMemory = options?.inMemory || config.NODE_ENV === 'test';
  const userRepository = isInMemory ? new InMemoryUserRepository() : new PostgresUserRepository(pool);
  const contractRepository = isInMemory ? new InMemoryContractRepository() : new PostgresContractRepository(pool);
  const fileStorage = new LocalFileStorage();

  // Instantiate Use Cases
  const registerUserUseCase = new RegisterUserUseCase(userRepository);
  const loginUseCase = new LoginUseCase(userRepository);
  const refreshSessionUseCase = new RefreshSessionUseCase(userRepository);
  const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, contractRepository, fileStorage);
  const uploadContractUseCase = new UploadContractUseCase(contractRepository, fileStorage);

  // Health probe
  app.get(['/health', '/api/health'], (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Mount API v1 Routes
  const authRouter = createAuthRouter({
    registerUserUseCase,
    loginUseCase,
    refreshSessionUseCase,
    deleteAccountUseCase,
  });

  const contractRouter = createContractRouter({
    uploadContractUseCase,
    contractRepository,
  });

  // Versioned v1 routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/contracts', contractRouter);

  // Legacy route aliases for backwards compatibility
  app.use('/api/auth', authRouter);
  app.use('/api/contracts', contractRouter);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
