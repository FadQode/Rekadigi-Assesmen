import { ValidationError } from '../errors/http-errors.ts';

/** Reject an object containing keys outside `allowed`. */
function assertNoUnknownKeys(
  value: unknown,
  allowed: readonly string[],
  code: string,
  scope: 'body' | 'query',
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;

  const permitted = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !permitted.has(key));
  if (unknown.length > 0) {
    throw new ValidationError('Request validation failed', {
      details: { code, scope, unknown },
    });
  }
}

/**
 * Reject request bodies that contain properties outside an allowlist.
 *
 * Elysia independently forces `additionalProperties: !normalize` on every
 * compiled schema, so a schema-level `additionalProperties: false` is ignored
 * unless the whole application is built with `normalize: false`. That flag would
 * also make every query and path parameter strict, changing unrelated
 * endpoints, so strictness is applied per route instead.
 *
 * The `transform` hook is used because it runs before validation and therefore
 * still sees the raw object. Unlike the `parse` hook, a `transform` error keeps
 * its `details` and does not erase the documented request body.
 *
 * Attach as `transform`. Bodies that are not JSON objects (empty, arrays,
 * scalars) and malformed JSON are left to Elysia's normal validation.
 */
export function rejectUnknownBodyKeys(allowed: readonly string[]) {
  return ({ body }: { body: unknown }): void =>
    assertNoUnknownKeys(body, allowed, 'UNKNOWN_FIELDS', 'body');
}

/**
 * Reject query strings containing parameters outside an allowlist.
 *
 * Unknown query parameters are otherwise dropped silently: a request like
 * `?make=Toyota&maxPrice=50000` would return 200 with unfiltered rows because
 * `maxPrice` never reached the service. Rejecting them turns a silently wrong
 * result into a clear 400.
 *
 * Reads the parameter names from the request URL rather than the parsed object,
 * because Elysia has already removed unknown keys by the time a `transform`
 * hook receives `query`.
 */
export function rejectUnknownQueryKeys(allowed: readonly string[]) {
  const permitted = new Set(allowed);

  return ({ request }: { request: Request }): void => {
    const unknown: string[] = [];
    for (const key of new URL(request.url).searchParams.keys()) {
      if (!permitted.has(key) && !unknown.includes(key)) unknown.push(key);
    }

    if (unknown.length > 0) {
      throw new ValidationError('Request validation failed', {
        details: { code: 'UNKNOWN_FIELDS', scope: 'query', unknown },
      });
    }
  };
}
