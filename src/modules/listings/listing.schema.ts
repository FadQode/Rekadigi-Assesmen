import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index.ts';

export const listingStatusSchema = t.UnionEnum(['available', 'sold', 'pending', 'removed']);

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
 */
export const searchListingsQuerySchema = t.Object({
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
  priceMin: t.Optional(t.Number({ minimum: 0 })),
  priceMax: t.Optional(t.Number({ minimum: 0 })),
  yearMin: t.Optional(t.Integer({ minimum: 1886 })),
  yearMax: t.Optional(t.Integer({ minimum: 1886 })),
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
  q: t.String({
    minLength: 1,
    maxLength: 100,
    description: 'Text to complete against make and model (prefix, partial or fuzzy)',
  }),
  limit: t.Optional(
    t.Integer({ minimum: 1, maximum: 20, default: 5, description: 'Maximum suggestions to return' }),
  ),
});
