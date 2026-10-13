import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
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
import { PdfTextExtractor } from './infrastructure/services/PdfTextExtractor';
import { RegexClauseSegmenter } from './infrastructure/services/RegexClauseSegmenter';
import { AdaptiveClauseSegmenter } from './infrastructure/services/AdaptiveClauseSegmenter';
import { AnthropicAIProvider } from './infrastructure/ai/AnthropicAIProvider';
import { AnthropicDocumentProcessor } from './infrastructure/ai/AnthropicDocumentProcessor';
import { FakeAIProvider } from './infrastructure/ai/FakeAIProvider';
import { OfflineDocumentProcessor } from './infrastructure/ai/OfflineDocumentProcessor';
import { InMemoryAIClassificationCache } from './infrastructure/services/InMemoryAIClassificationCache';
import { InProcessAnalysisWorker } from './infrastructure/services/InProcessAnalysisWorker';
import { PostgresAIUsageRepository, InMemoryAIUsageRepository } from './infrastructure/repositories/AIUsageRepositoryImpl';
import { PostgresLegalProvisionRepository } from './infrastructure/repositories/LegalProvisionRepositoryImpl';
import { HuggingFaceLocalEmbeddingProvider } from './infrastructure/ai/HuggingFaceLocalEmbeddingProvider';
import { PostgresLegalContextProvider } from './infrastructure/services/PostgresLegalContextProvider';

// Use Cases
import { RegisterUserUseCase, LoginUseCase } from './application/use-cases/AuthUseCases';
import { RefreshSessionUseCase, DeleteAccountUseCase } from './application/use-cases/SessionUseCases';
import { UploadContractUseCase } from './application/use-cases/UploadContractUseCase';
import { AnalyzeContractUseCase } from './application/use-cases/AnalyzeContractUseCase';
import { GenerateObjectionLetterUseCase } from './application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from './application/use-cases/DownloadObjectionLetterPdfUseCase';
import { PdfKitGenerator } from './infrastructure/services/PdfKitGenerator';
import { UpdateObjectionLetterUseCase } from './application/use-cases/UpdateObjectionLetterUseCase';

// Routes
import { createAuthRouter } from './presentation/routes/authRoutes';
import { createContractRouter } from './presentation/routes/contractRoutes';

export function createApp(options?: { inMemory?: boolean }) {
  const app = express();

  // Middleware
  app.use(helmet());
  const allowedOrigins = config.NODE_ENV === 'production'
    ? [config.CORS_ORIGIN]
    : [config.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  app.use(
    cors({
      origin: allowedOrigins,
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
  const anthropicClient = config.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
    : null;
  const documentProcessor = anthropicClient
    ? new AnthropicDocumentProcessor(anthropicClient, config.AI_MODEL_FAST)
    : new OfflineDocumentProcessor();
  const aiProvider = anthropicClient
    ? new AnthropicAIProvider(anthropicClient, {
      fastModel: config.AI_MODEL_FAST,
      smartModel: config.AI_MODEL_SMART,
      maxTokens: config.AI_MAX_TOKENS_CLASSIFICATION,
      timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
    })
    : new FakeAIProvider();
  const regexClauseSegmenter = new RegexClauseSegmenter();
  const clauseSegmenter = new AdaptiveClauseSegmenter(regexClauseSegmenter, documentProcessor);
  const textExtractor = new PdfTextExtractor(documentProcessor);
  const aiUsageRepository = isInMemory
    ? new InMemoryAIUsageRepository()
    : new PostgresAIUsageRepository(pool);
  const legalContextProvider = config.RAG_ENABLED && !isInMemory
    ? new PostgresLegalContextProvider(
      new PostgresLegalProvisionRepository(pool),
      new HuggingFaceLocalEmbeddingProvider(config.EMBEDDING_CACHE_DIR),
    )
    : undefined;
  const analysisUseCase = new AnalyzeContractUseCase(
    contractRepository,
    textExtractor,
    clauseSegmenter,
    aiProvider,
    aiUsageRepository,
    new InMemoryAIClassificationCache(),
    undefined,
    legalContextProvider,
  );
  const analysisWorker = new InProcessAnalysisWorker(analysisUseCase);

  // Instantiate Use Cases
  const registerUserUseCase = new RegisterUserUseCase(userRepository);
  const loginUseCase = new LoginUseCase(userRepository);
  const refreshSessionUseCase = new RefreshSessionUseCase(userRepository);
  const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, contractRepository, fileStorage);
  const uploadContractUseCase = new UploadContractUseCase(contractRepository, fileStorage);
  const generateObjectionLetterUseCase = new GenerateObjectionLetterUseCase(
    contractRepository,
    aiProvider,
  );
  const downloadObjectionLetterPdfUseCase = new DownloadObjectionLetterPdfUseCase(
    contractRepository,
    new PdfKitGenerator(),
  );
  const updateObjectionLetterUseCase = new UpdateObjectionLetterUseCase(contractRepository);

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
    analysisWorker,
    generateObjectionLetterUseCase,
    downloadObjectionLetterPdfUseCase,
    updateObjectionLetterUseCase,
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
