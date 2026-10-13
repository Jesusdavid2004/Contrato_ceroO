import { Pool } from 'pg';
import { config } from '../../shared/config';

export const pool = new Pool({
  ...(config.DATABASE_URL
    ? { connectionString: config.DATABASE_URL }
    : {
      user: config.DB_USER,
      host: config.DB_HOST,
      database: config.DB_NAME,
      password: config.DB_PASSWORD,
      port: config.DB_PORT,
    }),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
