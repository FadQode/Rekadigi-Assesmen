import { describe, expect, it } from 'bun:test';
import { app } from '../src/app.ts';

/**
 * Regression tests for listing filter enforcement.
 *
 * The original defect: unrecognised query parameters were dropped silently, so
 * `?make=Toyota&maxPrice=50000` returned 200 with rows priced above the bound.
 * These tests assert that every supplied predicate is enforced on every row,
 * for both the canonical names and the accepted aliases.
 */

interface ListingRow {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  fuelType: string;
  condition: string;
  transmission: string;
  city: string;
  status: string;
  createdAt: string;
}

interface ErrorBody {
  error: { code: string; details?: { code?: string; scope?: string; unknown?: string[] } };
}

async function fetchListings(path: string): Promise<{ status: number; body: unknown }> {
  const response = await app.handle(new Request(`http://localhost${path}`));
  return { status: response.status, body: await response.json() };
}

async function rows(path: string): Promise<ListingRow[]> {
  const { status, body } = await fetchListings(path);
  expect(status).toBe(200);
  return (body as { data: ListingRow[] }).data;
}

describe('listing filter enforcement', () => {
  it('enforces every predicate with canonical parameter names', async () => {
    const data = await rows(
      '/listings?limit=50&make=Toyota&fuelType=Petrol&priceMin=10000&priceMax=50000&yearMin=2018',
    );

    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.make).toBe('Toyota');
      expect(row.fuelType).toBe('Petrol');
      expect(row.price).toBeGreaterThanOrEqual(10000);
      expect(row.price).toBeLessThanOrEqual(50000);
      expect(row.year).toBeGreaterThanOrEqual(2018);
    }
  });

  it('enforces every predicate with the reported alias names', async () => {
    const data = await rows(
      '/listings?limit=50&make=Toyota&fuelType=Petrol&minPrice=10000&maxPrice=50000&minYear=2018',
    );

    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.make).toBe('Toyota');
      expect(row.fuelType).toBe('Petrol');
      expect(row.price).toBeGreaterThanOrEqual(10000);
      expect(row.price).toBeLessThanOrEqual(50000);
      expect(row.year).toBeGreaterThanOrEqual(2018);
    }
  });

  it('treats bound parameters as inclusive', async () => {
    const canonical = await rows('/listings?limit=100&priceMin=10000&priceMax=50000');
    const aliases = await rows('/listings?limit=100&minPrice=10000&maxPrice=50000');
    expect(canonical.map((r) => r.id)).toEqual(aliases.map((r) => r.id));
  });

  it('gives the canonical name precedence when both are supplied', async () => {
    const highFloor = await rows('/listings?limit=100&priceMin=40000&minPrice=1000');
    expect(highFloor.length).toBeGreaterThan(0);
    for (const row of highFloor) {
      expect(row.price).toBeGreaterThanOrEqual(40000);
    }

    const lowFloor = await rows('/listings?limit=100&priceMin=1000&minPrice=40000');
    for (const row of lowFloor) {
      expect(row.price).toBeGreaterThanOrEqual(1000);
    }
  });

  it('applies maxPrice alone (the specific reported violation)', async () => {
    const data = await rows('/listings?limit=100&make=Toyota&maxPrice=50000');
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.price).toBeLessThanOrEqual(50000);
    }
  });

  it('applies minYear alone (the specific reported violation)', async () => {
    const data = await rows('/listings?limit=100&make=Toyota&minYear=2018');
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.year).toBeGreaterThanOrEqual(2018);
    }
  });

  it('applies the alias range filters on the search endpoint too', async () => {
    const data = await rows('/listings/search?limit=50&q=Honda&minPrice=40000');
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.price).toBeGreaterThanOrEqual(40000);
    }
  });

  it('combines filters conjunctively with sorting and pagination', async () => {
    const data = await rows(
      '/listings?limit=25&make=Toyota&fuelType=Petrol&minPrice=10000&maxPrice=50000&minYear=2018&sortBy=price&sortDirection=asc',
    );
    for (const row of data) {
      expect(row.make).toBe('Toyota');
      expect(row.fuelType).toBe('Petrol');
      expect(row.price).toBeGreaterThanOrEqual(10000);
      expect(row.price).toBeLessThanOrEqual(50000);
      expect(row.year).toBeGreaterThanOrEqual(2018);
    }
    const prices = data.map((r) => r.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('never returns soft-deleted listings alongside filters', async () => {
    const data = await rows('/listings?limit=100&make=Toyota');
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.status).not.toBe('removed');
    }
  });

  /**
   * An omitted `status` must not be silently defaulted to `available`.
   *
   * `t.UnionEnum` injected a default equal to its first member, so browsing
   * without `?status=` returned only available listings and hid sold/pending
   * ones. This asserted the intersection with SQL: the row that exposed the bug
   * was a `sold` Toyota matching every supplied predicate.
   */
  it('does not imply status when the parameter is omitted', async () => {
    const data = await rows(
      '/listings?limit=100&make=Toyota&fuelType=Petrol&minPrice=10000&maxPrice=50000&minYear=2018',
    );
    expect(data.length).toBeGreaterThan(0);

    // Non-available statuses are reachable without asking for them.
    const statuses = new Set(data.map((row) => row.status));
    expect([...statuses].some((status) => status !== 'available')).toBe(true);

    // And the result set agrees with the equivalent predicate on the database.
    const everything = await rows('/listings?limit=100&status=sold');
    expect(everything.every((row) => row.status === 'sold')).toBe(true);
  });

  it('still honours an explicit status filter', async () => {
    for (const status of ['available', 'sold', 'pending'] as const) {
      const data = await rows(`/listings?limit=20&status=${status}`);
      for (const row of data) {
        expect(row.status).toBe(status);
      }
    }
  });
});

