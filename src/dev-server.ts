import { app } from './app.ts';
import { env } from './config/env.ts';
import { closePool, checkDatabaseConnection } from './database/pool.ts';
import { logger } from './shared/logger.ts';

/**
 * Process entrypoint.
 *
 * Phase 0 logs database connectivity but does not hard-fail when PostgreSQL is
 * unavailable, so the HTTP surface (and its tests) remain usable while the
 * Phase 1 schema and migrations are being built.
 */
export async function startServer(): Promise<void> {
  const databaseUp = await checkDatabaseConnection();
  if (databaseUp) {
    logger.info('PostgreSQL connection established');
  } else {
    logger.warn('PostgreSQL is not reachable; start it before exercising data endpoints');
  }

  await app.listen({ port: env.port, hostname: env.host });

  logger.info('Server started', {
    environment: env.nodeEnv,
    url: `http://${env.host}:${env.port}`,
    docs: `http://${env.host}:${env.port}/docs`,
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutting down', { signal });
  try {
    await app.stop();
    await closePool();
  } catch (error) {
    logger.error('Error during shutdown', { error });
  } finally {
    process.exit(0);
  }
}

if (import.meta.main) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  startServer().catch((error: unknown) => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });
}
