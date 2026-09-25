import { afterAll, describe, expect, it } from 'bun:test';
import { app } from '../src/app';
import { pool } from '../src/database/pool';

/**
 * Regression tests for `search_vector` maintenance.
 *
 * `listings.search_vector` is declared in migration 003 and GIN-indexed in 004,
 * but nothing kept it current: only the seed ran a one-off `UPDATE ... WHERE
 * search_vector IS NULL`. That produced two defects the assessment's "full-text
 * search" requirement depends on:
 *
 *   - a listing created via `POST /listings` had `search_vector = NULL` and was
 *     unreachable through `GET /listings/search?q=`;
 *   - a listing updated via `PATCH /listings/:id` kept a stale vector, so the
 *     old text still matched and the new text did not.
 *
 * Migration 005 adds a trigger over the same source columns the seed used. These
 * tests pin that behaviour. They create and then delete their own fixture rows so
 * the seeded dataset is left untouched.
 */

const MARKER = 'Svtriggertest';
const SUBCATEGORY_SLUG = 'suv';

let categoryId: string | undefined;
const createdIds: string[] = [];

async function request(path: string, init?: { method?: string; body?: unknown }) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : null };
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    title: `${MARKER}alpha`,
    description: 'fixture for search vector trigger',
    categoryId,
    make: `${MARKER}make`,
    model: `${MARKER}model`,
    year: 2024,
    mileage: 10,
    price: 12345,
    condition: 'Used',
    transmission: 'Automatic',
    fuelType: 'Petrol',
    color: 'Black',
    city: 'Bandung',
    ...overrides,
  };
}

async function searchIds(query: string): Promise<string[]> {
  const { status, body } = await request(`/listings/search?q=${encodeURIComponent(query)}&limit=50`);
  expect(status).toBe(200);
  return (body.data as Array<{ id: string }>).map((row) => row.id);
}

describe('search_vector maintenance', () => {
  it('resolves a fixture category', async () => {
    const found = await pool.query<{ id: string }>('SELECT id FROM categories WHERE slug = $1', [
      SUBCATEGORY_SLUG,
    ]);
    categoryId = found.rows[0]?.id;
    expect(categoryId).toBeDefined();
  });

  it('populates search_vector when a listing is created through the API', async () => {
    const { status, body } = await request('/listings', { method: 'POST', body: baseBody() });
    expect(status).toBe(201);

    createdIds.push(body.id as string);

    const row = await pool.query<{ is_null: boolean }>(
      'SELECT search_vector IS NULL AS is_null FROM listings WHERE id = $1',
      [body.id],
    );
    expect(row.rows[0]?.is_null).toBe(false);
  });

  it('makes a newly created listing reachable by full-text search', async () => {
    const id = createdIds[0]!;
    for (const term of [`${MARKER}alpha`, `${MARKER}make`, `${MARKER}model`, 'Bandung']) {
      expect(await searchIds(term)).toContain(id);
    }
  });

  it('refreshes search_vector on update so stale text stops matching', async () => {
    const id = createdIds[0]!;

    const patched = await request(`/listings/${id}`, {
      method: 'PATCH',
      body: { title: `${MARKER}beta`, city: 'Semarang' },
    });
    expect(patched.status).toBe(200);

    expect(await searchIds(`${MARKER}alpha`)).not.toContain(id);
    expect(await searchIds(`${MARKER}beta`)).toContain(id);
    expect(await searchIds('Semarang')).toContain(id);
  });

  it('keeps unchanged fields searchable after an update', async () => {
    const id = createdIds[0]!;
    expect(await searchIds(`${MARKER}make`)).toContain(id);
    expect(await searchIds(`${MARKER}model`)).toContain(id);
  });

  it('preserves the vector when only non-text fields change', async () => {
    const id = createdIds[0]!;
    const patched = await request(`/listings/${id}`, { method: 'PATCH', body: { price: 54321 } });
    expect(patched.status).toBe(200);
    expect(await searchIds(`${MARKER}beta`)).toContain(id);
  });

  it('excludes soft-deleted listings from search', async () => {
    const id = createdIds[0]!;
    const deleted = await request(`/listings/${id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect(await searchIds(`${MARKER}beta`)).not.toContain(id);
  });
});

afterAll(async () => {
  // Remove every fixture row so the seeded dataset stays at exactly 1000.
  // The pool is shared across the test process and is deliberately not closed
  // here; other suites still need it.
  await pool.query('DELETE FROM listings WHERE make LIKE $1', [`${MARKER}%`]);
});
