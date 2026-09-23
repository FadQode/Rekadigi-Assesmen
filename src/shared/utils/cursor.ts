/**
 * Cursor pagination helpers.
 *
 * The cursor is an opaque, URL-safe Base64 encoding of a JSON payload. It is
 * deliberately implementation-agnostic so that different modules can encode
 * the columns required for their own deterministic ordering.
 *
 * Listing ordering uses `(created_at DESC, id DESC)`, so its cursor carries
 * both `createdAt` and `id`.
 */

export function encodeCursor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor<T extends Record<string, unknown>>(cursor: string): T {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Cursor payload must be an object');
    }
    return parsed as T;
  } catch (cause) {
    throw new Error('Malformed pagination cursor', { cause });
  }
}
