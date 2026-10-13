const { execFileSync } = require('node:child_process');
const path = require('node:path');
require('dotenv').config();

const action = process.argv[2] || 'up';
if (!['up', 'down'].includes(action)) {
  throw new Error(`Unsupported migration action: ${action}`);
}

const databaseUrl = process.env.DATABASE_URL?.trim() || new URL(
  `postgresql://${encodeURIComponent(process.env.DB_USER || 'postgres')}:${encodeURIComponent(process.env.DB_PASSWORD || 'password')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'contratoclaro'}`,
).toString();

execFileSync(
  process.execPath,
  [
    require.resolve('node-pg-migrate/bin/node-pg-migrate'),
    action,
    '--migrations-dir',
    path.resolve(__dirname, '..', 'migrations'),
  ],
  {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  },
);
