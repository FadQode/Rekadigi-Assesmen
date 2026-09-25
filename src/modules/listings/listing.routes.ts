import { Elysia } from 'elysia';
import { errorResponseSchema } from '../../shared/schemas/index';
import { rejectUnknownQueryKeys } from '../../shared/utils/strict-input';
import { listingController } from './listing.controller';
import {
  LISTING_SEARCH_QUERY_KEYS,
  createListingBodySchema,
  listingIdParamsSchema,
  listingResponseSchema,
  listingSearchResponseSchema,
  searchListingsQuerySchema,
  suggestListingsQuerySchema,
  suggestResponseSchema,
  updateListingBodySchema,
} from './listing.schema';

/**
 * Documented error responses shared by every listing route.
 *
 * Metadata only: these are attached via `detail.responses`, not Elysia's
 * `response` option, so nothing is stripped out of the real response body.
 */
const errorResponses = {
  400: {
    description: 'Validation failed (bad body, query, or malformed cursor)',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'Listing or referenced category not found',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
};

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
        'Returns listings with structured filtering, full-text search, sorting and cursor pagination. ' +
        'Ordering is deterministic by (createdAt, id); cursor pagination is supported for createdAt ordering only.',
      responses: {
        200: {
          description: 'A page of listings with cursor pagination metadata',
          content: { 'application/json': { schema: listingSearchResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .get('/search', listingController.search, {
    query: searchListingsQuerySchema,
    transform: rejectUnknownQueryKeys(LISTING_SEARCH_QUERY_KEYS),
    detail: {
      summary: 'Search listings',
      description:
        'Full-text and structured search over listings, sharing the GET /listings filter, sorting and pagination contract.',
      responses: {
        200: {
          description: 'A page of matching listings with cursor pagination metadata',
          content: { 'application/json': { schema: listingSearchResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .get('/search/suggest', listingController.suggest, {
    query: suggestListingsQuerySchema,
    detail: {
      summary: 'Autocomplete suggestions for make, model and city',
      description:
        'Returns distinct make, model and city values matching the query, each tagged with its `type`. Matching is performed in PostgreSQL using pg_trgm, so partial, case-insensitive and fuzzy (typo-tolerant) input all match. Values are returned in their stored display casing so they can be reused directly as the `make`, `model` or `city` search filters.',
      responses: {
        200: {
          description: 'Matching suggestions (empty array when nothing matches)',
          content: { 'application/json': { schema: suggestResponseSchema } },
        },
        400: errorResponses[400],
      },
    },
  })
  .get('/:id', listingController.getById, {
    params: listingIdParamsSchema,
    detail: {
      summary: 'Get a listing by id',
      responses: {
        200: {
          description: 'The requested listing',
          content: { 'application/json': { schema: listingResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .post('', listingController.create, {
    body: createListingBodySchema,
    detail: {
      summary: 'Create a listing',
      responses: {
        201: {
          description: 'The created listing',
          content: { 'application/json': { schema: listingResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .patch('/:id', listingController.update, {
    params: listingIdParamsSchema,
    body: updateListingBodySchema,
    detail: {
      summary: 'Update a listing',
      description:
        'Partial update. Omitted fields are left unchanged; `attributes` is replaced wholesale when supplied.',
      responses: {
        200: {
          description: 'The updated listing',
          content: { 'application/json': { schema: listingResponseSchema } },
        },
        ...errorResponses,
      },
    },
  })
  .delete('/:id', listingController.remove, {
    params: listingIdParamsSchema,
    detail: {
      summary: 'Soft-delete a listing',
      description:
        'Sets `status = removed` and stamps `deleted_at`. The row is retained; soft-deleted listings are hidden by normal reads.',
      responses: {
        204: { description: 'Listing soft-deleted' },
        ...errorResponses,
      },
    },
  });
