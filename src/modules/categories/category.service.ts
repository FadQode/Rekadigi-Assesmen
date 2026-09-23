import { NotFoundError } from '../../shared/errors/http-errors.ts';
import { NotImplementedError } from '../../shared/errors/not-implemented-error.ts';
import { listingService, type ListingService } from '../listings/listing.service.ts';
import type { ListingSearchFilters, ListingSearchResult } from '../listings/listing.types.ts';
import { categoryRepository, type CategoryRepository } from './category.repository.ts';
import type {
  Category,
  CategoryTreeNode,
  CreateCategoryData,
  UpdateCategoryData,
} from './category.types.ts';

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

  async list(): Promise<Category[]> {
    return this.repository.findAll();
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

  async create(_data: CreateCategoryData): Promise<Category> {
    throw new NotImplementedError('CategoryService.create is implemented in Phase 1');
  }

  async update(_id: string, _data: UpdateCategoryData): Promise<Category> {
    throw new NotImplementedError('CategoryService.update is implemented in Phase 1');
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
