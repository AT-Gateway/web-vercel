import pg from 'pg';

const { Pool, types } = pg;

// Parse int8 (BIGINT) as number.
// We only store millisecond timestamps here, which are safe in JS number range.
types.setTypeParser(20, (v: string) => Number(v));

function shouldUseSsl(databaseUrl: string) {
  if ((process.env.PGSSLMODE ?? '').toLowerCase() === 'disable') return false;
  return !/localhost|127\.0\.0\.1|postgres:postgres@db/i.test(databaseUrl);
}

export function createPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });
}

export type DbPool = ReturnType<typeof createPool>;
