import type { PaginatedResponse } from '../../shared/types/api.ts';

/** Lifecycle state of a listing in the marketplace. */
export type ListingStatus = 'draft' | 'active' | 'sold' | 'archived';

export interface ListingImage {
  id: string;
  listingId: string;
  url: string;
  position: number;
  createdAt: Date;
}

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
  price: number;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;

  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;

  status: ListingStatus;
  attributes: ListingAttributes;
  images: ListingImage[];

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
  mileage?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  country?: string | null;
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
  fuelType?: string;
  transmission?: string;
  bodyType?: string;
  city?: string;
  country?: string;
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
}

export type ListingSortField = 'createdAt' | 'price' | 'year' | 'mileage';

export interface ListingSearchResult extends PaginatedResponse<Listing> {
  total?: number;
}

export interface ListingSuggestion {
  value: string;
  type: 'make' | 'model' | 'title';
}
