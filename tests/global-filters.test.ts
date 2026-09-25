import { describe, expect, it } from 'bun:test';
import { app } from '../src/app';

/**
 * Regression tests for `GET /filters` — the global facet endpoint.
 *
 * The assessment defines `GET /filters` as "all available filter options with
 * counts (facets)", distinct from `GET /filters/:categoryId` ("filter
 * attributes specific to a category"). These tests pin that distinction: the
 * global view must be deduplicated by filter key and carry counts across every
 * non-deleted listing.
 */

interface FacetOption {
  value: string;
  label?: string;
  count?: number;
}

interface Facet {
  key: string;
  label: string;
  type: 'enum' | 'range' | 'boolean';
  options: FacetOption[];
  min?: number | null;
  max?: number | null;
  count: number;
}

async function getFacets(path: string): Promise<{ status: number; facets: Facet[] }> {
  const response = await app.handle(new Request(`http://localhost${path}`));
  const body = await response.json();
  return { status: response.status, facets: body as Facet[] };
}

describe('GET /filters global facets', () => {
  it('returns facet data rather than an empty list', async () => {
    const { status, facets } = await getFacets('/filters');
    expect(status).toBe(200);
    expect(Array.isArray(facets)).toBe(true);
    expect(facets.length).toBeGreaterThan(0);
  });

  it('deduplicates filter definitions by key', async () => {
    const { facets } = await getFacets('/filters');
    const keys = facets.map((facet) => facet.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('exposes counts for every facet', async () => {
    const { facets } = await getFacets('/filters');
    for (const facet of facets) {
      expect(typeof facet.count).toBe('number');
      expect(facet.count).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives enum facets per-option counts that sum to the facet count', async () => {
    const { facets } = await getFacets('/filters');
    const enums = facets.filter((facet) => facet.type === 'enum');
    expect(enums.length).toBeGreaterThan(0);

    for (const facet of enums) {
      expect(facet.options.length).toBeGreaterThan(0);
      const sum = facet.options.reduce((total, option) => total + (option.count ?? 0), 0);
      expect(sum).toBe(facet.count);
      for (const option of facet.options) {
        expect(typeof option.count).toBe('number');
        expect(option.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives boolean facets explicit true/false counts', async () => {
    const { facets } = await getFacets('/filters');
    const booleans = facets.filter((facet) => facet.type === 'boolean');
    expect(booleans.length).toBeGreaterThan(0);

    for (const facet of booleans) {
      const values = facet.options.map((option) => option.value).sort();
      expect(values).toEqual(['false', 'true']);
    }
  });

  it('gives range facets global min/max bounds and no options', async () => {
    const { facets } = await getFacets('/filters');
    const ranges = facets.filter((facet) => facet.type === 'range');
    expect(ranges.length).toBeGreaterThan(0);

    for (const facet of ranges) {
      expect(facet.options).toEqual([]);
      expect(typeof facet.min).toBe('number');
      expect(typeof facet.max).toBe('number');
      expect(facet.min!).toBeLessThanOrEqual(facet.max!);
    }
  });

  it('excludes removed listings from counts', async () => {
    const { facets } = await getFacets('/filters');
    const price = facets.find((facet) => facet.key === 'price');
    expect(price).toBeDefined();
    expect(price!.count).toBeGreaterThan(0);
    // 1000 seeded listings include 23 soft-deleted ones, so the active count must
    // be strictly smaller than the seeded total.
    expect(price!.count).toBeLessThan(1000);
  });
});

describe('GET /filters versus GET /filters/:categoryId', () => {
  it('returns the global facet set and a per-category subset respectively', async () => {
    // `GET /categories` returns the nested tree, so flatten it to look up a slug.
    const categoriesResponse = await app.handle(new Request('http://localhost/categories'));
    const tree = (await categoriesResponse.json()) as Array<{
      id: string;
      slug: string;
      children: Array<{ id: string; slug: string; children: unknown[] }>;
    }>;
    type Flat = { id: string; slug: string };
    const flatten = (nodes: typeof tree): Flat[] =>
      nodes.flatMap((node) => [
        { id: node.id, slug: node.slug },
        ...flatten((node.children ?? []) as typeof tree),
      ]);
    const suv = flatten(tree).find((category) => category.slug === 'suv');
    expect(suv).toBeDefined();

    const global = await getFacets('/filters');
    const scoped = await getFacets(`/filters/${suv!.id}`);

    expect(scoped.status).toBe(200);
    expect(global.facets.length).toBeGreaterThan(scoped.facets.length);

    // Global facets are keyed by slug and carry no category binding.
    expect('categoryId' in global.facets[0]!).toBe(false);
    expect('categoryId' in scoped.facets[0]!).toBe(true);

    // Every category-scoped key must exist in the global view.
    const globalKeys = new Set(global.facets.map((facet) => facet.key));
    for (const facet of scoped.facets) {
      expect(globalKeys.has(facet.key)).toBe(true);
    }
  });
});

describe('GET /filters selection handling', () => {
  it('scopes other dimensions while keeping a dimension unfiltered by itself', async () => {
    const unscoped = await getFacets('/filters');
    const petrol = unscoped.facets
      .find((facet) => facet.key === 'fuel_type')!
      .options.find((option) => option.value === 'petrol')!.count!;
    expect(petrol).toBeGreaterThan(0);

    const scoped = await getFacets('/filters?filters=fuel_type:petrol');

    const fuel = scoped.facets.find((facet) => facet.key === 'fuel_type')!;
    const fuelSum = fuel.options.reduce((total, option) => total + (option.count ?? 0), 0);
    expect(fuelSum).toBe(fuel.count);

    const transmission = scoped.facets.find((facet) => facet.key === 'transmission')!;
    const transmissionSum = transmission.options.reduce(
      (total, option) => total + (option.count ?? 0),
      0,
    );
    expect(transmissionSum).toBe(petrol);
  });

  it('combines multiple selections across dimensions', async () => {
    const single = await getFacets('/filters?filters=fuel_type:petrol');
    const combined = await getFacets('/filters?filters=fuel_type:petrol&filters=transmission:manual');

    const singleCount = single.facets.find((facet) => facet.key === 'price')!.count;
    const combinedCount = combined.facets.find((facet) => facet.key === 'price')!.count;

    expect(combinedCount).toBeGreaterThan(0);
    expect(combinedCount).toBeLessThanOrEqual(singleCount);
  });

  it('reports zeroed counts for a selection that matches nothing', async () => {
    const { facets } = await getFacets('/filters?filters=fuel_type:doesnotexist');
    const others = facets.filter((facet) => facet.key !== 'fuel_type');

    for (const facet of others) {
      expect(facet.count).toBe(0);
      if (facet.type === 'range') {
        expect(facet.min).toBeNull();
        expect(facet.max).toBeNull();
      }
    }
  });

  it('ignores malformed selections instead of failing', async () => {
    for (const value of ['nope', ':', ':value', 'key:']) {
      const { status } = await getFacets(`/filters?filters=${encodeURIComponent(value)}`);
      expect(status).toBe(200);
    }
  });
});
