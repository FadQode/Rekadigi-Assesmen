import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index.ts';

export const filterCategoryParamsSchema = t.Object({
  categoryId: uuidSchema('Category identifier (UUID)'),
});

export const filterQuerySchema = t.Object({
  categoryId: t.Optional(uuidSchema('Scope filters to a category')),
});

/**
 * Query schema for category facet counts.
 *
 * `filters` carries the current selections as one or more `key:value` pairs
 * (e.g. `drivetrain:awd`), so counts reflect the active result set. Each
 * dimension still reports its own options unfiltered, which is what makes the
 * counts usable for switching values.
 */
export const facetCountsQuerySchema = t.Object({
  filters: t.Optional(
    t.Union([t.String({ maxLength: 200 }), t.Array(t.String({ maxLength: 200 }), { maxItems: 20 })], {
      description: 'Active selections encoded as `key:value`, repeatable',
    }),
  ),
});
