import { t } from 'elysia';

export const filterCategoryParamsSchema = t.Object({
  categoryId: t.String({ format: 'uuid', description: 'Category identifier (UUID)' }),
});

export const filterQuerySchema = t.Object({
  categoryId: t.Optional(t.String({ format: 'uuid', description: 'Scope filters to a category' })),
});
