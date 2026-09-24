import { t } from 'elysia';

/**
 * Matches the UUID *shape* accepted by PostgreSQL's `uuid` type: 32 hex digits
 * in 8-4-4-4-12 form, upper or lower case.
 *
 * The identifier columns are `uuid`, and PostgreSQL accepts any value of this
 * shape. Two things make Elysia's built-in `format: 'uuid'` validator a poor
 * fit here:
 *
 * - the seed generates deterministic ids from a SHA-1 digest, which are valid
 *   PostgreSQL uuids but are not RFC-4122 version-4 uuids;
 * - `format: 'uuid'` only accepts version-4 uuids, so it rejected every seeded
 *   id (and ids derived from them) with `400 VALIDATION_ERROR`, making the
 *   seeded dataset unreachable through the API.
 *
 * Validating the shape instead keeps HTTP validation aligned with what the
 * database genuinely accepts, while still rejecting anything that is not a
 * uuid at all.
 */
export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** UUID-shaped string schema, optionally with an OpenAPI description. */
export function uuidSchema(description?: string) {
  return t.String({
    pattern: UUID_PATTERN,
    ...(description === undefined ? {} : { description }),
  });
}
