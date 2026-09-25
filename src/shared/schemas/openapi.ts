/**
 * OpenAPI schema fragments shared across modules.
 *
 * Kept in `shared` rather than `app.ts` so route modules can reference them
 * without importing the root application, which would create a circular
 * dependency (`app` -> routes -> `app`).
 */

/**
 * Shape returned by every error response.
 *
 * Attached to routes as `detail.responses` metadata, which documents the
 * contract in OpenAPI without making Elysia validate or strip the real body.
 *
 * Deliberately not `as const`: the readonly literal types that `as const`
 * produces (`readonly ['error']`, readonly properties) are not assignable to
 * OpenAPI's mutable `ResponsesObject` type.
 */
export const errorResponseSchema: Record<string, unknown> = {
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
};
