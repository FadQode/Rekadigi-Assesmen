import { pool, type Queryable } from '../../database/pool.ts';
import { ValidationError } from '../../shared/errors/http-errors.ts';
import { decodeCursor, encodeCursor } from '../../shared/utils/cursor.ts';
import type {
  CreateListingData,
  Listing,
  ListingAttributes,
  ListingCursorPayload,
  ListingSearchFilters,
  ListingSearchResult,
  ListingStatus,
  ListingSuggestion,
  UpdateListingData,
} from './listing.types.ts';

/**
 * Persistence boundary for the Listings module.
 *
 * The contract is deliberately framework-free: no HTTP concepts, no Elysia
 * types, no status codes. SQL lives exclusively in the implementation below.
 */
export interface ListingRepository {
  findById(id: string): Promise<Listing | null>;

  create(data: CreateListingData): Promise<Listing>;

  update(id: string, data: UpdateListingData): Promise<Listing | null>;

  /**
   * Soft delete: sets `status = 'removed'` and stamps `deleted_at`. The row is
   * never physically removed (`listings.category_id` uses `ON DELETE RESTRICT`
   * and historical listings must remain queryable for reporting).
   */
  softDelete(id: string): Promise<boolean>;

  search(filters: ListingSearchFilters): Promise<ListingSearchResult>;

  suggest(prefix: string, limit: number): Promise<ListingSuggestion[]>;
}

/** Columns selected for a full listing projection. No `SELECT *` anywhere. */
const LISTING_COLUMN_LIST = [
  'id',
  'title',
  'description',
  'category_id',
  'make',
  'model',
  'year',
  'mileage',
  'price',
  'condition',
  'transmission',
  'fuel_type',
  'color',
  'city',
  'status',
  'attributes',
  'images',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const LISTING_COLUMNS = LISTING_COLUMN_LIST.join(', ');

/**
 * A listing is considered soft-deleted when either mechanism is present.
 *
 * `softDelete` writes both, but pre-existing/seeded rows use only
 * `status = 'removed'` (with `deleted_at IS NULL`), so every read checks both
 * to keep removed listings hidden regardless of how they were removed.
 */
const NOT_SOFT_DELETED = `(l.deleted_at IS NULL AND l.status <> 'removed')`;

/** Same projection, qualified with a table alias for joins/subqueries. */
function aliasedColumns(alias: string): string {
  return LISTING_COLUMN_LIST.map((column) => `${alias}.${column}`).join(', ');
}

/**
 * Full-precision `created_at` for the keyset cursor.
 *
 * `pg` decodes `timestamptz` into a JavaScript `Date`, which only keeps
 * milliseconds. Formatting in SQL preserves PostgreSQL's microseconds, so the
 * cursor never skips rows that share a millisecond.
 */
const CURSOR_TIMESTAMP =
  `to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at`;

interface ListingRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  /** NUMERIC is returned as a string by `pg` to avoid precision loss. */
  price: string;
  condition: string;
  transmission: string;
  fuel_type: string;
  color: string | null;
  city: string;
  status: string;
  attributes: ListingAttributes | null;
  images: unknown;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  cursor_at?: string;
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      urls.push(item);
      continue;
    }
    if (item !== null && typeof item === 'object') {
      const url = (item as { url?: unknown }).url;
      if (typeof url === 'string') urls.push(url);
    }
  }
  return urls;
}

function mapRow(row: ListingRow): Listing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    make: row.make,
    model: row.model,
    year: row.year,
    mileage: row.mileage,
    price: Number(row.price),
    condition: row.condition,
    transmission: row.transmission,
    fuelType: row.fuel_type,
    color: row.color,
    city: row.city,
    status: row.status as ListingStatus,
    attributes: row.attributes ?? {},
    images: normalizeImages(row.images),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Ordered image URLs; compact so undisplayed positions never persist. */
