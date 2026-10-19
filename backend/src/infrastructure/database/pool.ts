import { Pool } from 'pg';
import { config } from '../../shared/config';

const useSsl =
  Boolean(config.DATABASE_URL?.includes('sslmode=require')) ||
  (config.NODE_ENV === 'production' &&
    !config.DATABASE_URL?.includes('localhost') &&
    !config.DATABASE_URL?.includes('127.0.0.1') &&
    !config.DB_HOST?.includes('localhost') &&
    !config.DB_HOST?.includes('127.0.0.1') &&
    !config.DB_HOST?.includes('db'));

export const pool = new Pool({
  ...(config.DATABASE_URL
    ? {
      connectionString: config.DATABASE_URL,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    }
    : {
      user: config.DB_USER,
      host: config.DB_HOST,
      database: config.DB_NAME,
      password: config.DB_PASSWORD,
      port: config.DB_PORT,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    }),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
