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
  AI_MAX_TOKENS_CLASSIFICATION: z.coerce.number().int().positive().default(8192),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DAILY_AI_QUOTA: z.coerce.number().int().positive().default(20),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const config = parsed.data;
export type Config = typeof config;
