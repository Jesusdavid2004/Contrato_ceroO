import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('password'),
  DB_NAME: z.string().default('contratoclaro'),
  DATABASE_URL: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().url().optional(),
  ),
  JWT_SECRET: z.string().min(16).default('contratoclaro-dev-secret-super-secure-key-32chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CONTRACT_FILE_RETENTION: z.enum(['none', '7d', '30d']).default('none'),
  RAG_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  EMBEDDING_CACHE_DIR: z.string().default('storage/models'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default('claude-3-5-haiku-20241022'),
  AI_MODEL_SMART: z.string().default('claude-3-5-sonnet-20241022'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_FAST: z.string().default('gemini-2.0-flash'),
  GEMINI_MODEL_SMART: z.string().default('gemini-2.5-flash'),
  AI_MAX_TOKENS_CLASSIFICATION: z.coerce.number().int().positive().default(8192),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DAILY_AI_QUOTA: z.coerce.number().int().positive().default(20),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  GRPC_INTERNAL_TOKEN: z.string().default('dev-internal-token'),
  GRPC_PORT: z.coerce.number().int().positive().default(50051),
  AI_PROVIDER: z.enum(['anthropic', 'gemini', 'local', 'fake']).optional(),
  ANALYSIS_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  SEED_DEMO: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') return;

  if (!process.env.JWT_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must be explicitly configured in production.',
    });
  }
  if (!environment.DATABASE_URL && !process.env.DB_PASSWORD) {
    context.addIssue({
      code: 'custom',
      path: ['DB_PASSWORD'],
      message: 'Set DB_PASSWORD or DATABASE_URL in production.',
    });
  }
  if (!process.env.CORS_ORIGIN) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN must be explicitly configured in production.',
    });
  }
  // ANTHROPIC_API_KEY is optional: without it the backend uses the local
  // neural provider (embeddings + local OCR), no external API is required.
  if (environment.CONTRACT_FILE_RETENTION !== 'none') {
    context.addIssue({
      code: 'custom',
      path: ['CONTRACT_FILE_RETENTION'],
      message: 'Production file retention is unavailable until encrypted private object storage is configured. Set CONTRACT_FILE_RETENTION=none.',
    });
  }
  if (environment.AI_PROVIDER === 'fake') {
    context.addIssue({
      code: 'custom',
      path: ['AI_PROVIDER'],
      message: 'The deterministic fake provider is a test double and must never run in production. Use anthropic, gemini, or local.',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const config = parsed.data;
export type Config = typeof config;

export type AIProviderName = 'anthropic' | 'gemini' | 'local' | 'fake';
export type LocalTierName = 'local' | 'fake';

export interface TierSelection {
  /** Bulk classification of every clause: local model unless overridden. */
  fast: AIProviderName;
  /** Low-confidence rechecks and objection letters: hosted when keyed. */
  smart: AIProviderName;
}

/**
 * Resolves per-tier providers so the local model and the hosted API work
 * together. An explicit AI_PROVIDER forces a single provider for both tiers
 * (tests always use the fake double); otherwise the fast tier stays local
 * and the smart tier uses Anthropic or Gemini when a key is configured.
 */
export function resolveTierProviders(environment: Config = config): TierSelection {
  if (environment.NODE_ENV === 'test') return { fast: 'fake', smart: 'fake' };
  if (environment.AI_PROVIDER === 'fake' || environment.AI_PROVIDER === 'local') {
    return { fast: environment.AI_PROVIDER, smart: environment.AI_PROVIDER };
  }
  if (environment.AI_PROVIDER === 'anthropic') return { fast: 'anthropic', smart: 'anthropic' };
  if (environment.AI_PROVIDER === 'gemini') return { fast: 'gemini', smart: 'gemini' };
  if (environment.ANTHROPIC_API_KEY) return { fast: 'local', smart: 'anthropic' };
  if (environment.GEMINI_API_KEY) return { fast: 'local', smart: 'gemini' };
  return { fast: 'local', smart: 'local' };
}
