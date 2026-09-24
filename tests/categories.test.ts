import { describe, expect, it } from 'bun:test';
import { CategoryService } from '../src/modules/categories/category.service.ts';
import type { CategoryRepository } from '../src/modules/categories/category.repository.ts';
import type { Category, CategoryTreeNode, CreateCategoryData, UpdateCategoryData } from '../src/modules/categories/category.types.ts';
import type { ListingService } from '../src/modules/listings/listing.service.ts';

const ROOT = 'aaaaaaaa-0000-0000-0000-000000000001';
const CHILD = 'aaaaaaaa-0000-0000-0000-000000000002';
const LEAF = 'aaaaaaaa-0000-0000-0000-000000000003';
const OTHER = 'aaaaaaaa-0000-0000-0000-000000000004';

function makeCategory(id: string, parentId: string | null, slug: string, depth: number): Category {
  return {
    id,
    parentId,
    name: slug,
    slug,
    path: `/${slug}`,
    depth,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

interface Calls {
  updated: Array<{ id: string; data: UpdateCategoryData }>;
}

/**
 * Minimal in-memory `CategoryRepository`.
 *
 * These tests exercise the service's cycle/parent rules, which are pure
 * application logic, so a fake keeps them fast and independent of a live
 * database — matching the existing suite's approach.
 */
function makeRepository(calls: Calls): CategoryRepository {
  const rows = new Map<string, Category>([
    [ROOT, makeCategory(ROOT, null, 'root', 0)],
    [CHILD, makeCategory(CHILD, ROOT, 'child', 1)],
    [LEAF, makeCategory(LEAF, CHILD, 'leaf', 2)],
    [OTHER, makeCategory(OTHER, null, 'other', 0)],
  ]);

  const descendantsOf = (id: string): string[] => {
    const out: string[] = [id];
    let frontier = [id];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const node of rows.values()) {
        if (node.parentId !== null && frontier.includes(node.parentId)) {
          out.push(node.id);
          next.push(node.id);
        }
      }
      frontier = next;
    }
    return out;
  };

  return {
    findAll: async () => [...rows.values()],
    findTree: async (): Promise<CategoryTreeNode[]> => [],
    findById: async (id) => rows.get(id) ?? null,
    findByParentAndSlug: async (parentId, slug) =>
      [...rows.values()].find((row) => row.parentId === parentId && row.slug === slug) ?? null,
    findDescendantIds: async (id) => descendantsOf(id),
    create: async (data: CreateCategoryData) => {
      const created = makeCategory(
        'created',
        data.parentId ?? null,
        data.slug,
        data.parentId ? 1 : 0,
      );
      rows.set(created.id, created);
      return created;
    },
    update: async (id, data) => {
      calls.updated.push({ id, data });
      const current = rows.get(id);
      if (current === undefined) return null;
      const next: Category = {
        ...current,
        name: data.name ?? current.name,
        slug: data.slug ?? current.slug,
        parentId: data.parentId === undefined ? current.parentId : data.parentId,
      };
      rows.set(id, next);
      return next;
    },
  };
}

function makeService(calls: Calls): CategoryService {
  // `listListings` is not exercised here; the service only needs the dependency
  // to be present for construction.
  const listings = {} as unknown as ListingService;
  return new CategoryService(makeRepository(calls), listings);
}

async function statusOf(fn: () => Promise<unknown>): Promise<number | 'resolved'> {
  try {
    await fn();
    return 'resolved';
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? -1;
  }
}

describe('category parent moves', () => {
  it('moves a category to the root when parentId is null', async () => {
    const calls: Calls = { updated: [] };
    const service = makeService(calls);

    const result = await service.update(CHILD, { parentId: null });

    expect(result.parentId).toBeNull();
    expect(calls.updated).toHaveLength(1);
    expect(calls.updated[0]).toEqual({ id: CHILD, data: { parentId: null } });
  });

  it('moves a category under another valid parent', async () => {
    const calls: Calls = { updated: [] };
    const service = makeService(calls);

    const result = await service.update(LEAF, { parentId: OTHER });

    expect(result.parentId).toBe(OTHER);
  });

  it('keeps the existing parent when parentId is omitted', async () => {
    const calls: Calls = { updated: [] };
    const service = makeService(calls);

    const result = await service.update(LEAF, { name: 'renamed' });

    expect(result.parentId).toBe(CHILD);
    expect(result.name).toBe('renamed');
  });

  it('treats moving a root back to the root as a no-op, not a cycle', async () => {
    const calls: Calls = { updated: [] };
    const service = makeService(calls);

    await expect(service.update(ROOT, { parentId: null })).resolves.toMatchObject({
      parentId: null,
    });
  });
});

describe('category cycle and parent validation', () => {
  it('rejects a category becoming its own parent (409)', async () => {
    const service = makeService({ updated: [] });
    expect(await statusOf(() => service.update(ROOT, { parentId: ROOT }))).toBe(409);
  });

  it('rejects moving a category under its own descendant (409)', async () => {
    const service = makeService({ updated: [] });
    expect(await statusOf(() => service.update(ROOT, { parentId: LEAF }))).toBe(409);
  });

  it('rejects moving a category under its own direct child (409)', async () => {
    const service = makeService({ updated: [] });
    expect(await statusOf(() => service.update(CHILD, { parentId: LEAF }))).toBe(409);
  });

  it('rejects a parent that does not exist (404)', async () => {
    const service = makeService({ updated: [] });
    expect(
      await statusOf(() => service.update(ROOT, { parentId: 'ffffffff-0000-0000-0000-000000000000' })),
    ).toBe(404);
  });

  it('rejects an unknown parent on create (404)', async () => {
    const service = makeService({ updated: [] });
    expect(
      await statusOf(() =>
        service.create({
          parentId: 'ffffffff-0000-0000-0000-000000000000',
          name: 'x',
          slug: 'x',
        }),
      ),
    ).toBe(404);
  });

  it('allows creating a root category without a parent', async () => {
    const service = makeService({ updated: [] });
    const created = await service.create({ name: 'new', slug: 'new-root' });
    expect(created.parentId).toBeNull();
  });
});
