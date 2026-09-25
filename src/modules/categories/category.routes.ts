import { Elysia } from 'elysia';
import { errorResponseSchema } from '../../shared/schemas/index';
import { rejectUnknownBodyKeys } from '../../shared/utils/strict-input';
import { categoryController } from './category.controller';
import {
  CATEGORY_WRITE_FIELDS,
  categoryIdParamsSchema,
  categoryListingsQuerySchema,
  categoryListingsResponseSchema,
  categoryResponseSchema,
  categoryTreeResponseSchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from './category.schema';

/**
 * Documented error responses shared by every category route.
 *
 * Metadata only: attached via `detail.responses`, not Elysia's `response`
 * option, so nothing is stripped out of the real response body.
 */
const errorResponses = {
  400: {
    description: 'Validation failed (bad body, query, or malformed UUID)',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'Category or referenced parent category not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  409: {
    description: 'Slug already exists for this parent, or the move would create a cycle',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
};

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
    detail: {
      summary: 'Get full category tree',
      description:
        'Returns the complete category hierarchy as nested roots with recursive `children`. ' +
        'Assembled with one ordered read, so depth is unbounded without extra round trips.',
      responses: {
        200: {
          description: 'The nested category tree',
          content: { 'application/json': { schema: { type: 'array', items: categoryTreeResponseSchema } } },
        },
      },
    },
  })
  .get('/tree', categoryController.tree, {
    detail: {
      summary: 'Get the nested category tree (alias of GET /categories)',
      responses: {
        200: {
          description: 'The nested category tree',
          content: { 'application/json': { schema: { type: 'array', items: categoryTreeResponseSchema } } },
        },
      },
    },
  })
  .get('/:id', categoryController.getById, {
    params: categoryIdParamsSchema,
    detail: {
      summary: 'Get single category with its children',
      description:
        'Returns one category together with its nested descendant subtree.',
      responses: {
        200: {
          description: 'The category and its descendants',
          content: { 'application/json': { schema: categoryTreeResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .get('/:id/listings', categoryController.listListings, {
    params: categoryIdParamsSchema,
    query: categoryListingsQuerySchema,
    detail: {
      summary: 'Browse listings scoped to a category and its subcategories',
      description:
        'Lists listings in the category. `includeDescendants` (default true) includes the whole ' +
        'subtree. Soft-deleted listings are excluded. Ordered by (createdAt, id) descending with ' +
        'cursor pagination.',
      responses: {
        200: {
          description: 'A page of listings with cursor pagination metadata',
          content: { 'application/json': { schema: categoryListingsResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .post('', categoryController.create, {
    body: createCategoryBodySchema,
    transform: rejectUnknownBodyKeys(CATEGORY_WRITE_FIELDS),
    detail: {
      summary: 'Create category node',
      description:
        'Creates a category. `parentId` omitted or null creates a root; `path` and `depth` are derived using the parent.',
      responses: {
        201: {
          description: 'The created category',
          content: { 'application/json': { schema: categoryResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .patch('/:id', categoryController.update, {
    params: categoryIdParamsSchema,
    body: updateCategoryBodySchema,
    transform: rejectUnknownBodyKeys(CATEGORY_WRITE_FIELDS),
    detail: {
      summary: 'Update category',
      description:
        'Partial update. Omitted fields are unchanged; `parentId: null` moves the category to the root. A move rewrites `path`/`depth` for the whole subtree.',
      responses: {
        200: {
          description: 'The updated category',
          content: { 'application/json': { schema: categoryResponseSchema } },
        },
        ...errorResponses,
      },
    },
  });
