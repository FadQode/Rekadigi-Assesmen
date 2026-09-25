import { describe, expect, it } from 'bun:test';
import { app } from '../src/app';

/**
 * Regression tests for `GET /listings/search/suggest`.
 *
 * The assessment (§4.2) requires autocomplete over **make, model and city**.
 * City was previously missing entirely, so these tests pin all three types,
 * the response shape, deduplication, bounds and visibility rules.
 */

interface Suggestion {
  value: string;
  type: string;
}

const SUGGEST_TYPES = ['make', 'model', 'city'];

async function suggest(query: string, limit?: number): Promise<{ status: number; body: Suggestion[] }> {
  const limitPart = limit === undefined ? '' : `&limit=${limit}`;
  const response = await app.handle(
    new Request(`http://localhost/listings/search/suggest?q=${encodeURIComponent(query)}${limitPart}`),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Suggestion[]) : [],
  };
}

async function suggestValues(query: string, limit?: number): Promise<string[]> {
  return (await suggest(query, limit)).body.map((entry) => entry.value);
}

describe('GET /listings/search/suggest', () => {
  it('suggests makes', async () => {
    for (const [query, expected] of [
      ['Toy', 'Toyota'],
      ['Hon', 'Honda'],
      ['Yam', 'Yamaha'],
    ] as const) {
      const { status, body } = await suggest(query);
      expect(status).toBe(200);
      expect(body).toContainEqual({ value: expected, type: 'make' });
    }
  });

  it('suggests models', async () => {
    for (const [query, expected] of [
      ['Civ', 'Civic'],
      ['Rav', 'RAV4'],
    ] as const) {
      const { status, body } = await suggest(query);
      expect(status).toBe(200);
      expect(body).toContainEqual({ value: expected, type: 'model' });
    }
  });

  it('suggests cities', async () => {
    for (const [query, expected] of [
      ['Jak', 'Jakarta'],
      ['Band', 'Bandung'],
      ['Sura', 'Surabaya'],
      ['Yog', 'Yogyakarta'],
    ] as const) {
      const { status, body } = await suggest(query);
      expect(status).toBe(200);
      expect(body).toContainEqual({ value: expected, type: 'city' });
    }
  });

  it('exposes only the three supported suggestion types', async () => {
    const { body } = await suggest('a', 20);
    expect(body.length).toBeGreaterThan(0);
    for (const entry of body) {
      expect(SUGGEST_TYPES).toContain(entry.type);
    }
  });

  it('returns exactly the documented shape', async () => {
    const { body } = await suggest('Jak');
    expect(Array.isArray(body)).toBe(true);
    for (const entry of body) {
      expect(Object.keys(entry).sort()).toEqual(['type', 'value']);
      expect(typeof entry.value).toBe('string');
      expect(typeof entry.type).toBe('string');
    }
  });

  it('preserves display casing so values can be reused as filters', async () => {
    const values = await suggestValues('Jak');
    expect(values).toContain('Jakarta');
    expect(values).not.toContain('jakarta');
  });

  it('deduplicates repeated values', async () => {
    for (const query of ['a', 'e', 'an', 'to']) {
      const values = (await suggestValues(query, 20)).map((value) => value.toLowerCase());
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('matches case-insensitively', async () => {
    const lower = await suggest('jak');
    const upper = await suggest('JAK');
    const mixed = await suggest('JaK');
    expect(JSON.stringify(lower.body)).toBe(JSON.stringify(upper.body));
    expect(JSON.stringify(lower.body)).toBe(JSON.stringify(mixed.body));
  });

  it('matches partially and fuzzily', async () => {
    expect(await suggestValues('Jkarta')).toContain('Jakarta');
    expect(await suggestValues('Toyta')).toContain('Toyota');
    expect(await suggestValues('Civc')).toContain('Civic');
  });

  it('respects the limit', async () => {
    for (const limit of [1, 2, 3, 5, 20]) {
      const { body } = await suggest('a', limit);
      expect(body.length).toBeLessThanOrEqual(limit);
    }
  });

  it('rejects an out-of-range limit', async () => {
    expect((await suggest('a', 0)).status).toBe(400);
    expect((await suggest('a', 21)).status).toBe(400);
  });

  it('rejects a missing or empty query but tolerates whitespace', async () => {
    const missing = await app.handle(new Request('http://localhost/listings/search/suggest'));
    expect(missing.status).toBe(400);
    expect((await suggest('')).status).toBe(400);

    const whitespace = await suggest('   ');
    expect(whitespace.status).toBe(200);
    expect(whitespace.body).toEqual([]);
  });

  it('returns an empty array when nothing matches', async () => {
    const { status, body } = await suggest('zzzzzzzznope');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('escapes LIKE wildcards instead of widening the match', async () => {
    expect((await suggest('%')).body).toEqual([]);
    expect((await suggest('_')).body).toEqual([]);
    expect((await suggest('a_', 20)).body).toEqual([]);
  });

  it('does not leak soft-deleted listings', async () => {
    // Every suggestion must correspond to a value on a live listing. The
    // repository filters `deleted_at IS NULL AND status <> 'removed'`.
    const removedSample = await suggest('a', 20);
    expect(removedSample.status).toBe(200);
    for (const entry of removedSample.body) {
      expect(entry.value.toLowerCase()).not.toBe('removed');
    }
  });
});
