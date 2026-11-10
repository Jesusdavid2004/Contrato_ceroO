import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import { config, resolveTierProviders } from './shared/config';
import { errorHandler } from './shared/errors/errorHandler';
import { logger } from './shared/logger';

// Infrastructure
import { pool } from './infrastructure/database/pool';
import { PostgresUserRepository, InMemoryUserRepository } from './infrastructure/repositories/UserRepositoryImpl';
import { PostgresContractRepository, InMemoryContractRepository } from './infrastructure/repositories/ContractRepositoryImpl';
import { LocalFileStorage } from './infrastructure/services/LocalFileStorage';
import { PdfTextExtractor } from './infrastructure/services/PdfTextExtractor';
import { RegexClauseSegmenter } from './infrastructure/services/RegexClauseSegmenter';
import { AdaptiveClauseSegmenter } from './infrastructure/services/AdaptiveClauseSegmenter';
import { FakeAIProvider } from './infrastructure/ai/FakeAIProvider';
import { LocalAIProvider } from './infrastructure/ai/LocalAIProvider';
import { TieredAIProvider } from './infrastructure/ai/TieredAIProvider';
import { GeminiAIProvider } from './infrastructure/ai/GeminiAIProvider';
import { GeminiDocumentProcessor } from './infrastructure/ai/GeminiDocumentProcessor';
import { LocalDocumentProcessor } from './infrastructure/ai/LocalDocumentProcessor';
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
import { RecoverStuckContractsUseCase } from './application/use-cases/RecoverStuckContractsUseCase';
import { UploadContractUseCase } from './application/use-cases/UploadContractUseCase';
import { AnalyzeContractUseCase } from './application/use-cases/AnalyzeContractUseCase';
import { GenerateObjectionLetterUseCase } from './application/use-cases/GenerateObjectionLetterUseCase';
import { DownloadObjectionLetterPdfUseCase } from './application/use-cases/DownloadObjectionLetterPdfUseCase';
import { PdfKitGenerator } from './infrastructure/services/PdfKitGenerator';
import { UpdateObjectionLetterUseCase } from './application/use-cases/UpdateObjectionLetterUseCase';