function serializeImages(images: CreateListingData['images']): string {
  if (images === undefined || images.length === 0) return '[]';
  const ordered = images
    .map((image, index) => ({ url: image.url, position: image.position ?? index }))
    .sort((a, b) => a.position - b.position)
    .map((image) => image.url);
  return JSON.stringify(ordered);
}

interface WhereClause {
  sql: string;
  values: unknown[];
}

/**
 * Build the shared `WHERE` fragment from structured filters.
 *
 * Values are only ever appended to `values` and referenced through numbered
 * placeholders, so user input never reaches the SQL text. Handles the
 * `deleted_at`/`status` defaults that keep soft-deleted rows out of normal
 * reads.
 */
function buildWhereClause(filters: ListingSearchFilters): WhereClause {
  const values: unknown[] = [];
  const conditions: string[] = [];

  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  // Soft-deleted rows are hidden from every browse. Two mechanisms can mark a
  // listing as removed: `deleted_at` (written by `softDelete`) and
  // `status = 'removed'` (the application contract, also used by seeded rows
  // that have `deleted_at IS NULL`). The default excludes both.
  //
  // An explicit `status` filter is a deliberate request for that state, so it
  // is honoured on its own; `status=removed` therefore returns removed rows
  // regardless of which mechanism was used.
  if (filters.status !== undefined) {
    conditions.push(`l.status = ${bind(filters.status)}`);
    if (filters.status !== 'removed') {
      conditions.push('l.deleted_at IS NULL');
    }
  } else {
    conditions.push(NOT_SOFT_DELETED);
  }

  const categoryIds = resolveCategoryIds(filters);
  if (categoryIds !== null) {
    if (categoryIds.length === 0) {
      // An empty id set can never match; keep the predicate valid rather than
      // emitting `IN ()`.
      conditions.push('FALSE');
    } else if (categoryIds.length === 1) {
      conditions.push(`l.category_id = ${bind(categoryIds[0])}::uuid`);
    } else {
      conditions.push(`l.category_id = ANY(${bind(categoryIds)}::uuid[])`);
    }
  }

  const scalarColumns: Array<[keyof ListingSearchFilters, string]> = [
    ['make', 'l.make'],
    ['model', 'l.model'],
    ['condition', 'l.condition'],
    ['transmission', 'l.transmission'],
    ['fuelType', 'l.fuel_type'],
    ['color', 'l.color'],
    ['city', 'l.city'],
  ];

  for (const [key, column] of scalarColumns) {
    const value = filters[key];
    if (typeof value === 'string' && value.length > 0) {
      conditions.push(`${column} = ${bind(value)}`);
    }
  }

  if (filters.priceMin !== undefined) {
    conditions.push(`l.price >= ${bind(filters.priceMin)}::numeric`);
  }
  if (filters.priceMax !== undefined) {
    conditions.push(`l.price <= ${bind(filters.priceMax)}::numeric`);
  }
  if (filters.yearMin !== undefined) {
    conditions.push(`l.year >= ${bind(filters.yearMin)}::smallint`);
  }
  if (filters.yearMax !== undefined) {
    conditions.push(`l.year <= ${bind(filters.yearMax)}::smallint`);
  }
  if (filters.mileageMax !== undefined) {
    conditions.push(`l.mileage <= ${bind(filters.mileageMax)}::integer`);
  }

  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    if (value === undefined || value === null) continue;

    const keyPlaceholder = bind(key);

    if (Array.isArray(value)) {
      const options = value.map((item) => String(item).toLowerCase());
      // Case-insensitive to bridge legacy display-case values stored by the
      // seed (`"AWD"`) with the canonical lowercase option values declared in
      // `filter_attributes` (`"awd"`) that clients filter by.
      conditions.push(
        `lower(l.attributes ->> ${keyPlaceholder}) = ANY(${bind(options)}::text[])`,
      );
      continue;
    }

    if (typeof value === 'object') {
      // Nested JSONB is intentionally unsupported: filter values are scalars.
      continue;
    }

    // Compared case-insensitively and as text, mirroring `->>` semantics. The
    // service stores enum values in the canonical case declared by
    // `filter_attributes`, but seeded rows predate that normalization, so the
    // comparison must not depend on the stored case. A mismatch on the JSON
    // type is a non-match rather than a cast error.
    conditions.push(
      `lower(l.attributes ->> ${keyPlaceholder}) = ${bind(String(value).toLowerCase())}`,
    );
  }

  const text = filters.text?.trim();
  if (text !== undefined && text.length > 0) {
    conditions.push(`l.search_vector @@ websearch_to_tsquery('english', ${bind(text)})`);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join('\n  AND ')}` : '',
    values,
  };
}

/** `categoryIds` takes precedence over a single `categoryId`. */
function resolveCategoryIds(filters: ListingSearchFilters): string[] | null {
  if (filters.categoryIds !== undefined) {
    return filters.categoryIds.filter((id) => typeof id === 'string' && id.length > 0);
  }
  if (filters.categoryId !== undefined && filters.categoryId.length > 0) {
    return [filters.categoryId];
  }
  return null;
}

interface Ordering {
  column: string;
  direction: 'ASC' | 'DESC';
}

function resolveOrdering(filters: ListingSearchFilters): Ordering {
  const direction: Ordering['direction'] = filters.sortDirection === 'asc' ? 'ASC' : 'DESC';
  switch (filters.sortBy) {
    case 'price':
      return { column: 'l.price', direction };
    case 'year':
      return { column: 'l.year', direction };
    case 'mileage':
      return { column: 'l.mileage', direction };
    case 'createdAt':
    case undefined:
    default:
      // Primary browse ordering must be `created_at DESC, id DESC` to line up
      // with `idx_listings_created_cursor`.
      return { column: 'l.created_at', direction };
  }
}

function toIsoTimestamp(value: string): string {
  return value.replace(' ', 'T').replace('+00', 'Z');
}

/**
 * PostgreSQL implementation of `ListingRepository`.
 *
 * Every statement that can be reached by a user uses `$1, $2, ...`
 * placeholders; only table/column identifiers chosen by this module are
 * interpolated. Reads rely on `idx_listings_created_cursor` for keyset
 * pagination and never load more than `limit + 1` rows.
 */
export class PostgresListingRepository implements ListingRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findById(id: string): Promise<Listing | null> {
    const result = await this.db.query<ListingRow>(
      `SELECT ${aliasedColumns('l')}
       FROM listings l
       WHERE l.id = $1::uuid AND ${NOT_SOFT_DELETED}`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: CreateListingData): Promise<Listing> {
    const values: unknown[] = [
      data.categoryId,
      data.title,
      data.description ?? null,
      data.make,
      data.model,
      data.year,
      data.mileage ?? 0,
      data.price,
      data.condition,
      data.transmission,
      data.fuelType,
      data.color ?? null,
      data.city,
      data.status ?? 'available',
      serializeImages(data.images),
      JSON.stringify(data.attributes ?? {}),
    ];

    // Casts make the statement explicit about the JSONB columns and keep the
    // parameter types unambiguous. Constraint violations (unknown category,
    // FK, checks) surface through the pool's error mapping.
    const result = await this.db.query<ListingRow>(
      `INSERT INTO listings (
         category_id, title, description, make, model, year, mileage, price,
         condition, transmission, fuel_type, color, city, status, images, attributes
       )
       VALUES (
         $1::uuid, $2, $3, $4, $5, $6::smallint, $7::integer, $8::numeric,
         $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb
       )
       RETURNING ${LISTING_COLUMNS}`,
      values,
    );
    return mapRow(result.rows[0]!);
  }

  async update(id: string, data: UpdateListingData): Promise<Listing | null> {
    const values: unknown[] = [id];
    const assignments: string[] = [];

    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    const scalarColumns: Array<[keyof UpdateListingData, string, string]> = [
      ['title', 'title', 'text'],
      ['description', 'description', 'text'],
      ['categoryId', 'category_id', 'uuid'],
      ['make', 'make', 'text'],
      ['model', 'model', 'text'],
      ['year', 'year', 'smallint'],
      ['mileage', 'mileage', 'integer'],
      ['price', 'price', 'numeric'],
      ['condition', 'condition', 'text'],
      ['transmission', 'transmission', 'text'],
      ['fuelType', 'fuel_type', 'text'],
      ['color', 'color', 'text'],
      ['city', 'city', 'text'],
      ['status', 'status', 'text'],
    ];

    for (const [key, column, cast] of scalarColumns) {
      const value = data[key];
      if (value !== undefined) {
        assignments.push(`${column} = ${bind(value)}::${cast}`);
      }
    }

    if (data.attributes !== undefined) {
      assignments.push(`attributes = ${bind(JSON.stringify(data.attributes ?? {}))}::jsonb`);
    }

    if (assignments.length === 0) {
      // Nothing to change: still return the current row so PATCH stays
      // idempotent, without issuing a no-op write.
      return this.findById(id);
    }

    const result = await this.db.query<ListingRow>(
      `UPDATE listings l
       SET ${assignments.join(', ')}
       WHERE l.id = $1::uuid AND ${NOT_SOFT_DELETED}
       RETURNING ${aliasedColumns('l')}`,
      values,
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    // Both mechanisms are set: `status = 'removed'` is the documented
    // application contract, while `deleted_at` is the schema's dedicated
    // soft-delete column. Stamping only one would leave reads that filter on
    // the other still returning the row.
    //
    // The `status <> 'removed'` guard keeps the operation idempotent: deleting
    // an already-removed listing reports no match instead of reporting success.
    const result = await this.db.query<{ id: string }>(
      `UPDATE listings
       SET status = 'removed', deleted_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL AND status <> 'removed'
       RETURNING id`,
      [id],
    );
    return result.rows.length > 0;
  }

  async search(filters: ListingSearchFilters): Promise<ListingSearchResult> {
    const { sql: whereSql, values } = buildWhereClause(filters);
    const ordering = resolveOrdering(filters);

    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    let keysetSql = '';
    if (filters.cursor !== undefined && filters.cursor.length > 0) {
      if (ordering.column !== 'l.created_at') {
        throw new ValidationError('Cursor pagination is only supported for createdAt ordering', {
          details: { code: 'CURSOR_UNSUPPORTED_ORDER' },
        });
      }

      const payload = decodeListingCursor(filters.cursor);
      const operator = ordering.direction === 'DESC' ? '<' : '>';
      // Row-wise comparison matches `idx_listings_created_cursor` exactly, so
      // PostgreSQL can seek instead of scanning.
      keysetSql =
        `AND (l.created_at, l.id) ${operator} ` +
        `(${bind(payload.createdAt)}::timestamptz, ${bind(payload.id)}::uuid)`;
    }

    // Fetch one extra row; the service only needs to know whether another page
    // exists, which avoids a COUNT(*) per browse request.
    const limit = Math.max(1, Math.trunc(filters.limit));
    const limitPlaceholder = bind(limit + 1);

    const result = await this.db.query<ListingRow>(
      `SELECT ${aliasedColumns('l')}, ${CURSOR_TIMESTAMP}
       FROM listings l
       ${whereSql}
       ${keysetSql}
       ORDER BY ${ordering.column} ${ordering.direction}, l.id ${ordering.direction}
       LIMIT ${limitPlaceholder}`,
      values,
    );

    const hasNextPage = result.rows.length > limit;
    const rows = hasNextPage ? result.rows.slice(0, limit) : result.rows;
    const last = rows.at(-1);

    const response: ListingSearchResult = {
      data: rows.map(mapRow),
      pagination: {
        nextCursor:
          hasNextPage && last !== undefined && last.cursor_at !== undefined
            ? encodeCursor({ createdAt: toIsoTimestamp(last.cursor_at), id: last.id })
            : null,
        hasNextPage,
      },
    };

    if (filters.includeTotal === true) {
      response.total = await this.count(filters);
    }

    return response;
  }

  /**
   * Typeahead suggestions for `make` and `model`.
   *
   * Matching is done entirely in PostgreSQL using `pg_trgm`:
   *
   * - prefix/partial: `lower(make) LIKE '%q%'`, indexable by the
   *   `gin_trgm_ops` indexes;
   * - fuzzy: the trigram similarity operator `%`, which absorbs typos.
   *
   * Both predicates are covered by `idx_listings_make_trgm` and
   * `idx_listings_model_trgm`, so the plan is a bitmap index scan rather than a
   * sequential scan. Only the bounded result set is transferred; no listing or
   * distinct-value inventory is loaded into the application.
   *
   * The stored display-case value is returned (not the lowercased form) so the
   * suggestion stays usable as the case-sensitive `?make=` / `?model=` filter
   * value in `search`.
   */
  async suggest(prefix: string, limit: number): Promise<ListingSuggestion[]> {
    const normalized = prefix.trim().toLowerCase();
    if (normalized.length === 0) return [];

    const escaped = escapeLikePattern(normalized);
    const boundedLimit = Math.max(1, Math.trunc(limit));

    const result = await this.db.query<ListingSuggestion>(
      `WITH candidates AS (
         SELECT lower(make) AS normalized, make AS raw, 'make' AS type
         FROM listings
         WHERE deleted_at IS NULL
           AND status <> 'removed'
           AND (lower(make) LIKE $1 OR lower(make) % $2)
         UNION ALL
         SELECT lower(model) AS normalized, model AS raw, 'model' AS type
         FROM listings
         WHERE deleted_at IS NULL
           AND status <> 'removed'
           AND (lower(model) LIKE $1 OR lower(model) % $2)
       )
       SELECT min(raw) AS value, min(type) AS type
       FROM candidates
       GROUP BY normalized
       ORDER BY (normalized LIKE $3) DESC, similarity(normalized, $2) DESC, min(raw) ASC
       LIMIT $4::integer`,
      [`%${escaped}%`, normalized, `${escaped}%`, boundedLimit],
    );

    return result.rows;
  }

  /**
   * Exact match count for the current filters.
   *
   * Only called when `includeTotal` is explicitly requested: browse requests
   * must not pay for `COUNT(*)`.
   */
  private async count(filters: ListingSearchFilters): Promise<number> {
    const { sql: whereSql, values } = buildWhereClause(filters);
    const result = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM listings l
       ${whereSql}`,
      values,
    );
    return result.rows[0]?.count ?? 0;
  }
}

/**
 * Escape LIKE metacharacters in a user-supplied pattern fragment.
 *
 * Without this a query of `%` or `_` would act as a wildcard and widen the
 * match far beyond what the user typed. PostgreSQL's default LIKE escape
 * character is a backslash, so no `ESCAPE` clause is required.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function decodeListingCursor(cursor: string): ListingCursorPayload {
  let decoded: Record<string, unknown>;
  try {
    decoded = decodeCursor<Record<string, unknown>>(cursor);
  } catch {
    throw new ValidationError('Invalid pagination cursor', {
      details: { code: 'INVALID_CURSOR' },
    });
  }

  const createdAt = decoded.createdAt;
  const id = decoded.id;
  if (
    typeof createdAt !== 'string' ||
    createdAt.length === 0 ||
    typeof id !== 'string' ||
    id.length === 0
  ) {
    throw new ValidationError('Invalid pagination cursor', {
      details: { code: 'INVALID_CURSOR' },
    });
  }

  return { createdAt, id };
}

export const listingRepository: ListingRepository = new PostgresListingRepository();
