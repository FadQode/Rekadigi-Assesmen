import { NotFoundError } from '../../shared/errors/http-errors';
import { categoryRepository, type CategoryRepository } from '../categories/category.repository';
import { filterRepository, type FilterRepository } from './filter.repository';
import type { FilterWithCounts, GlobalFilterWithCounts } from './filter.types';

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
   * Global facets for `GET /filters`.
   *
   * Answers "which filter options exist across the marketplace, and how many
   * listings carry each value" — deduplicated by filter key and aggregated
   * across every non-deleted listing. This is deliberately different from
   * `listForCategory`, which returns the attributes a single category declares.
   *
   * No category validation applies, since the query is not category-scoped.
   */
  async listGlobal(selections?: Record<string, string | string[]>): Promise<GlobalFilterWithCounts[]> {
    return this.repository.findGlobalWithCounts({ selections });
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
