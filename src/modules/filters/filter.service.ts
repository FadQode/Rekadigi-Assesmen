import { NotFoundError } from '../../shared/errors/http-errors.ts';
import { categoryRepository, type CategoryRepository } from '../categories/category.repository.ts';
import { filterRepository, type FilterRepository } from './filter.repository.ts';
import type { FilterAttribute, FilterWithCounts } from './filter.types.ts';

/**
 * Application/business logic for filter definitions and facets.
 *
 * Framework-independent: no Elysia types, no request/response objects.
 */
export class FilterService {
  constructor(
    private readonly repository: FilterRepository = filterRepository,
    private readonly categories: CategoryRepository = categoryRepository,
  ) {}

  /** Global and category-scoped filter definitions. */
  async list(categoryId: string | null = null): Promise<FilterAttribute[]> {
    if (categoryId !== null) {
      const category = await this.categories.findById(categoryId);
      if (category === null) {
        throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
      }
    }
    return this.repository.findByCategoryId(categoryId);
  }

  /** Filter definitions plus facet counts for the current result set. */
  async listForCategory(
    categoryId: string,
    selections?: Record<string, string | string[]>,
  ): Promise<FilterWithCounts[]> {
    const category = await this.categories.findById(categoryId);
    if (category === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
    }
    return this.repository.findWithCounts({ categoryId, selections });
  }
}

export const filterService = new FilterService();
