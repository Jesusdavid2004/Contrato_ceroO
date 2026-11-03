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
  // Single replica against a small managed database: few pooled connections.
  max: 10,
  // Close idle clients before proxies/NAT can silently drop them.
  idleTimeoutMillis: 30000,
  // Fail fast instead of hanging the single worker on a dead connection.
  connectionTimeoutMillis: 10000,
  // Abort runaway queries so one bad request cannot wedge the replica.
  statement_timeout: 30000,
  query_timeout: 35000,
  // TCP keepalives so pooled connections survive idle periods behind proxies.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});
