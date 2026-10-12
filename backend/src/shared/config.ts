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
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('contratoclaro-dev-secret-super-secure-key-32chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CONTRACT_FILE_RETENTION: z.enum(['none', '7d', '30d']).default('none'),
  RAG_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default('claude-3-5-haiku-20241022'),
  AI_MODEL_SMART: z.string().default('claude-3-5-sonnet-20241022'),
  DAILY_AI_QUOTA: z.coerce.number().default(20),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const config = parsed.data;
export type Config = typeof config;