// Routes
import { createAuthRouter } from './presentation/routes/authRoutes';
import { createContractRouter } from './presentation/routes/contractRoutes';
import { createRealtimeRouter } from './presentation/realtime/realtimeRoutes';
import { RealtimeTicketStore } from './presentation/realtime/realtimeTickets';
import { RealtimeServer } from './presentation/realtime/realtimeServer';
import { registerRealtimeContext } from './presentation/realtime/realtimeContext';
import { InMemoryAnalysisEventBus } from './infrastructure/realtime/InMemoryAnalysisEventBus';
import type { AnalysisEventPublisher } from './domain/services/AnalysisEventPublisher';

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
  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  const userRepository = isInMemory ? new InMemoryUserRepository() : new PostgresUserRepository(pool);
  const contractRepository = isInMemory ? new InMemoryContractRepository() : new PostgresContractRepository(pool);
  const fileStorage = new LocalFileStorage();
  // Hybrid AI wiring: the fast tier classifies every clause with the local
  // model; the smart tier (low-confidence rechecks + letters) uses the free
  // Gemini provider when GEMINI_API_KEY is set, otherwise the local model.
  const tiers = isInMemory ? { fast: 'fake' as const, smart: 'fake' as const } : resolveTierProviders();
  const localEmbedder = new HuggingFaceLocalEmbeddingProvider(config.EMBEDDING_CACHE_DIR);
  const buildProvider = (name: typeof tiers.fast | typeof tiers.smart) => {
    switch (name) {
      case 'gemini':
        if (!config.GEMINI_API_KEY) throw new Error('AI_PROVIDER=gemini requires GEMINI_API_KEY.');
        return new GeminiAIProvider({
          apiKey: config.GEMINI_API_KEY,
          fastModel: config.GEMINI_MODEL_FAST,
          smartModel: config.GEMINI_MODEL_SMART,
          maxTokens: config.AI_MAX_TOKENS_CLASSIFICATION,
          timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
        });
      case 'fake':
        return new FakeAIProvider();
      default:
        return new LocalAIProvider(localEmbedder);
    }
  };
  const aiProvider = new TieredAIProvider(buildProvider(tiers.fast), buildProvider(tiers.smart));
  const activeProvider = tiers.fast === tiers.smart ? tiers.fast : `${tiers.fast}+${tiers.smart}`;
  logger.info('AI providers active', { fast: tiers.fast, smart: tiers.smart });
  const documentProcessor = tiers.smart === 'gemini' && config.GEMINI_API_KEY
    ? new GeminiDocumentProcessor(config.GEMINI_API_KEY, config.GEMINI_MODEL_FAST)
    : tiers.smart === 'local'
      ? new LocalDocumentProcessor(config.EMBEDDING_CACHE_DIR)
      : new OfflineDocumentProcessor();
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
  const ticketStore = new RealtimeTicketStore();
  const realtimeServer = new RealtimeServer(
    ticketStore,
    async (userId, contractId) => {
      const contract = await contractRepository.findById(contractId);
      if (!contract) return null;
      if (contract.ownerId !== userId) return 'forbidden';
      return {
        status: contract.status,
        failureMessageKey: contract.failureReason,
        globalRiskScore: contract.globalRiskScore,
      };
    },
    { allowedOrigins },
  );
  const inMemoryEventPublisher: AnalysisEventPublisher = new InMemoryAnalysisEventBus(realtimeServer);
  const analysisUseCase = new AnalyzeContractUseCase(
    contractRepository,
    textExtractor,
    clauseSegmenter,
    aiProvider,
    aiUsageRepository,
    new InMemoryAIClassificationCache(),
    undefined,
    legalContextProvider,
    isInMemory ? inMemoryEventPublisher : undefined,
  );
  const analysisWorker = new InProcessAnalysisWorker(analysisUseCase);

  // Startup recovery: jobs interrupted by a restart can never complete.
  void new RecoverStuckContractsUseCase(
    contractRepository,
    config.ANALYSIS_JOB_TIMEOUT_MS,
  )
    .execute()
    .then((recovered) => {
      if (recovered > 0) logger.info('Recovered stuck analysis jobs', { recovered });
    })
    .catch((error: unknown) => {
      logger.error('Stuck job recovery failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    });

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

  app.get(['/ready', '/api/ready'], async (_req, res) => {
    if (isInMemory) {
      res.status(200).json({ status: 'ready', provider: activeProvider });
      return;
    }

    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready', provider: activeProvider });
    } catch (error) {
      logger.warn('Backend readiness check failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      res.status(503).json({ status: 'not_ready' });
    }
  });

  // OpenAPI Specification and Swagger UI Documentation
  const openApiSpec = loadOpenApiSpec();
  if (openApiSpec) {
    app.get(['/openapi.json', '/api/v1/openapi.json'], (_req, res) => {
      res.status(200).json(openApiSpec);
    });
    app.use(
      ['/docs', '/api/v1/docs'],
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'ContratoClaro API Documentation',
      }),
    );
  }

  // Mount API v1 Routes
  const authRouter = createAuthRouter({
    registerUserUseCase,
    loginUseCase,
    refreshSessionUseCase,
    deleteAccountUseCase,
    onAccountDeleted: (userId) => {
      realtimeServer.closeUserConnections(userId);
    },
  });

  const contractRouter = createContractRouter({
    uploadContractUseCase,
    contractRepository,
    fileStorage,
    analysisWorker,
    eventPublisher: isInMemory ? inMemoryEventPublisher : undefined,
    generateObjectionLetterUseCase,
    downloadObjectionLetterPdfUseCase,
    updateObjectionLetterUseCase,
  });

  const realtimeRouter = createRealtimeRouter({ ticketStore });
  registerRealtimeContext(app, {
    ticketStore,
    realtimeServer,
    eventPublisher: isInMemory ? inMemoryEventPublisher : undefined,
  });

  // Versioned v1 routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/contracts', contractRouter);
  app.use('/api/v1/realtime', realtimeRouter);

  // Legacy route aliases for backwards compatibility
  app.use('/api/auth', authRouter);
  app.use('/api/contracts', contractRouter);
  app.use('/api/realtime', realtimeRouter);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

function loadOpenApiSpec(): Record<string, unknown> | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'docs', 'openapi.yaml'),
    path.resolve(process.cwd(), '..', 'docs', 'openapi.yaml'),
    path.resolve(__dirname, '../../../docs/openapi.yaml'),
    path.resolve(__dirname, '../../docs/openapi.yaml'),
    path.resolve(__dirname, '../docs/openapi.yaml'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const file = fs.readFileSync(p, 'utf8');
        return YAML.parse(file) as Record<string, unknown>;
      } catch (e) {
        logger.warn('Failed to parse openapi.yaml', { error: String(e) });
      }
    }
  }
  return null;
}

export const app = createApp();
export default app;