describe('listing sort ordering', () => {
  /**
   * The documented browse ordering is `created_at DESC, id DESC`. An omitted
   * `sortDirection` used to become `asc` because `t.UnionEnum` defaulted to its
   * first member, inverting the primary browse order.
   */
  it('defaults to the documented created_at DESC ordering', async () => {
    const data = await rows('/listings?limit=25');
    expect(data.length).toBeGreaterThan(1);

    const times = data.map((row) => new Date(row.createdAt as string).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]!).toBeGreaterThanOrEqual(times[i]!);
    }
  });

  it('honours an explicit sort direction', async () => {
    const ascending = await rows('/listings?limit=25&sortBy=price&sortDirection=asc');
    const ascendingPrices = ascending.map((row) => row.price);
    for (let i = 1; i < ascendingPrices.length; i++) {
      expect(ascendingPrices[i - 1]!).toBeLessThanOrEqual(ascendingPrices[i]!);
    }

    const descending = await rows('/listings?limit=25&sortBy=price&sortDirection=desc');
    const descendingPrices = descending.map((row) => row.price);
    for (let i = 1; i < descendingPrices.length; i++) {
      expect(descendingPrices[i - 1]!).toBeGreaterThanOrEqual(descendingPrices[i]!);
    }
  });

  it('rejects an unknown status or sort value', async () => {
    expect((await fetchListings('/listings?limit=1&status=bogus')).status).toBe(400);
    expect((await fetchListings('/listings?limit=1&sortBy=bogus')).status).toBe(400);
    expect((await fetchListings('/listings?limit=1&sortDirection=sideways')).status).toBe(400);
  });
});

describe('unknown listing query parameters are rejected', () => {
  it('rejects an unsupported parameter instead of ignoring it', async () => {
    const { status, body } = await fetchListings('/listings?limit=5&make=Toyota&bogus=1');
    expect(status).toBe(400);
    const error = (body as ErrorBody).error;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.code).toBe('UNKNOWN_FIELDS');
    expect(error.details?.scope).toBe('query');
    expect(error.details?.unknown).toContain('bogus');
  });

  it('rejects a near-miss typo of a real filter', async () => {
    const { status, body } = await fetchListings('/listings?limit=5&minPrize=100');
    expect(status).toBe(400);
    expect((body as ErrorBody).error.details?.unknown).toContain('minPrize');
  });

  it('rejects unknown parameters on the search endpoint', async () => {
    const { status } = await fetchListings('/listings/search?q=Honda&nope=1');
    expect(status).toBe(400);
  });

  it('accepts every documented parameter', async () => {
    const { status } = await fetchListings(
      '/listings?limit=1&sortBy=price&sortDirection=asc&status=available&includeDescendants=true',
    );
    expect(status).toBe(200);
  });

  it('does not leak internals when rejecting', async () => {
    const response = await app.handle(
      new Request('http://localhost/listings?limit=5&bogus=1'),
    );
    const text = await response.text();
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('pg-');
    expect(text).not.toContain('node_modules');
  });
});
