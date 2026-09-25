import { ConflictError, NotFoundError } from '../../shared/errors/http-errors';
import { listingService, type ListingService } from '../listings/listing.service';
import type { ListingSearchFilters, ListingSearchResult } from '../listings/listing.types';
import { categoryRepository, type CategoryRepository } from './category.repository';
import type {
  Category,
  CategoryTreeNode,
  CreateCategoryData,
  UpdateCategoryData,
} from './category.types';

/**
 * Application/business logic for the category hierarchy.
 *
 * Framework-independent: no Elysia types, no request/response objects. Rules
 * such as "a category cannot be its own ancestor" and slug uniqueness are
 * enforced here in Phase 1.
 *
 * Category-scoped listing queries delegate to the Listings module rather than
 * duplicating listing SQL, keeping one owner for search behaviour.
 */
export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository = categoryRepository,
    private readonly listings: ListingService = listingService,
  ) {}

  /**
   * Full category tree.
   *
   * The assessment defines `GET /categories` as "get full category tree", so the
   * default collection response is the nested hierarchy rather than a flat list.
   * `GET /categories/tree` remains as a compatibility alias returning the same
   * shape.
   */
  async list(): Promise<CategoryTreeNode[]> {
    return this.repository.findTree();
  }

  async getTree(): Promise<CategoryTreeNode[]> {
    return this.repository.findTree();
  }

  async getById(id: string): Promise<Category> {
    const category = await this.repository.findById(id);
    if (category === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
    }
    return category;
  }

  /**
   * A single category together with its descendant subtree.
   *
   * The assessment defines `GET /categories/:id` as "get single category with
   * its children", so the HTTP response nests `children` recursively. Building
   * the tree once and locating the node keeps this to a single query rather
   * than one lookup per level.
   */
  async getWithChildren(id: string): Promise<CategoryTreeNode> {
    const node = locateNode(await this.repository.findTree(), id);
    if (node === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
    }
    return node;
  }

  async create(data: CreateCategoryData): Promise<Category> {
    await this.assertParentExists(data.parentId);
    await this.assertSlugAvailable(data.slug, data.parentId ?? null);
    return this.repository.create(data);
  }

  async update(id: string, data: UpdateCategoryData): Promise<Category> {
    const existing = await this.getById(id);

    const parentId = data.parentId === undefined ? existing.parentId : data.parentId;

    if (data.parentId !== undefined) {
      await this.assertParentExists(data.parentId);
      await this.assertParentIsNotDescendant(id, data.parentId);
    }

    const slug = data.slug ?? existing.slug;
    if (data.slug !== undefined || (data.parentId !== undefined && data.parentId !== existing.parentId)) {
      await this.assertSlugAvailable(slug, parentId, id);
    }

    const updated = await this.repository.update(id, data);
    if (updated === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
    }
    return updated;
  }

  /**
   * A category cannot be placed under itself or one of its own descendants,
   * which would create a cycle. Resolved in SQL via the ancestor set.
   *
   * `null` is *not* a cycle candidate: the contract defines
   * `parentId: null` as "move to the root", and the root has no ancestors, so
   * it can never form a cycle. Treating `null` as a self-parent was a bug that
   * made "move to root" unreachable with a misleading `CATEGORY_CYCLE` (409).
   */
  private async assertParentIsNotDescendant(id: string, parentId: string | null): Promise<void> {
    if (parentId === null) return;

    if (parentId === id) {
      throw new ConflictError('A category cannot be its own parent', {
        details: { code: 'CATEGORY_CYCLE' },
      });
    }

    const descendants = await this.repository.findDescendantIds(id);
    if (descendants.includes(parentId)) {
      throw new ConflictError('A category cannot be moved under one of its own descendants', {
        details: { code: 'CATEGORY_CYCLE' },
      });
    }
  }

  private async assertParentExists(parentId: string | null | undefined): Promise<void> {
    if (parentId === null || parentId === undefined) return;
    const parent = await this.repository.findById(parentId);
    if (parent === null) {
      throw new NotFoundError('Parent category not found', {
        details: { code: 'PARENT_CATEGORY_NOT_FOUND' },
      });
    }
  }

  private async assertSlugAvailable(
    slug: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repository.findByParentAndSlug(parentId, slug);
    if (existing === null) return;
    if (excludeId !== undefined && existing.id === excludeId) return;

    throw new ConflictError('A category with this slug already exists', {
      details: { code: 'CATEGORY_SLUG_CONFLICT' },
    });
  }

  /**
   * Listings belonging to a category subtree.
   *
   * When `includeDescendants` is set, the subtree is resolved through the
   * category repository and passed to the Listings module as an explicit id
   * set.
   */
  async listListings(
    categoryId: string,
    options: { includeDescendants: boolean; limit: number; cursor?: string },
  ): Promise<ListingSearchResult> {
    await this.getById(categoryId);

    const categoryIds = options.includeDescendants
      ? await this.repository.findDescendantIds(categoryId)
      : [categoryId];

    const filters: ListingSearchFilters = {
      categoryIds,
      limit: options.limit,
      cursor: options.cursor,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    };

    return this.listings.search(filters);
  }
}

export const categoryService = new CategoryService();

/** Depth-first search for a node in a pre-built tree. */
function locateNode(nodes: CategoryTreeNode[], id: string): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = locateNode(node.children, id);
    if (found !== null) return found;
  }
  return null;
}
