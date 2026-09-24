import { ValidationError } from '../errors/http-errors.ts';

/**
 * Reject request bodies that contain properties outside an allowlist.
 *
 * Elysia independently forces `additionalProperties: !normalize` on every
 * compiled body schema, so a schema-level `additionalProperties: false` is
 * ignored unless the whole application is built with `normalize: false`. That
 * flag would also make every query and path parameter strict, changing
 * unrelated endpoints, so strictness is applied per route instead.
 *
 * The `transform` hook is used because it runs before body validation and
 * therefore still sees the raw, un-normalized object — a `beforeHandle` or
 * handler sees the already-stripped body, where the extra keys are gone. Unlike
 * the `parse` hook, a `transform` error also keeps its `details` and does not
 * erase the documented request body.
 *
 * Attach as `transform`. Bodies that are not JSON objects (empty, arrays,
 * scalars) and malformed JSON are left to Elysia's normal validation.
 */
export function rejectUnknownBodyKeys(allowed: readonly string[]) {
  const permitted = new Set(allowed);

  return ({ body }: { body: unknown }): void => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return;

    const unknown = Object.keys(body).filter((key) => !permitted.has(key));
    if (unknown.length > 0) {
      throw new ValidationError('Request validation failed', {
        details: { code: 'UNKNOWN_FIELDS', unknown },
      });
    }
  };
}
