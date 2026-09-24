import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index.ts';

export const categoryIdParamsSchema = t.Object({
  id: uuidSchema('Category identifier (UUID)'),
});

/**
 * Category write body.
 *
 * Deliberately limited to the persisted contract: `categories` stores
 * `parent_id`, `name`, `slug`, `path` and `depth` only. Earlier revisions also
 * advertised `description` and `position`; neither exists as a column and
 * neither is part of the architecture's Categories responsibilities, so they
 * were silently discarded. They are removed here, and the routes attach
 * `rejectUnknownBodyKeys` so unknown fields are rejected at the boundary
 * instead of being dropped.
 *
 * `parentId` semantics: omitted keeps the current parent, a UUID moves the
 * category under that parent, and `null` moves it to the root.
 */
export const createCategoryBodySchema = t.Object({
  parentId: t.Optional(t.Nullable(uuidSchema())),
  name: t.String({ minLength: 1, maxLength: 150 }),
  slug: t.String({
    minLength: 1,
    maxLength: 150,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    description: 'URL-safe identifier, e.g. "sports-cars"',
  }),
});

/**
 * The only fields a category write may contain.
 *
 * Single source of truth for both the schema above and the route-level
 * unknown-field guard, so the two can never drift apart.
 */
export const CATEGORY_WRITE_FIELDS = ['parentId', 'name', 'slug'] as const;

export const updateCategoryBodySchema = t.Partial(createCategoryBodySchema);

export const categoryListingsQuerySchema = t.Object({
  includeDescendants: t.Optional(
    t.BooleanString({
      default: true,
      description: 'Include listings from all descendant categories',
    }),
  ),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: t.Optional(
    t.String({ maxLength: 512, description: 'Opaque cursor from a previous page' }),
  ),
});
