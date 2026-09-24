import { Elysia } from 'elysia';
import { rejectUnknownQueryKeys } from '../../shared/utils/strict-input';
import { listingController } from './listing.controller';
import {
  LISTING_SEARCH_QUERY_KEYS,
  createListingBodySchema,
  listingIdParamsSchema,
  searchListingsQuerySchema,
  suggestListingsQuerySchema,
  updateListingBodySchema,
} from './listing.schema';

/**
 * HTTP surface of the Listings module.
 *
 * Routes only wire method, path, schemas and controller handlers together.
 * No SQL, no business logic, no data transformation happens here.
 *
 * The search endpoints attach `rejectUnknownQueryKeys` so a misspelled or
 * unsupported filter is reported as a 400 instead of being dropped silently,
 * which previously returned unfiltered rows for a request that looked filtered.
 */
export const listingRoutes = new Elysia({ prefix: '/listings', tags: ['Listings'] })
  .get('', listingController.list, {
    query: searchListingsQuerySchema,
    transform: rejectUnknownQueryKeys(LISTING_SEARCH_QUERY_KEYS),
    detail: {
      summary: 'List and search listings',
      description:
        'Returns listings with structured filtering, full-text search, sorting and cursor pagination.',
    },
  })
  .get('/search', listingController.search, {
    query: searchListingsQuerySchema,
    transform: rejectUnknownQueryKeys(LISTING_SEARCH_QUERY_KEYS),
    detail: { summary: 'Search listings' },
  })
  .get('/search/suggest', listingController.suggest, {
    query: suggestListingsQuerySchema,
    detail: {
      summary: 'Typeahead suggestions for make and model',
      description:
        'Returns distinct make and model values matching the query. Matching is performed in PostgreSQL using pg_trgm, so partial, case-insensitive and fuzzy (typo-tolerant) input all match. Values are returned in their stored display casing so they can be reused directly as make/model filters. Title suggestions are not supported.',
    },
  })
  .get('/:id', listingController.getById, {
    params: listingIdParamsSchema,
    detail: { summary: 'Get a listing by id' },
  })
  .post('', listingController.create, {
    body: createListingBodySchema,
    detail: { summary: 'Create a listing' },
  })
  .patch('/:id', listingController.update, {
    params: listingIdParamsSchema,
    body: updateListingBodySchema,
    detail: { summary: 'Update a listing' },
  })
  .delete('/:id', listingController.remove, {
    params: listingIdParamsSchema,
    detail: { summary: 'Soft-delete a listing' },
  });
