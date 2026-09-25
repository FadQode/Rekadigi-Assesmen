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

/**
 * Response schema for a facet entry.
 *
 * Documentation-only (attached as `detail.responses`): plain JSON Schema rather
 * than TypeBox, because OpenAPI's `ResponsesObject` accepts raw schema objects,
 * and using the `response` route option would make Elysia strip undeclared
 * fields at runtime.
 *
 * Covers both shape variants:
 * - the global collection route returns globally-scoped facets (no
 *   `categoryId`, options deduplicated across categories);
 * - `GET /filters/:categoryId` returns that category's definitions, which carry
 *   `categoryId`.
 *
 * `options` is empty for `range` filters, which expose `min`/`max` instead.
 */
export const filterFacetResponseSchema = {
  type: 'array' as const,
  description: 'Filter options with counts (facets)',
  items: {
    type: 'object' as const,
    required: ['key', 'label', 'type', 'options', 'count'],
    properties: {
      key: { type: 'string' as const, description: 'Filter slug, e.g. fuel_type' },
      label: { type: 'string' as const, description: 'Human-readable name' },
      type: { type: 'string' as const, enum: ['enum', 'range', 'boolean'] },
      /** Present on category-scoped definitions only. */
      id: { type: 'string' as const, format: 'uuid' },
      categoryId: { type: 'string' as const, format: 'uuid' },
      options: {
        type: 'array' as const,
        description: 'Enum/boolean options with counts; empty for range filters',
        items: {
          type: 'object' as const,
          required: ['value', 'label'],
          properties: {
            value: { type: 'string' as const },
            label: { type: 'string' as const },
            count: { type: 'integer' as const },
          },
        },
      },
      min: { type: 'number' as const, nullable: true, description: 'Range filters: smallest available value' },
      max: { type: 'number' as const, nullable: true, description: 'Range filters: largest available value' },
      count: { type: 'integer' as const, description: 'Matching listings carrying any value for this filter' },
    },
  },
};
