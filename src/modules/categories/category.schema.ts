import { t } from 'elysia';
import { uuidSchema } from '../../shared/schemas/index';

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

/** Query schema for `GET /categories/:id/listings`. */
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

/**
 * Response schemas for the category read/write contract.
 *
 * Plain JSON Schema rather than TypeBox: these are attached as
 * `detail.responses` documentation only, and OpenAPI's `ResponsesObject` type
 * accepts raw schema objects, not `t.Object` instances. Using the `response`
 * route option instead would make Elysia strip undeclared fields at runtime.
 *
 * `children` is declared as a self-referencing array so the nested tree shape is
 * documented rather than a recursive `$ref` OpenAPI cannot express inline.
 */
export const categoryResponseSchema = {
  type: 'object' as const,
  required: ['id', 'parentId', 'name', 'slug', 'path', 'depth', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    parentId: { type: 'string' as const, nullable: true, format: 'uuid' },
    name: { type: 'string' as const },
    slug: { type: 'string' as const },
    path: { type: 'string' as const, description: 'Materialized ancestry, e.g. /vehicles/cars/suv' },
    depth: { type: 'integer' as const, description: '0 for a root category' },
    createdAt: { type: 'string' as const, format: 'date-time' },
    updatedAt: { type: 'string' as const, format: 'date-time' },
  },
};

/** A category with its nested descendant subtree. */
export const categoryTreeResponseSchema = {
  type: 'object' as const,
  required: ['id', 'parentId', 'name', 'slug', 'path', 'depth', 'children', 'createdAt', 'updatedAt'],
  properties: {
    ...categoryResponseSchema.properties,
    children: {
      type: 'array' as const,
      description: 'Direct children, each nested the same way',
      items: categoryResponseSchema,
    },
  },
};

/** Cursor-paginated listing page returned by `GET /categories/:id/listings`. */
export const categoryListingsResponseSchema = {
  type: 'object' as const,
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array' as const, items: { type: 'object' as const, additionalProperties: true } },
    pagination: {
      type: 'object' as const,
      required: ['nextCursor', 'hasNextPage'],
      properties: {
        nextCursor: { type: 'string' as const, nullable: true },
        hasNextPage: { type: 'boolean' as const },
      },
    },
  },
};
