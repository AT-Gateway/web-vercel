import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { applyMigrationsFromSql } from './migrate.js';
import { MIGRATIONS } from './migrations.js';

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
