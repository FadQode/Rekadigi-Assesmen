import { pool, type Queryable } from '../../database/pool';
import type {
  FilterAttribute,
  FilterAttributeType,
  FilterOption,
  FilterQuery,
  FilterWithCounts,
  GlobalFilterQuery,
  GlobalFilterWithCounts,
} from './filter.types';

/**
 * Persistence boundary for the Filters module.
 *
 * Filter definitions live in `filter_attributes`; the Listings module reads
 * them through this repository to validate category-specific dynamic
 * attributes before a listing is written.
 */
export interface FilterRepository {
  /** Filter definitions applicable to a category, ordered for display. */
  findByCategoryId(categoryId: string): Promise<FilterAttribute[]>;

  /** Filter definitions enriched with facet counts for the current selection. */
  findWithCounts(query: FilterQuery): Promise<FilterWithCounts[]>;

  /** Global facets, deduplicated by filter key, with counts across all listings. */
  findGlobalWithCounts(query?: GlobalFilterQuery): Promise<GlobalFilterWithCounts[]>;
}

/** Explicit projection mirroring `filter_attributes`; no `SELECT *`. */
const FILTER_COLUMNS = 'id, category_id, name, slug, type, options, created_at, updated_at';

/**
 * Filter slugs that also exist as typed columns on `listings`.
 *
 * A filter slug is not always a JSONB key: `fuel_type`, `transmission`,
 * `price`, `mileage`, `year`, ... are stored in their own typed columns, and
 * the seed's `filter_attributes` rows reuse those slugs. Facet values must be
 * read from the typed column when one exists, otherwise counts silently come
 * back as zero. The typed column is always the canonical source; JSONB is the
 * fallback for genuinely dynamic attributes (`drivetrain`, `warranty`, ...).
 */
const TYPED_TEXT_COLUMNS: Record<string, string> = {
  fuel_type: 'fuel_type',
  transmission: 'transmission',
  condition: 'condition',
  color: 'color',
  city: 'city',
  make: 'make',
  model: 'model',
  status: 'status',
};

const TYPED_NUMERIC_COLUMNS: Record<string, string> = {
  price: 'price',
  mileage: 'mileage',
  year: 'year',
};

/**
 * Resolve a filter key to its text value.
 *
 * `keyExpr` is either the definition's `slug` column (per-row facets) or a
 * bound parameter (a listing-level selection). Only slugs this module knows
 * about are ever interpolated; the value itself is always a placeholder.
 */
function textValueExpression(keyExpr: string): string {
  const arms = Object.entries(TYPED_TEXT_COLUMNS)
    .map(([slug, column]) => `WHEN ${keyExpr} = '${slug}' THEN lower(l.${column})`)
    .join('\n           ');
  return `CASE
           ${arms}
           ELSE lower(l.attributes ->> ${keyExpr})
         END`;
}

/** The same resolution against the alias `l` used by global facet queries. */
const GLOBAL_TEXT_VALUE = textValueExpression('defs.slug');
const GLOBAL_NUMERIC_VALUE = numericValueExpression('defs.slug');

/** Resolve a filter key to its numeric value, guarding JSONB casts. */
function numericValueExpression(keyExpr: string): string {
  const arms = Object.entries(TYPED_NUMERIC_COLUMNS)
    .map(([slug, column]) => `WHEN ${keyExpr} = '${slug}' THEN l.${column}::numeric`)
    .join('\n           ');
  return `CASE
           ${arms}
           ELSE (CASE
                   WHEN (l.attributes ->> ${keyExpr}) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                   THEN (l.attributes ->> ${keyExpr})::numeric
                 END)
         END`;
}

interface FilterRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  type: string;
  options: unknown;
  created_at: Date;
  updated_at: Date;
}

interface CountRow {
  key: string;
  value: string;
  count: number;
}

interface RangeRow {
  key: string;
  min: number | null;
  max: number | null;
  sized: number;
}

/** Boolean filters store no options; both states are always offered. */
const BOOLEAN_FACET_VALUES = ['true', 'false'] as const;

/** `options` is a JSONB array of `{ value, label }`; tolerate partial rows. */
function normalizeOptions(value: unknown): FilterOption[] {
  if (!Array.isArray(value)) return [];
  const options: FilterOption[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const { value: optionValue, label } = entry as { value?: unknown; label?: unknown };
    if (typeof optionValue !== 'string') continue;
    options.push({ value: optionValue, label: typeof label === 'string' ? label : optionValue });
  }
  return options;
}

