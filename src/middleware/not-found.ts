import { Elysia } from 'elysia';
import type { ApiErrorBody } from '../shared/types/api';

/**
 * Catch-all 404 handler.
 *
 * Registered last so that only genuinely unmatched paths reach it. The
 * `onError` hook in `error-handler.ts` covers framework-level NOT_FOUND, but
 * an explicit route gives a deterministic response for unmatched paths.
 */
export const notFoundHandler = new Elysia({ name: 'middleware.not-found' }).all(
  '*',
  ({ request, set }): ApiErrorBody => {
    set.status = 404;
    return {
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${new URL(request.url).pathname} not found`,
      },
    };
  },
  { detail: { hide: true } },
);
