import { loadConfig } from '../config';
import { createPool } from './pool';
import { applyMigrationsFromSql } from './migrate';
import { MIGRATIONS } from './migrations';

const cfg = loadConfig();

if (!cfg.databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations manually.');
}

const pool = createPool(cfg.databaseUrl);

try {
  await applyMigrationsFromSql(pool as any, MIGRATIONS);
} finally {
  await pool.end();
}
