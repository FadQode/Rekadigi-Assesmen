import { NotFoundError } from '../../shared/errors/http-errors.ts';
import { NotImplementedError } from '../../shared/errors/not-implemented-error.ts';
import { encodeCursor } from '../../shared/utils/cursor.ts';
import { listingRepository, type ListingRepository } from './listing.repository.ts';
import type {
  CreateListingData,
  Listing,
  ListingSearchFilters,
  ListingSearchResult,
  ListingSuggestion,
  UpdateListingData,
} from './listing.types.ts';

/**
 * Application/business logic for listings.
 *
 * Framework-independent by design: no Elysia, no request/response objects.
 * Validation that depends on database state (category existence, uniqueness,
 * ownership) belongs here rather than in the HTTP schema.
 */
export class ListingService {
  constructor(private readonly repository: ListingRepository = listingRepository) {}

  async getById(id: string): Promise<Listing> {
    const listing = await this.repository.findById(id);
    if (listing === null) {
      throw new NotFoundError('Listing not found', { details: { code: 'LISTING_NOT_FOUND' } });
    }
    return listing;
  }

  async create(_data: CreateListingData): Promise<Listing> {
    throw new NotImplementedError('ListingService.create is implemented in Phase 1');
  }

  async update(_id: string, _data: UpdateListingData): Promise<Listing> {
    throw new NotImplementedError('ListingService.update is implemented in Phase 1');
  }

  async remove(_id: string): Promise<void> {
    throw new NotImplementedError('ListingService.remove is implemented in Phase 1');
  }

  /**
   * Search listings. Cursor pagination with `(created_at DESC, id DESC)` is a
   * repository concern; the service normalizes the response envelope.
   */
  async search(filters: ListingSearchFilters): Promise<ListingSearchResult> {
    const result = await this.repository.search(filters);
    return {
      data: result.data,
      pagination: {
        nextCursor: result.pagination.nextCursor
          ? encodeCursor({ cursor: result.pagination.nextCursor })
          : null,
        hasNextPage: result.pagination.hasNextPage,
      },
      ...(result.total !== undefined ? { total: result.total } : {}),
    };
  }

  async suggest(prefix: string, limit: number): Promise<ListingSuggestion[]> {
    return this.repository.suggest(prefix, limit);
  }
}

export const listingService = new ListingService();
