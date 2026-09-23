import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env.ts';
import { DatabaseError } from '../shared/errors/database-error.ts';
import { logger } from '../shared/logger.ts';

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

/**
 * Execute a single parameterized query against the pool.
 *
 * Always use `$1, $2, ...` placeholders. Never interpolate user input into
 * `text`.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<R>> {
  try {
    return await pool.query<R>(text, values as unknown[] | undefined);
  } catch (cause) {
    logger.error('Database query failed', { error: cause });
    throw new DatabaseError('Database query failed', { cause });
  }
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

    if (cause instanceof DatabaseError) throw cause;
    logger.error('Transaction failed', { error: cause });
    throw new DatabaseError('Transaction failed', { cause });
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
