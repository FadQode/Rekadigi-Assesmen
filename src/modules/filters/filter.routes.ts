import { Elysia } from 'elysia';
import { filterController } from './filter.controller';
import {
  facetCountsQuerySchema,
  filterCategoryParamsSchema,
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
    },
  })
  .get('/:categoryId', filterController.listForCategory, {
    params: filterCategoryParamsSchema,
    query: facetCountsQuerySchema,
    detail: {
      summary: 'Get filter attributes specific to a category',
      description:
        'Returns the filter attributes declared for one category, with facet counts.',
    },
  });