function mapRow(row: FilterRow): FilterAttribute {
  return {
    id: row.id,
    key: row.slug,
    label: row.name,
    type: row.type as FilterAttributeType,
    categoryId: row.category_id,
    options: normalizeOptions(row.options),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A selection reduces to a key plus the values being matched (lowercased). */
interface Selection {
  key: string;
  values: string[];
}

function buildSelections(selections?: Record<string, string | string[]>): Selection[] {
  if (selections === undefined) return [];

  const result: Selection[] = [];
  for (const [key, raw] of Object.entries(selections)) {
    const values = (Array.isArray(raw) ? raw : [raw])
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());
    if (values.length === 0) continue;
    result.push({ key, values });
  }
  return result;
}

/**
 * Build the guards that restrict the listing set to the current selection.
 *
 * A filter is skipped inside its own dimension, so selecting `drivetrain=awd`
 * still reports counts for `2wd` and `4wd`. That is standard faceted-search
 * behaviour: a facet shows what is reachable by changing its own value.
 *
 * `params` already holds the category id at `$1`, so placeholders continue
 * from its current length and every value is bound, never interpolated.
 */
function buildSelectionGuards(selections: Selection[], params: unknown[]): string {
  return selections
    .map((selection) => {
      params.push(selection.key);
      const keyPlaceholder = `$${params.length}`;
      params.push(selection.values);
      const valuesPlaceholder = `$${params.length}`;
      return (
        `AND (f.slug = ${keyPlaceholder} ` +
        `OR ${textValueExpression(keyPlaceholder)} = ANY(${valuesPlaceholder}::text[]))`
      );
    })
    .join('\n    ');
}

/** Facet options projected as rows, without a JavaScript-side loop. */
const OPTIONS_LATERAL = `
    CROSS JOIN LATERAL (
      SELECT (option ->> 'value') AS value
      FROM jsonb_array_elements(f.options) AS option
      UNION ALL
      SELECT bucket.value
      FROM (VALUES ('true'), ('false')) AS bucket(value)
      WHERE f.type = 'boolean'
    ) AS discovered`;

/**
 * One deduplicated definition per filter slug for the global facet view.
 *
 * A filter is defined once per category that uses it, so `fuel_type` exists as
 * three separate rows. The global endpoint must present one logical filter, so
 * this collapses them by `slug` and takes the union of every declared `enum`
 * option, which is why a globally-scoped `fuel_type` lists `hybrid` even though
 * only some categories declare it.
 *
 * `name`/`type` are `min()`-selected: every slug in this schema uses a single
 * consistent name and type, which the seed enforces.
 */
const GLOBAL_DEFINITIONS = `
  WITH defs AS (
    SELECT
      d0.slug,
      min(d0.name) AS name,
      min(d0.type) AS type,
      CASE
        WHEN min(d0.type) = 'enum' THEN (
          SELECT coalesce(jsonb_agg(DISTINCT option), '[]'::jsonb)
          FROM filter_attributes x
          CROSS JOIN LATERAL jsonb_array_elements(x.options) AS option
          WHERE x.slug = d0.slug AND x.type = 'enum'
        )
        ELSE '[]'::jsonb
      END AS options
    FROM filter_attributes d0
    GROUP BY d0.slug
  )`;

/**
 * Selection guards for the global facet queries.
 *
 * Mirrors `buildSelectionGuards` but keyed off the deduplicated `defs.slug`
 * instead of a per-category definition row. A selection is skipped inside its
 * own dimension so that dimension still reports all of its options.
 */
function buildGlobalSelectionGuards(selections: Selection[], params: unknown[]): string {
  return selections
    .map((selection) => {
      params.push(selection.key);
      const keyPlaceholder = `$${params.length}`;
      params.push(selection.values);
      const valuesPlaceholder = `$${params.length}`;
      // Resolve the *selection's* key, not the row's own slug, so a selection
      // constrains the listing set through the dimension it selects.
      return (
        `AND (defs.slug = ${keyPlaceholder} ` +
        `OR ${textValueExpression(keyPlaceholder)} = ANY(${valuesPlaceholder}::text[]))`
      );
    })
    .join('\n    ');
}

/**
 * PostgreSQL implementation of `FilterRepository`.
 *
 * Reads are parameterized and use the explicit projection above.
 */
export class PostgresFilterRepository implements FilterRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findByCategoryId(categoryId: string): Promise<FilterAttribute[]> {
    const result = await this.db.query<FilterRow>(
      `SELECT ${FILTER_COLUMNS}
       FROM filter_attributes
       WHERE category_id = $1::uuid
       ORDER BY name`,
      [categoryId],
    );
    return result.rows.map(mapRow);
  }

  /**
   * Filter definitions plus facet counts.
   *
   * Two focused aggregate queries are issued instead of one very large union:
   * discrete facets (`enum`/`boolean`) pivot option values with their counts,
   * and `range` facets need `min`/`max` rather than counts per option. Keeping
   * them separate keeps each statement readable and lets each use its own
   * aggregate shape, while both reuse the same value-resolution expression and
   * selection guards. Every count is computed by PostgreSQL; nothing is loaded
   * into the application to be aggregated.
   */
  async findWithCounts(query: FilterQuery): Promise<FilterWithCounts[]> {
    const categoryId = query.categoryId;
    if (categoryId === null) return [];

    const selections = buildSelections(query.selections);

    const [definitions, counts, ranges] = await Promise.all([
      this.findByCategoryId(categoryId),
      this.queryDiscreteCounts(categoryId, selections),
      this.queryRangeBounds(categoryId, selections),
    ]);

    const countsByKey = new Map<string, Map<string, number>>();
    for (const row of counts) {
      const bucket = countsByKey.get(row.key) ?? new Map<string, number>();
      bucket.set(row.value, row.count);
      countsByKey.set(row.key, bucket);
    }

    const rangesByKey = new Map(ranges.map((row) => [row.key, row]));

    return definitions.map((definition) => {
      if (definition.type === 'range') {
        const range = rangesByKey.get(definition.key);
        return {
          ...definition,
          min: range?.min ?? null,
          max: range?.max ?? null,
          count: range?.sized ?? 0,
        };
      }

      const bucket = countsByKey.get(definition.key) ?? new Map<string, number>();
      const options =
        definition.type === 'boolean'
          ? BOOLEAN_FACET_VALUES.map((value) => ({
              value,
              label: value === 'true' ? 'Yes' : 'No',
              count: bucket.get(value) ?? 0,
            }))
          : definition.options.map((option) => ({
              ...option,
              count: bucket.get(option.value.toLowerCase()) ?? 0,
            }));

      const count = options.reduce((sum, option) => sum + (option.count ?? 0), 0);
      return { ...definition, options, count };
    });
  }

  /**
   * Count listings per declared option for all `enum`/`boolean` filters of a
   * category in a single statement.
   */
  private async queryDiscreteCounts(
    categoryId: string,
    selections: Selection[],
  ): Promise<CountRow[]> {
    const params: unknown[] = [categoryId];
    const guards = buildSelectionGuards(selections, params);

    const result = await this.db.query<CountRow>(
      `SELECT
         f.slug AS key,
         discovered.value AS value,
         count(l.id)::int AS count
       FROM filter_attributes f
       ${OPTIONS_LATERAL}
       LEFT JOIN listings l
         ON l.category_id = f.category_id
        AND l.deleted_at IS NULL
        AND l.status <> 'removed'
        AND ${textValueExpression('f.slug')} = discovered.value
       ${guards}
       WHERE f.category_id = $1::uuid
         AND f.type IN ('enum', 'boolean')
       GROUP BY f.slug, discovered.value
       ORDER BY f.slug, discovered.value`,
      params,
    );

    return result.rows;
  }

  /** Bounds and match count for all `range` filters of a category. */
  private async queryRangeBounds(
    categoryId: string,
    selections: Selection[],
  ): Promise<RangeRow[]> {
    const params: unknown[] = [categoryId];
    const guards = buildSelectionGuards(selections, params);

    const result = await this.db.query<RangeRow>(
      `SELECT
         f.slug AS key,
         min(${numericValueExpression('f.slug')})::float8 AS min,
         max(${numericValueExpression('f.slug')})::float8 AS max,
         count(l.id)::int AS sized
       FROM filter_attributes f
       LEFT JOIN listings l
         ON l.category_id = f.category_id
        AND l.deleted_at IS NULL
        AND l.status <> 'removed'
        AND ${numericValueExpression('f.slug')} IS NOT NULL
       ${guards}
       WHERE f.category_id = $1::uuid
         AND f.type = 'range'
       GROUP BY f.slug
       ORDER BY f.slug`,
      params,
    );

    return result.rows;
  }

  /**
   * Global facets for `GET /filters`.
   *
   * Unlike `findWithCounts`, this is not scoped to one category: definitions are
   * deduplicated by slug and counts cover every non-deleted listing, so it
   * answers "what filter options exist across the marketplace, and how many
   * listings carry each value".
   *
   * The same two-query shape as the category-scoped path is reused — one
   * aggregate for discrete options, one for range bounds — because `enum`/
   * `boolean` need per-option counts while `range` needs `min`/`max`. All
   * aggregation happens in PostgreSQL.
   */
  async findGlobalWithCounts(query?: GlobalFilterQuery): Promise<GlobalFilterWithCounts[]> {
    const selections = buildSelections(query?.selections);

    const [definitions, counts, ranges] = await Promise.all([
      this.queryGlobalDefinitions(),
      this.queryGlobalDiscreteCounts(selections),
      this.queryGlobalRangeBounds(selections),
    ]);

    const countsByKey = new Map<string, Map<string, number>>();
    for (const row of counts) {
      const bucket = countsByKey.get(row.key) ?? new Map<string, number>();
      bucket.set(row.value, row.count);
      countsByKey.set(row.key, bucket);
    }

    const rangesByKey = new Map(ranges.map((row) => [row.key, row]));

    return definitions.map((definition) => {
      if (definition.type === 'range') {
        const range = rangesByKey.get(definition.key);
        return {
          key: definition.key,
          label: definition.label,
          type: definition.type,
          options: [],
          min: range?.min ?? null,
          max: range?.max ?? null,
          count: range?.sized ?? 0,
        };
      }

      const bucket = countsByKey.get(definition.key) ?? new Map<string, number>();
      const options =
        definition.type === 'boolean'
          ? BOOLEAN_FACET_VALUES.map((value) => ({
              value,
              label: value === 'true' ? 'Yes' : 'No',
              count: bucket.get(value) ?? 0,
            }))
          : definition.options.map((option) => ({
              ...option,
              count: bucket.get(option.value.toLowerCase()) ?? 0,
            }));

      return {
        key: definition.key,
        label: definition.label,
        type: definition.type,
        options,
        count: options.reduce((sum, option) => sum + (option.count ?? 0), 0),
      };
    });
  }

  /** Deduplicated filter definitions (one row per slug). */
  private async queryGlobalDefinitions(): Promise<FilterAttribute[]> {
    const result = await this.db.query<{
      slug: string;
      name: string;
      type: string;
      options: unknown;
    }>(
      `${GLOBAL_DEFINITIONS}
       SELECT slug, name, type, options FROM defs ORDER BY name`,
    );

    return result.rows.map((row) => ({
      id: row.slug,
      key: row.slug,
      label: row.name,
      type: row.type as FilterAttributeType,
      categoryId: '',
      options: normalizeOptions(row.options),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
  }

  /** Global per-option counts for every `enum`/`boolean` filter slug. */
  private async queryGlobalDiscreteCounts(selections: Selection[]): Promise<CountRow[]> {
    const params: unknown[] = [];
    const guards = buildGlobalSelectionGuards(selections, params);

    const result = await this.db.query<CountRow>(
      `${GLOBAL_DEFINITIONS}
       SELECT defs.slug AS key, discovered.value AS value, count(l.id)::int AS count
       FROM defs
       CROSS JOIN LATERAL (
         SELECT (option ->> 'value') AS value
         FROM jsonb_array_elements(defs.options) AS option
         UNION ALL
         SELECT bucket.value
         FROM (VALUES ('true'), ('false')) AS bucket(value)
         WHERE defs.type = 'boolean'
       ) AS discovered
       LEFT JOIN listings l
         ON l.deleted_at IS NULL
        AND l.status <> 'removed'
        AND ${GLOBAL_TEXT_VALUE} = discovered.value
       WHERE defs.type IN ('enum', 'boolean')
       ${guards}
       GROUP BY defs.slug, discovered.value
       ORDER BY defs.slug, discovered.value`,
      params,
    );

    return result.rows;
  }

  /** Global bounds and match count for every `range` filter slug. */
  private async queryGlobalRangeBounds(selections: Selection[]): Promise<RangeRow[]> {
    const params: unknown[] = [];
    const guards = buildGlobalSelectionGuards(selections, params);

    const result = await this.db.query<RangeRow>(
      `${GLOBAL_DEFINITIONS}
       SELECT
         defs.slug AS key,
         min(${GLOBAL_NUMERIC_VALUE})::float8 AS min,
         max(${GLOBAL_NUMERIC_VALUE})::float8 AS max,
         count(l.id)::int AS sized
       FROM defs
       LEFT JOIN listings l
         ON l.deleted_at IS NULL
        AND l.status <> 'removed'
        AND ${GLOBAL_NUMERIC_VALUE} IS NOT NULL
       WHERE defs.type = 'range'
       ${guards}
       GROUP BY defs.slug
       ORDER BY defs.slug`,
      params,
    );

    return result.rows;
  }
}

export const filterRepository: FilterRepository = new PostgresFilterRepository();
