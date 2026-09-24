import { Elysia } from 'elysia';
import { rejectUnknownBodyKeys } from '../../shared/utils/strict-body.ts';
import { categoryController } from './category.controller.ts';
import {
  CATEGORY_WRITE_FIELDS,
  categoryIdParamsSchema,
  categoryListingsQuerySchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from './category.schema.ts';

/**
 * HTTP surface of the Categories module.
 *
 * Routes only wire method, path, schemas and controller handlers together.
 *
 * Category writes attach `rejectUnknownBodyKeys` so fields the schema does not
 * declare are rejected rather than silently stripped.
 */
export const categoryRoutes = new Elysia({ prefix: '/categories', tags: ['Categories'] })
  .get('', categoryController.list, {
    detail: { summary: 'List all categories (flat)' },
  })
  .get('/tree', categoryController.tree, {
    detail: { summary: 'Get the nested category tree' },
  })
  .get('/:id', categoryController.getById, {
    params: categoryIdParamsSchema,
    detail: { summary: 'Get a category by id' },
  })
  .get('/:id/listings', categoryController.listListings, {
    params: categoryIdParamsSchema,
    query: categoryListingsQuerySchema,
    detail: { summary: 'List listings in a category' },
  })
  .post('', categoryController.create, {
    body: createCategoryBodySchema,
    transform: rejectUnknownBodyKeys(CATEGORY_WRITE_FIELDS),
    detail: { summary: 'Create a category' },
  })
  .patch('/:id', categoryController.update, {
    params: categoryIdParamsSchema,
    body: updateCategoryBodySchema,
    transform: rejectUnknownBodyKeys(CATEGORY_WRITE_FIELDS),
    detail: { summary: 'Update a category' },
  });
