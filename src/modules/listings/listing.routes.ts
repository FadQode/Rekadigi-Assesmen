import { Elysia } from 'elysia';
import { listingController } from './listing.controller.ts';
import {
  createListingBodySchema,
  listingIdParamsSchema,
  searchListingsQuerySchema,
  suggestListingsQuerySchema,
  updateListingBodySchema,
} from './listing.schema.ts';

/**
 * HTTP surface of the Listings module.
 *
 * Routes only wire method, path, schemas and controller handlers together.
 * No SQL, no business logic, no data transformation happens here.
 */
export const listingRoutes = new Elysia({ prefix: '/listings', tags: ['Listings'] })
  .get('', listingController.list, {
    query: searchListingsQuerySchema,
    detail: {
      summary: 'List and search listings',
      description:
        'Returns listings with structured filtering, full-text search, sorting and cursor pagination.',
    },
  })
  .get('/search', listingController.search, {
    query: searchListingsQuerySchema,
    detail: { summary: 'Search listings' },
  })
  .get('/search/suggest', listingController.suggest, {
    query: suggestListingsQuerySchema,
    detail: { summary: 'Typeahead suggestions for make, model and title' },
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
