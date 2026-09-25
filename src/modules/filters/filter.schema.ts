import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index';

export const filterCategoryParamsSchema = t.Object({
  categoryId: uuidSchema('Category identifier (UUID)'),
});

/**
 * Query schema for `GET /filters`.
 *
 * `filters` carries active selections as one or more `key:value` pairs so the
 * returned counts reflect the current result set. Each dimension still reports
 * its own options unfiltered, which is what makes the counts usable for
 * switching values.
 */
export const globalFacetQuerySchema = t.Object({
  filters: t.Optional(
    t.Union([t.String({ maxLength: 200 }), t.Array(t.String({ maxLength: 200 }), { maxItems: 20 })], {
      description: 'Active selections encoded as `key:value`, repeatable',
    }),
  ),
});

/** Query schema for category-scoped facet counts (`GET /filters/:categoryId`). */
export const facetCountsQuerySchema = t.Object({
  filters: t.Optional(
    t.Union([t.String({ maxLength: 200 }), t.Array(t.String({ maxLength: 200 }), { maxItems: 20 })], {
      description: 'Active selections encoded as `key:value`, repeatable',
    }),
  ),
});
