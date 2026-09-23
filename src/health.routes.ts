import { Elysia } from 'elysia';
import { checkDatabaseConnection } from './database/pool.ts';

/**
 * Operational endpoints.
 *
 * Health is infrastructure/ops rather than a business domain, so it lives at
 * the application level instead of inside a feature module. It is the only
 * place outside the repository layer allowed to touch the pool directly, and
 * it performs a connectivity probe only — never domain queries.
 */
export const healthRoutes = new Elysia({ prefix: '/health', tags: ['Health'] })
  .get(
    '',
    async ({ set }) => {
      const databaseUp = await checkDatabaseConnection();
      set.status = databaseUp ? 200 : 503;
      return {
        status: databaseUp ? 'ok' : 'degraded',
        uptime: process.uptime(),
        checks: { database: databaseUp ? 'up' : 'down' },
        timestamp: new Date().toISOString(),
      };
    },
    { detail: { summary: 'Readiness health check including database connectivity' } },
  )
  .get('/live', () => ({ status: 'ok' }), {
    detail: { summary: 'Liveness probe' },
  });
