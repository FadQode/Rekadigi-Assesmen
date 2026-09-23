import { t } from 'elysia';

export const listingStatusSchema = t.UnionEnum(['draft', 'active', 'sold', 'archived']);

/** Shared path parameter schema for listing-scoped routes. */
export const listingIdParamsSchema = t.Object({
  id: t.String({ format: 'uuid', description: 'Listing identifier (UUID)' }),
});

const listingAttributesSchema = t.Record(t.String(), t.Unknown(), {
  description: 'Category-specific dynamic attributes stored as JSONB',
});

const listingImageInputSchema = t.Object({
  url: t.String({ format: 'uri', maxLength: 2048, description: 'Publicly reachable image URL' }),
  position: t.Optional(t.Integer({ minimum: 0, description: 'Display order (0-based)' })),
});

export const createListingBodySchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  categoryId: t.String({ format: 'uuid' }),
  make: t.String({ minLength: 1, maxLength: 100 }),
  model: t.String({ minLength: 1, maxLength: 100 }),
  year: t.Integer({ minimum: 1900, maximum: new Date().getFullYear() + 1 }),
  price: t.Number({ minimum: 0 }),
  mileage: t.Optional(t.Integer({ minimum: 0 })),
  fuelType: t.Optional(t.String({ maxLength: 50 })),
  transmission: t.Optional(t.String({ maxLength: 50 })),
  bodyType: t.Optional(t.String({ maxLength: 50 })),
  latitude: t.Optional(t.Number({ minimum: -90, maximum: 90 })),
  longitude: t.Optional(t.Number({ minimum: -180, maximum: 180 })),
  city: t.Optional(t.String({ maxLength: 120 })),
  country: t.Optional(t.String({ maxLength: 120 })),
  status: t.Optional(listingStatusSchema),
  attributes: t.Optional(listingAttributesSchema),
  images: t.Optional(t.Array(listingImageInputSchema, { maxItems: 30 })),
});

export const updateListingBodySchema = t.Partial(createListingBodySchema);

/**
 * Query schema for `GET /listings` and `GET /listings/search`.
 *
 * Filter values are optional; the service layer applies defaults and builds
 * parameterized SQL conditions.
 */
export const searchListingsQuerySchema = t.Object({
  q: t.Optional(t.String({ maxLength: 200, description: 'Free-text search query' })),
  categoryId: t.Optional(t.String({ format: 'uuid' })),
  includeDescendants: t.Optional(t.BooleanString({ description: 'Include descendant categories' })),
  make: t.Optional(t.String({ maxLength: 100 })),
  model: t.Optional(t.String({ maxLength: 100 })),
  fuelType: t.Optional(t.String({ maxLength: 50 })),
  transmission: t.Optional(t.String({ maxLength: 50 })),
  bodyType: t.Optional(t.String({ maxLength: 50 })),
  city: t.Optional(t.String({ maxLength: 120 })),
  country: t.Optional(t.String({ maxLength: 120 })),
  priceMin: t.Optional(t.Number({ minimum: 0 })),
  priceMax: t.Optional(t.Number({ minimum: 0 })),
  yearMin: t.Optional(t.Integer({ minimum: 1900 })),
  yearMax: t.Optional(t.Integer({ minimum: 1900 })),
  mileageMax: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Optional(listingStatusSchema),
  sortBy: t.Optional(t.UnionEnum(['createdAt', 'price', 'year', 'mileage'])),
  sortDirection: t.Optional(t.UnionEnum(['asc', 'desc'])),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: t.Optional(
    t.String({ maxLength: 512, description: 'Opaque cursor from a previous page' }),
  ),
});

export const suggestListingsQuerySchema = t.Object({
  q: t.String({ minLength: 1, maxLength: 100, description: 'Prefix to complete' }),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 20, default: 5 })),
});
