import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index';

/**
 * Lifecycle status values, mirroring the `listings_status_check` constraint.
 *
 * Declared as a union of literals rather than `t.UnionEnum`: `UnionEnum` injects
 * an implicit `default` equal to its first member, so an omitted `?status=`
 * silently became `status=available`, hiding sold and pending listings. A union
 * of literals validates the same values, documents as an `enum`, and leaves an
 * omitted parameter absent so the service applies its own default.
 */
export const listingStatusSchema = t.Union([
  t.Literal('available'),
  t.Literal('sold'),
  t.Literal('pending'),
  t.Literal('removed'),
]);

export const listingSortBySchema = t.Union([
  t.Literal('createdAt'),
  t.Literal('price'),
  t.Literal('year'),
  t.Literal('mileage'),
]);

/**
 * Sort direction.
 *
 * Also a union of literals: `UnionEnum` would default an omitted value to
 * `asc` and invert the documented `created_at DESC` browse ordering.
 */
export const listingSortDirectionSchema = t.Union([t.Literal('asc'), t.Literal('desc')]);

/** Shared path parameter schema for listing-scoped routes. */
export const listingIdParamsSchema = t.Object({
  id: uuidSchema('Listing identifier (UUID)'),
});

const listingAttributesSchema = t.Record(t.String(), t.Unknown(), {
  description: 'Category-specific dynamic attributes stored as JSONB',
});

const listingImageInputSchema = t.Object({
  url: t.String({ format: 'uri', maxLength: 2048, description: 'Publicly reachable image URL' }),
  position: t.Optional(t.Integer({ minimum: 0, description: 'Display order (0-based)' })),
});

export const createListingBodySchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  categoryId: uuidSchema(),
  make: t.String({ minLength: 1, maxLength: 100 }),
  model: t.String({ minLength: 1, maxLength: 100 }),
  year: t.Integer({ minimum: 1886, maximum: new Date().getFullYear() + 1 }),
  mileage: t.Optional(t.Integer({ minimum: 0 })),
  price: t.Number({ minimum: 0 }),
  condition: t.String({ minLength: 1, maxLength: 30 }),
  transmission: t.String({ minLength: 1, maxLength: 30 }),
  fuelType: t.String({ minLength: 1, maxLength: 30 }),
  color: t.Optional(t.String({ maxLength: 50 })),
  city: t.String({ minLength: 1, maxLength: 100 }),
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
 *
 * Range filters accept both naming conventions because clients reasonably reach
 * for either. `priceMin`/`priceMax`/`yearMin`/`yearMax`/`mileageMax` are
 * canonical; `minPrice`/`maxPrice`/`minYear`/`maxYear`/`maxMileage` are
 * accepted aliases. When both forms are supplied the canonical one wins. The
 * aliases exist because an unrecognised name used to be dropped silently, so a
 * request that looked filtered returned unfiltered rows.
 */
const searchListingsQueryProperties = {
  q: t.Optional(t.String({ maxLength: 200, description: 'Free-text search query' })),
  categoryId: t.Optional(uuidSchema()),
  includeDescendants: t.Optional(t.BooleanString({ description: 'Include descendant categories' })),
  make: t.Optional(t.String({ maxLength: 100 })),
  model: t.Optional(t.String({ maxLength: 100 })),
  condition: t.Optional(t.String({ maxLength: 30 })),
  transmission: t.Optional(t.String({ maxLength: 30 })),
  fuelType: t.Optional(t.String({ maxLength: 30 })),
  color: t.Optional(t.String({ maxLength: 50 })),
  city: t.Optional(t.String({ maxLength: 100 })),
  priceMin: t.Optional(t.Number({ minimum: 0, description: 'Minimum price (inclusive)' })),
  priceMax: t.Optional(t.Number({ minimum: 0, description: 'Maximum price (inclusive)' })),
  yearMin: t.Optional(t.Integer({ minimum: 1886, description: 'Earliest model year (inclusive)' })),
  yearMax: t.Optional(t.Integer({ minimum: 1886, description: 'Latest model year (inclusive)' })),
  mileageMax: t.Optional(t.Integer({ minimum: 0, description: 'Maximum mileage (inclusive)' })),
  minPrice: t.Optional(t.Number({ minimum: 0, description: 'Alias for priceMin' })),
  maxPrice: t.Optional(t.Number({ minimum: 0, description: 'Alias for priceMax' })),
  minYear: t.Optional(t.Integer({ minimum: 1886, description: 'Alias for yearMin' })),
  maxYear: t.Optional(t.Integer({ minimum: 1886, description: 'Alias for yearMax' })),
  maxMileage: t.Optional(t.Integer({ minimum: 0, description: 'Alias for mileageMax' })),
  status: t.Optional(listingStatusSchema),
  sortBy: t.Optional(listingSortBySchema),
  sortDirection: t.Optional(listingSortDirectionSchema),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: t.Optional(
    t.String({ maxLength: 512, description: 'Opaque cursor from a previous page' }),
  ),
};

