import { Elysia } from 'elysia';
import { openapi } from '@elysiajs/openapi';
import { errorHandler } from './middleware/error-handler.ts';
import { notFoundHandler } from './middleware/not-found.ts';
import { categoryRoutes, filterRoutes, listingRoutes } from './modules/index.ts';
import { healthRoutes } from './health.routes.ts';
import type { ApiErrorBody } from './shared/types/api.ts';

export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
      },
    },
  },
} as const;

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
 * contract. `src/server.ts` remains the local/Docker bootstrap that calls
 * `app.listen()` and is not used by Vercel.
 */
export default app;
