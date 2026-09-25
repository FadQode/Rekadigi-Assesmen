import { describe, expect, it } from 'bun:test';
import { app } from '../src/app';

/**
 * Regression tests for the assessment's §4.3 category contract.
 *
 * The assessment defines `GET /categories` as "get full category tree" and
 * `GET /categories/:id` as "get single category with its children". Both
 * previously returned flat rows with no `children`, so the collection endpoint
 * exposed no hierarchy and the single-category endpoint exposed no children.
 * These tests pin the nested shape.
 */

interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
  children: CategoryNode[];
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await app.handle(new Request(`http://localhost${path}`));
  const text = await response.text();
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : null };
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

function subtreeDepth(nodes: CategoryNode[], level = 0): number {
  return nodes.reduce(
    (max, node) => Math.max(max, level, subtreeDepth(node.children ?? [], level + 1)),
    level,
  );
}

describe('GET /categories returns the full tree', () => {
  it('responds with nested nodes', async () => {
    const { status, body } = await get('/categories');
    expect(status).toBe(200);
    const tree = body as CategoryNode[];
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
    for (const root of tree) {
      expect(Array.isArray(root.children)).toBe(true);
    }
  });

  it('nests children so depth is representable', async () => {
    const { body } = await get('/categories');
    expect(subtreeDepth(body as CategoryNode[])).toBeGreaterThanOrEqual(2);
  });

  it('keeps parent/child links consistent', async () => {
    const { body } = await get('/categories');
    const nodes = flatten(body as CategoryNode[]);
    for (const node of nodes) {
      for (const child of node.children ?? []) {
        expect(child.parentId).toBe(node.id);
        expect(child.depth).toBe(node.depth + 1);
        expect(child.path.startsWith(node.path)).toBe(true);
      }
      // Roots report no parent.
      if (node.parentId === null) {
        expect(node.depth).toBe(0);
      }
    }
  });

  it('matches the /categories/tree alias', async () => {
    const [a, b] = await Promise.all([get('/categories'), get('/categories/tree')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
  });
});

describe('GET /categories/:id returns a category with its children', () => {
  it('includes the children field', async () => {
    const { body } = await get('/categories');
    const root = (body as CategoryNode[])[0]!;
    const { status, body: single } = await get(`/categories/${root.id}`);
    expect(status).toBe(200);
    expect(Array.isArray((single as CategoryNode).children)).toBe(true);
    expect((single as CategoryNode).id).toBe(root.id);
  });

  it('returns only direct children, each linked to the parent', async () => {
    const { body } = await get('/categories');
    const nodes = flatten(body as CategoryNode[]);
    const parent = nodes.find((node) => node.children.length > 0);
    expect(parent).toBeDefined();

    const { status, body: single } = await get(`/categories/${parent!.id}`);
    expect(status).toBe(200);
    const node = single as CategoryNode;
    expect(node.children.length).toBe(parent!.children.length);
    for (const child of node.children) {
      expect(child.parentId).toBe(node.id);
    }
  });

  it('returns an empty children array for a leaf', async () => {
    const { body } = await get('/categories');
    const leaf = flatten(body as CategoryNode[]).find((node) => node.children.length === 0);
    expect(leaf).toBeDefined();

    const { status, body: single } = await get(`/categories/${leaf!.id}`);
    expect(status).toBe(200);
    expect((single as CategoryNode).children).toEqual([]);
  });

  it('still rejects a malformed and a missing id', async () => {
    expect((await get('/categories/not-a-uuid')).status).toBe(400);
    expect((await get('/categories/11111111-2222-3333-4444-555555555555')).status).toBe(404);
  });
});
