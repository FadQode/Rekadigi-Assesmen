import { NotFoundError } from '../../shared/errors/http-errors';
import { categoryRepository, type CategoryRepository } from '../categories/category.repository';
import { filterRepository, type FilterRepository } from './filter.repository';
import type { FilterAttribute, FilterWithCounts } from './filter.types';

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

  /**
   * Filter definitions for a category.
   *
   * Every filter definition in this schema is category-scoped, so an unscoped
   * request has nothing to return.
   */
  async list(categoryId: string | null = null): Promise<FilterAttribute[]> {
    if (categoryId === null) return [];

    const category = await this.categories.findById(categoryId);
    if (category === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
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
