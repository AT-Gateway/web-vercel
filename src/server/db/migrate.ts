import fs from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

const MIGRATION_LOCK = "hashtext('sms_gateway_schema_migrations')";

async function ensureMigrationTable(client: { query: (sql: string, params?: any[]) => Promise<any> }) {
  await client.query(
    `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    `
  );
}

async function runMigrations(
  pool: Pool,
  migrations: Array<{ id: string; sql: string }>,
) {
  const client = await pool.connect();
  try {
    // Multiple Vercel serverless instances may cold-start at the same time.
    // This lock keeps first-run migrations from racing each other.
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK});`);
    await ensureMigrationTable(client);

    const appliedRes = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.id));

    for (const migration of [...migrations].sort((a, b) => a.id.localeCompare(b.id))) {
      if (applied.has(migration.id)) continue;

      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations(id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [migration.id]);
        await client.query('COMMIT');
        applied.add(migration.id);
        // eslint-disable-next-line no-console
        console.log(`[migrate] applied ${migration.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK});`).catch(() => {});
    client.release();
  }
}

/**
 * Minimal SQL migration runner using .sql files from disk. Useful for local scripts.
 */
export async function applyMigrations(pool: Pool, migrationsDir: string) {
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const migrations = await Promise.all(
    files.map(async (file) => ({
      id: file,
      sql: await fs.readFile(path.join(migrationsDir, file), 'utf8'),
    }))
  );

  await runMigrations(pool, migrations);
}

/**
 * Migration runner for serverless/Next bundling. SQL is imported from TypeScript
 * so Vercel does not need runtime filesystem access to migration files.
 */
export async function applyMigrationsFromSql(
  pool: Pool,
  migrations: Array<{ id: string; sql: string }>
) {
  await runMigrations(pool, migrations);
}
