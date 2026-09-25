import { Elysia } from 'elysia';
import { openapi } from '@elysiajs/openapi';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { categoryRoutes, filterRoutes, listingRoutes } from './modules/index';
import { healthRoutes } from './health.routes';
import { errorResponseSchema } from './shared/schemas/index';
import type { ApiErrorBody } from './shared/types/api';

// Re-exported for backwards compatibility; the canonical definition lives in
// `shared/schemas/openapi.ts` so route modules can use it without importing the
// root application (which would be circular).
export { errorResponseSchema };

/**
 * Root Elysia application.
 *
 * Composition order matters:
 *  1. error handling wraps everything below it,
 *  2. documentation is registered before routes so schemas are collected,
 *  3. feature modules mount under their own prefixes,
 *  4. the 404 catch-all is registered last.
 */
export const app = new Elysia()
  .use(errorHandler)
  .use(
    openapi({
      path: '/docs',
      specPath: '/docs/json',
      documentation: {
        info: {
          title: 'Automotive Marketplace API',
          version: '0.1.0',
          description:
            'REST API for an automotive marketplace: vehicle listings, hierarchical ' +
            'categories, dynamic filters, search, filtering and cursor pagination.',
        },
        tags: [
          { name: 'Health', description: 'Service and database health' },
          { name: 'Listings', description: 'Vehicle listing CRUD, search and filtering' },
          { name: 'Categories', description: 'Hierarchical category tree and traversal' },
          { name: 'Filters', description: 'Category filter definitions and facet counts' },
        ],
      },
      exclude: { paths: ['/health/live'] },
    }),
  )
  .use(healthRoutes)
  .use(listingRoutes)
  .use(categoryRoutes)
  .use(filterRoutes)
  .use(notFoundHandler);

export type App = typeof app;
export type { ApiErrorBody };

/**
 * Vercel entrypoint.
 *
 * Vercel's Elysia integration detects `src/app.ts` and expects the application
 * itself as the module's default export; it invokes the instance per request
 * rather than running a listening server. `app` already satisfies that handler
 * contract. `src/dev-server.ts` remains the local/Docker bootstrap that calls
 * `app.listen()` and is not used by Vercel.
 */
export default app;
