import type { Static } from 'elysia';
import type { HttpContext } from '../../shared/types/http';
import { listingService, type ListingService } from './listing.service';
import type {
  createListingBodySchema,
  searchListingsQuerySchema,
  suggestListingsQuerySchema,
  updateListingBodySchema,
  listingIdParamsSchema,
} from './listing.schema';
import type { ListingSearchFilters } from './listing.types';

type ListingIdParams = Static<typeof listingIdParamsSchema>;
type CreateListingBody = Static<typeof createListingBodySchema>;
type UpdateListingBody = Static<typeof updateListingBodySchema>;
type SearchListingsQuery = Static<typeof searchListingsQuerySchema>;
type SuggestListingsQuery = Static<typeof suggestListingsQuerySchema>;

/**
 * HTTP adapter for the Listings module.
 *
 * Controllers translate validated HTTP input into service calls and shape the
 * response. They contain no SQL, no database access and no business rules.
 */
export class ListingController {
  constructor(private readonly service: ListingService = listingService) {}

  list = async (ctx: HttpContext<unknown, SearchListingsQuery, unknown>) => {
    return this.service.search(this.toFilters(ctx.query));
  };

  search = this.list;

  suggest = async (ctx: HttpContext<unknown, SuggestListingsQuery, unknown>) => {
    const { q, limit } = ctx.query;
    return this.service.suggest(q, limit ?? 5);
  };

  getById = async (ctx: HttpContext<unknown, unknown, ListingIdParams>) => {
    return this.service.getById(ctx.params.id);
  };

  create = async (ctx: HttpContext<CreateListingBody, unknown, unknown>) => {
    ctx.set.status = 201;
    return this.service.create(ctx.body);
  };

  update = async (ctx: HttpContext<UpdateListingBody, unknown, ListingIdParams>) => {
    return this.service.update(ctx.params.id, ctx.body);
  };

  remove = async (ctx: HttpContext<unknown, unknown, ListingIdParams>) => {
    await this.service.remove(ctx.params.id);
    ctx.set.status = 204;
    return null;
  };

  /**
   * Normalize query parameters into the service/repository filter contract.
   *
   * Range filters accept both naming conventions. The canonical names
   * (`priceMin`, `priceMax`, `yearMin`, `yearMax`, `mileageMax`) take
   * precedence; the aliases (`minPrice`, `maxPrice`, `minYear`, `maxYear`,
   * `maxMileage`) are accepted so a client using the other convention is still
   * filtered correctly rather than having the bound dropped.
   */
  private toFilters(query: SearchListingsQuery): ListingSearchFilters {
    return {
      text: query.q,
      categoryId: query.categoryId,
      includeDescendants: query.includeDescendants ?? false,
      make: query.make,
      model: query.model,
      condition: query.condition,
      transmission: query.transmission,
      fuelType: query.fuelType,
      color: query.color,
      city: query.city,
      priceMin: query.priceMin ?? query.minPrice,
      priceMax: query.priceMax ?? query.maxPrice,
      yearMin: query.yearMin ?? query.minYear,
      yearMax: query.yearMax ?? query.maxYear,
      mileageMax: query.mileageMax ?? query.maxMileage,
      status: query.status,
      limit: query.limit ?? 20,
      cursor: query.cursor,
      sortBy: query.sortBy ?? 'createdAt',
      sortDirection: query.sortDirection ?? 'desc',
    };
  }
}

export const listingController = new ListingController();
