import { pool, type Queryable } from '../../database/pool';
import type {
  Category,
  CategoryTreeNode,
  CreateCategoryData,
  UpdateCategoryData,
} from './category.types';

/**
 * Persistence boundary for the Categories module.
 *
 * Hierarchical traversal uses recursive CTEs and the materialized `path`
 * column; the contract is kept framework-free so it can be substituted in
 * tests.
 */
export interface CategoryRepository {
  findAll(): Promise<Category[]>;

  findTree(): Promise<CategoryTreeNode[]>;

  findById(id: string): Promise<Category | null>;

  /** Look up a category by slug within a single parent (NULL = root). */
  findByParentAndSlug(parentId: string | null, slug: string): Promise<Category | null>;

  /** Ids of the category and every descendant, used for subtree filtering. */
  findDescendantIds(id: string): Promise<string[]>;

  create(data: CreateCategoryData): Promise<Category>;

  update(id: string, data: UpdateCategoryData): Promise<Category | null>;
}

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
  created_at: Date;
  updated_at: Date;
};

const CATEGORY_COLUMNS = 'id, parent_id, name, slug, path, depth, created_at, updated_at';

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    path: row.path,
    depth: row.depth,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * PostgreSQL implementation of `CategoryRepository`.
 *
 * `path` and `depth` are maintained in SQL (single statement per write) so a
 * category move or rename atomically rewrites the whole subtree without stale
 * descendants. Slugs are unique per parent via the DB constraints, which the
 * write statements rely on for concurrency safety.
 */
export class PostgresCategoryRepository implements CategoryRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findAll(): Promise<Category[]> {
    const result = await this.db.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY depth, name`,
    );
    return result.rows.map(mapRow);
  }

  async findTree(): Promise<CategoryTreeNode[]> {
    const result = await this.db.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY path`,
    );

    const nodes = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // `path` ordering guarantees a parent is always visited before its
    // children, so a single pass assembles the tree without recursion or N+1.
    for (const row of result.rows) {
      const node: CategoryTreeNode = { ...mapRow(row), children: [] };
      nodes.set(node.id, node);

      const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findById(id: string): Promise<Category | null> {
    const result = await this.db.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByParentAndSlug(parentId: string | null, slug: string): Promise<Category | null> {
    // Split on NULL so each branch matches an index exactly:
    // root slugs hit `uq_categories_root_slug` (partial) or the composite,
    // non-root slugs hit `categories_parent_slug_unique`.
    const result =
      parentId === null
        ? await this.db.query<CategoryRow>(
            `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE parent_id IS NULL AND slug = $1`,
            [slug],
          )
        : await this.db.query<CategoryRow>(
            `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE parent_id = $1 AND slug = $2`,
            [parentId, slug],
          );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findDescendantIds(id: string): Promise<string[]> {
    const result = await this.db.query<{ id: string }>(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM categories WHERE id = $1
         UNION ALL
         SELECT c.id
         FROM categories c
         JOIN descendants d ON c.parent_id = d.id
       )
       SELECT id FROM descendants`,
      [id],
    );
    return result.rows.map((row) => row.id);
  }

  async create(data: CreateCategoryData): Promise<Category> {
    // `path`/`depth` are derived from the parent (empty base for a root) in a
    // single statement, so they can never drift from `parent_id`.
    const result = await this.db.query<CategoryRow>(
      `INSERT INTO categories (parent_id, name, slug, path, depth)
       VALUES (
         $1::uuid,
         $2::text,
         $3::text,
         COALESCE((SELECT path FROM categories WHERE id = $1::uuid), '') || '/' || $3::text,
         COALESCE((SELECT depth FROM categories WHERE id = $1::uuid), -1) + 1
       )
       RETURNING ${CATEGORY_COLUMNS}`,
      [data.parentId ?? null, data.name, data.slug],
    );
    return mapRow(result.rows[0]!);
  }

  async update(id: string, data: UpdateCategoryData): Promise<Category | null> {
    const hasParent = data.parentId !== undefined;
    const parentId = data.parentId ?? null;

    // A recursive CTE recomputes `path`/`depth` for the category and its
    // entire subtree in one statement, so moves and renames never leave
    // descendants with stale paths.
    const result = await this.db.query<CategoryRow>(
      `WITH RECURSIVE updated AS (
         SELECT
           c.id,
           CASE WHEN $5::boolean THEN $4::uuid ELSE c.parent_id END AS new_parent_id,
           COALESCE($3::text, c.slug) AS new_slug,
           COALESCE($2::text, c.name) AS new_name,
           COALESCE(
             (SELECT p.path FROM categories p
              WHERE p.id = CASE WHEN $5::boolean THEN $4::uuid ELSE c.parent_id END),
             ''
           ) || '/' || COALESCE($3::text, c.slug) AS new_path,
           COALESCE(
             (SELECT p.depth FROM categories p
              WHERE p.id = CASE WHEN $5::boolean THEN $4::uuid ELSE c.parent_id END),
             -1
           ) + 1 AS new_depth
         FROM categories c
         WHERE c.id = $1::uuid

         UNION ALL

         SELECT
           c.id,
           c.parent_id AS new_parent_id,
           c.slug AS new_slug,
           c.name AS new_name,
           u.new_path || '/' || c.slug AS new_path,
           u.new_depth + 1 AS new_depth
         FROM categories c
         JOIN updated u ON c.parent_id = u.id
       )
       UPDATE categories c
       SET
         parent_id = u.new_parent_id,
         slug = u.new_slug,
         name = u.new_name,
         path = u.new_path,
         depth = u.new_depth
       FROM updated u
       WHERE c.id = u.id
       RETURNING c.${CATEGORY_COLUMNS.replaceAll(', ', ', c.')}`,
      [id, data.name ?? null, data.slug ?? null, parentId, hasParent],
    );
    const updated = result.rows.find((row) => row.id === id);
    return updated ? mapRow(updated) : null;
  }
}

export const categoryRepository: CategoryRepository = new PostgresCategoryRepository();
