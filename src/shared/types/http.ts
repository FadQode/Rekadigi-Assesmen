/**
 * Structural subset of Elysia's request context used by controllers.
 *
 * Controllers are the only layer allowed to touch these HTTP concerns; the
 * service and repository layers must not. Keeping this type structural (rather
 * than importing Elysia) is what lets controllers stay Elysia-free while still
 * being assignable to Elysia route handlers.
 */
export interface HttpContext<Body = unknown, Query = unknown, Params = unknown> {
  body: Body;
  query: Query;
  params: Params;
  set: {
    status?: number | string;
  };
  /** Elysia's imperative status helper, available when a return value is used. */
  status: (code: number, response?: unknown) => unknown;
}
