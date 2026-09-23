import { pool, type Queryable } from '../../database/pool.ts';
import { NotImplementedError } from '../../shared/errors/not-implemented-error.ts';
import type {
  CreateListingData,
  Listing,
  ListingSearchFilters,
  ListingSearchResult,
  ListingSuggestion,
  UpdateListingData,
} from './listing.types.ts';

/**
 * Persistence boundary for the Listings module.
 *
 * The contract is deliberately framework-free: no HTTP concepts, no Elysia
 * types, no status codes. Implementations own SQL exclusively.
 */
export interface ListingRepository {
  findById(id: string): Promise<Listing | null>;

  create(data: CreateListingData): Promise<Listing>;

  update(id: string, data: UpdateListingData): Promise<Listing | null>;

  /** Soft delete: marks `deleted_at`; rows are never physically removed. */
  softDelete(id: string): Promise<boolean>;

  search(filters: ListingSearchFilters): Promise<ListingSearchResult>;

  suggest(prefix: string, limit: number): Promise<ListingSuggestion[]>;
}

/**
 * PostgreSQL implementation of `ListingRepository`.
 *
 * Phase 0 establishes the boundary and the injectable `Queryable`; the SQL
 * itself arrives in Phase 1 once the schema and indexes are finalized. Every
 * query will use `$1, $2, ...` placeholders — user input is never
 * interpolated into SQL text.
 */
export class PostgresListingRepository implements ListingRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findById(_id: string): Promise<Listing | null> {
    throw new NotImplementedError('ListingRepository.findById is implemented in Phase 1');
  }

  async create(_data: CreateListingData): Promise<Listing> {
    throw new NotImplementedError('ListingRepository.create is implemented in Phase 1');
  }

  async update(_id: string, _data: UpdateListingData): Promise<Listing | null> {
    throw new NotImplementedError('ListingRepository.update is implemented in Phase 1');
  }

  async softDelete(_id: string): Promise<boolean> {
    throw new NotImplementedError('ListingRepository.softDelete is implemented in Phase 1');
  }

  async search(_filters: ListingSearchFilters): Promise<ListingSearchResult> {
    throw new NotImplementedError('ListingRepository.search is implemented in Phase 1');
  }

  async suggest(_prefix: string, _limit: number): Promise<ListingSuggestion[]> {
    throw new NotImplementedError('ListingRepository.suggest is implemented in Phase 1');
  }
}

export const listingRepository: ListingRepository = new PostgresListingRepository();
