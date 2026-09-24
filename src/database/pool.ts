import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { AppError } from '../shared/errors/app-error';
import { DatabaseError } from '../shared/errors/database-error';
import { ConflictError } from '../shared/errors/http-errors';
import { logger } from '../shared/logger';

/**
 * Minimal interface implemented by both the pool and a pooled client so that
 * repositories can accept either without knowing which one they received.
 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

export const pool = new Pool({
  connectionString: env.database.url,
  max: env.database.poolMax,
  idleTimeoutMillis: env.database.idleTimeoutMs,
  connectionTimeoutMillis: env.database.connectionTimeoutMs,
});

pool.on('error', (error) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error });
});

function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Translate a driver/query failure into an operational application error.
 *
 * PostgreSQL error codes are inspected so well-known constraint violations
 * become typed errors (e.g. unique violations → `ConflictError`, HTTP 409)
 * instead of opaque 500s. This is the single mapping point for pooled queries,
 * the `query` helper and `withTransaction`, so raw pg errors never reach the
 * error handler. Already-mapped `AppError`s pass through untouched.
 */
export function mapDatabaseError(cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  if (isUniqueViolation(cause)) {
    return new ConflictError('Resource already exists', {
      details: { code: 'UNIQUE_VIOLATION' },
    });
  }
  return new DatabaseError('Database query failed', { cause });
}

/**
 * Wrap the pool's `query` so every repository query funnels through the error
 * mapping above. The raw cause is logged here, then the mapped error is
 * thrown; the `ConflictError` carries no raw driver details.
 */
const rawQuery = pool.query.bind(pool) as unknown as (
  text: string,
  values?: readonly unknown[],
) => Promise<QueryResult>;

pool.query = (async (text: string, values?: readonly unknown[]) => {
  try {
    return await rawQuery(text, values);
  } catch (cause) {
    logger.error('Database query failed', { error: cause });
    throw mapDatabaseError(cause);
  }
}) as unknown as typeof pool.query;

/**
 * Execute a single parameterized query against the pool.
 *
 * Always use `$1, $2, ...` placeholders. Never interpolate user input into
 * `text`. `pool.query` is already wrapped with error mapping, so this simply
 * delegates.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<R>> {
  return pool.query<R>(text, values as unknown[] | undefined);
}

/**
 * Run `handler` inside a transaction, committing on success and rolling back
 * on any thrown error.
 *
 * `pool.query` participates in the transaction for the duration of the
 * callback, so repositories only need their injected `Queryable`.
 */
export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (cause) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to roll back transaction', { error: rollbackError });
    }

    if (cause instanceof AppError) throw cause;
    logger.error('Transaction failed', { error: cause });
    throw mapDatabaseError(cause);
  } finally {
    client.release();
  }
}

/** Verify connectivity; used by the health endpoint and startup checks. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
