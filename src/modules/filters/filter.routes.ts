import { Elysia } from 'elysia';
import { filterController } from './filter.controller';
import {
  facetCountsQuerySchema,
  filterCategoryParamsSchema,
  filterQuerySchema,
} from './filter.schema';

/**
 * HTTP surface of the Filters module.
 *
 * Routes only wire method, path, schemas and controller handlers together.
 */
export const filterRoutes = new Elysia({ prefix: '/filters', tags: ['Filters'] })
  .get('', filterController.list, {
    query: filterQuerySchema,
    detail: { summary: 'List available filter definitions' },
  })
  .get('/:categoryId', filterController.listForCategory, {
    params: filterCategoryParamsSchema,
    query: facetCountsQuerySchema,
    detail: { summary: 'List filter definitions and facet counts for a category' },
  });
