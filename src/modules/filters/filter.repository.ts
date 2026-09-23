import { pool, type Queryable } from '../../database/pool.ts';
import { NotImplementedError } from '../../shared/errors/not-implemented-error.ts';
import type { FilterAttribute, FilterQuery, FilterWithCounts } from './filter.types.ts';

/**
 * Persistence boundary for the Filters module.
 *
 * Filter definitions live in `filter_attributes`; facet counts are computed
 * with aggregate SQL in Phase 1.
 */
export interface FilterRepository {
  /** All active filters applicable to a category (including inherited/global). */
  findByCategoryId(categoryId: string | null): Promise<FilterAttribute[]>;

  /** Filter definitions enriched with facet counts for the current selection. */
  findWithCounts(query: FilterQuery): Promise<FilterWithCounts[]>;
}

/**
 * PostgreSQL implementation of `FilterRepository`.
 *
 * Phase 0 establishes the boundary; aggregate/facet SQL arrives in Phase 1.
 */
export class PostgresFilterRepository implements FilterRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findByCategoryId(_categoryId: string | null): Promise<FilterAttribute[]> {
    throw new NotImplementedError('FilterRepository.findByCategoryId is implemented in Phase 1');
  }

  async findWithCounts(_query: FilterQuery): Promise<FilterWithCounts[]> {
    throw new NotImplementedError('FilterRepository.findWithCounts is implemented in Phase 1');
  }
}

export const filterRepository: FilterRepository = new PostgresFilterRepository();
