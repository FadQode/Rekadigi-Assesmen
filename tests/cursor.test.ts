import { describe, expect, it } from 'bun:test';
import { decodeCursor, encodeCursor } from '../src/shared/utils/cursor.ts';

describe('cursor pagination encoding', () => {
  it('round-trips a cursor payload', () => {
    const payload = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc-123' };
    const cursor = encodeCursor(payload);

    expect(decodeCursor(cursor)).toEqual(payload);
  });

  it('produces URL-safe output', () => {
    const cursor = encodeCursor({ id: '?&/=+' });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-valid-cursor')).toThrow();
  });
});