export const searchListingsQuerySchema = t.Object(searchListingsQueryProperties);

/**
 * Every query parameter the listing search endpoints accept.
 *
 * Derived from the schema above so route-level validation and the documented
 * contract cannot drift. Used to reject unrecognised parameters instead of
 * letting Elysia strip them, which would silently return unfiltered results.
 */
export const LISTING_SEARCH_QUERY_KEYS = Object.keys(searchListingsQueryProperties);

export const suggestListingsQuerySchema = t.Object({
  q: t.String({
    minLength: 1,
    maxLength: 100,
    description: 'Text to complete against make, model and city (prefix, partial or fuzzy)',
  }),
  limit: t.Optional(
    t.Integer({ minimum: 1, maximum: 20, default: 5, description: 'Maximum suggestions to return' }),
  ),
});

/**
 * Response schemas for the listing read/write contract.
 *
 * Expressed as plain JSON Schema rather than TypeBox: these are attached to
 * routes as `detail.responses` documentation only, and OpenAPI's
 * `ResponsesObject` type accepts raw schema objects, not `t.Object` instances.
 * Using the `response` route option instead would make Elysia validate and
 * strip the real payload, which is explicitly not wanted here.
 */
export const listingResponseSchema = {
  type: 'object' as const,
  required: [
    'id',
    'title',
    'categoryId',
    'make',
    'model',
    'year',
    'mileage',
    'price',
    'condition',
    'transmission',
    'fuelType',
    'city',
    'status',
    'attributes',
    'images',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    title: { type: 'string' as const },
    description: { type: 'string' as const, nullable: true },
    categoryId: { type: 'string' as const, format: 'uuid' },
    make: { type: 'string' as const },
    model: { type: 'string' as const },
    year: { type: 'integer' as const },
    mileage: { type: 'integer' as const },
    price: { type: 'number' as const },
    condition: { type: 'string' as const },
    transmission: { type: 'string' as const },
    fuelType: { type: 'string' as const },
    color: { type: 'string' as const, nullable: true },
    city: { type: 'string' as const },
    status: { type: 'string' as const, enum: ['available', 'sold', 'pending', 'removed'] },
    attributes: { type: 'object' as const, additionalProperties: true },
    images: { type: 'array' as const, items: { type: 'string' as const } },
    createdAt: { type: 'string' as const, format: 'date-time' },
    updatedAt: { type: 'string' as const, format: 'date-time' },
    deletedAt: { type: 'string' as const, nullable: true, format: 'date-time' },
  },
};

/** Cursor-paginated envelope returned by `GET /listings`. */
export const listingSearchResponseSchema = {
  type: 'object' as const,
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array' as const, items: listingResponseSchema },
    pagination: {
      type: 'object' as const,
      required: ['nextCursor', 'hasNextPage'],
      properties: {
        nextCursor: {
          type: 'string' as const,
          nullable: true,
          description: 'Opaque keyset cursor for the next page, or null when exhausted',
        },
        hasNextPage: { type: 'boolean' as const },
      },
    },
  },
};
