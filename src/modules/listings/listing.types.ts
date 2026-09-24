import type { PaginatedResponse } from '../../shared/types/api.ts';

/**
 * Lifecycle state of a listing.
 *
 * Mirrors the `listings_status_check` constraint in the migration:
 * `available` | `sold` | `pending` | `removed`.
 * `removed` is the soft-deleted state, never deleted physically.
 */
export type ListingStatus = 'available' | 'sold' | 'pending' | 'removed';

/**
 * Dynamic, category-specific attributes.
 *
 * Genuinely dynamic values are stored in PostgreSQL JSONB; structurally
 * important marketplace fields (make, model, price, year, ...) remain typed
 * relational columns on `Listing`.
 */
export type ListingAttributes = Record<string, unknown>;

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;

  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;

  condition: string;
  transmission: string;
  fuelType: string;
  color: string | null;
  city: string;

  status: ListingStatus;

  /** Category-specific attributes from the `attributes` JSONB column. */
  attributes: ListingAttributes;
  /** Ordered image URLs from the `images` JSONB array. */
  images: string[];

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateListingData {
  title: string;
  description?: string | null;
  categoryId: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage?: number;
  condition: string;
  transmission: string;
  fuelType: string;
  color?: string | null;
  city: string;
  status?: ListingStatus;
  attributes?: ListingAttributes;
  images?: Array<{ url: string; position?: number }>;
}

export type UpdateListingData = Partial<Omit<CreateListingData, 'images'>>;

/** Structured filter inputs shared by listing search and category queries. */
export interface ListingSearchFilters {
  text?: string;
  categoryId?: string;
  /**
   * Explicit set of category ids to match. Used when a parent category should
   * include listings from its whole subtree; takes precedence over
   * `categoryId` when provided.
   */
  categoryIds?: string[];
  /** Include listings from descendants of the category, not just the category itself. */
  includeDescendants?: boolean;
  make?: string;
  model?: string;
  condition?: string;
  transmission?: string;
  fuelType?: string;
  color?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  status?: ListingStatus;
  /** Arbitrary JSONB-backed dynamic attributes. Values are bound as parameters. */
  attributes?: ListingAttributes;
  limit: number;
  cursor?: string;
  sortBy?: ListingSortField;
  sortDirection?: 'asc' | 'desc';
  /**
   * Request an exact match count. Browsing must not pay for `COUNT(*)`, so
   * this defaults to off and is only enabled by callers that truly need a
   * total (e.g. an admin view).
   */
  includeTotal?: boolean;
}

export type ListingSortField = 'createdAt' | 'price' | 'year' | 'mileage';

/**
 * Keyset cursor payload.
 *
 * The primary browse ordering is `(created_at DESC, id DESC)`, so the cursor
 * carries the exact `created_at` value of the last row plus its id. The value
 * is transported as text to preserve PostgreSQL's microsecond precision, which
 * a JavaScript `Date` would truncate to milliseconds.
 */
export interface ListingCursorPayload {
  createdAt: string;
  id: string;
}

export interface ListingSearchResult extends PaginatedResponse<Listing> {
  total?: number;
}

/**
 * A single typeahead suggestion returned by `GET /listings/search/suggest`.
 *
 * `value` is the stored display-case text (e.g. `Toyota`), not a lowercased
 * form, so it can be reused directly as the case-sensitive `make`/`model`
 * search filter.
 *
 * Only `'make'` and `'model'` are currently produced. `'title'` is retained in
 * the union for forward compatibility so that adding title suggestions later
 * does not widen the type; it is never returned today because title matching is
 * not implemented and has no trigram index.
 */
export interface ListingSuggestion {
  value: string;
  type: 'make' | 'model' | 'title';
}

/**
 * A submitted dynamic attribute that failed validation against the category's
 * `filter_attributes` definitions. Surfaced in the error `details` so clients
 * can point at the exact field.
 */
export interface ListingAttributeIssue {
  key: string;
  reason:
    | 'unknown_attribute'
    | 'invalid_enum'
    | 'invalid_range'
    | 'invalid_boolean'
    | 'invalid_value';
  message: string;
  /** Expected option values, present for `invalid_enum`. */
  allowedValues?: string[];
}
