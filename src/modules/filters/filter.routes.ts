import { Elysia } from 'elysia';
import { errorResponseSchema } from '../../shared/schemas/index';
import { filterController } from './filter.controller';
import {
  facetCountsQuerySchema,
  filterCategoryParamsSchema,
  filterFacetResponseSchema,
  globalFacetQuerySchema,
} from './filter.schema';

/**
 * HTTP surface of the Filters module.
 *
 * Routes only wire method, path, schemas and controller handlers together.
 *
 * `GET /filters` and `GET /filters/:categoryId` are distinct:
 * `GET /filters` returns global facets (every filter key, deduplicated, with
 * counts across all listings), while `GET /filters/:categoryId` returns the
 * filter attributes one category declares.
 */
export const filterRoutes = new Elysia({ prefix: '/filters', tags: ['Filters'] })
  .get('', filterController.listGlobal, {
    query: globalFacetQuerySchema,
    detail: {
      summary: 'Get all available filter options with counts (facets)',
      description:
        'Returns every filter available across the marketplace, deduplicated by key, ' +
        'with option counts across all non-deleted listings. Enum and boolean filters ' +
        'carry per-option counts; range filters carry global min/max bounds. ' +
        'Pass repeatable `filters=key:value` selections to scope the counts.',
      responses: {
        200: {
          description: 'Globally-scoped filter options with counts',
          content: { 'application/json': { schema: filterFacetResponseSchema } },
        },
        400: {
          description: 'Validation failed (malformed selection)',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    },
  })
  .get('/:categoryId', filterController.listForCategory, {
    params: filterCategoryParamsSchema,
    query: facetCountsQuerySchema,
    detail: {
      summary: 'Get filter attributes specific to a category',
      description:
        'Returns the filter attributes declared for one category, with facet counts.',
      responses: {
        200: {
          description: 'Filter attributes declared by the category, with counts',
          content: { 'application/json': { schema: filterFacetResponseSchema } },
        },
        400: {
          description: 'Malformed category id',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        404: {
          description: 'Category not found',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    },
  });
