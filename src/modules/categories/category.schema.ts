import { t } from 'elysia';

export const categoryIdParamsSchema = t.Object({
  id: t.String({ format: 'uuid', description: 'Category identifier (UUID)' }),
});

export const createCategoryBodySchema = t.Object({
  parentId: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
  name: t.String({ minLength: 1, maxLength: 150 }),
  slug: t.String({
    minLength: 1,
    maxLength: 150,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    description: 'URL-safe identifier, e.g. "sports-cars"',
  }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  position: t.Optional(t.Integer({ minimum: 0, description: 'Sibling ordering hint' })),
});

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
