/**
 * Supported filter value kinds.
 *
 * - `enum`     : fixed set of options (fuel type, transmission, drivetrain, ...)
 * - `range`    : numeric bounds (price, year, mileage, engine_cc, ...)
 * - `boolean`  : yes/no flags (warranty, accident_free, sunroof, ...)
 */
export type FilterAttributeType = 'enum' | 'range' | 'boolean';

/** A single selectable option for an `enum` filter. */
export interface FilterOption {
  value: string;
  label: string;
  /** Populated only when the option is returned with facet counts. */
  count?: number;
}

/**
 * A filter definition scoped to one category.
 *
 * Mirrors the `filter_attributes` table exactly: `key` maps to the `slug`
 * column (the key written into `listings.attributes`), `label` maps to `name`.
 * Only `enum` filters carry `options`; `range` and `boolean` filters leave it
 * empty, which is why no min/max bounds are modelled here — the database does
 * not store them.
 */
export interface FilterAttribute {
  id: string;
  key: string;
  label: string;
  type: FilterAttributeType;
  categoryId: string;
  options: FilterOption[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A filter definition enriched with facet counts for a result set.
 *
 * Extends `FilterAttribute` additively so the base definition contract used by
 * attribute validation is untouched:
 *
 * - `enum`    : each declared option carries a `count`.
 * - `boolean` : `options` is synthesized as `true`/`false` with a `count` each
 *               (boolean filters store no options in the database).
 * - `range`   : `min`/`max` describe the available value range; `options`
 *               stays empty as declared.
 *
 * `count` is the number of listings matching the current selection that have
 * any value for this filter, which is the sum of the option counts for
 * discrete filters.
 */
export interface FilterWithCounts extends FilterAttribute {
  /** Smallest available value across matching listings (`range` filters). */
  min?: number | null;
  /** Largest available value across matching listings (`range` filters). */
  max?: number | null;
  /** Listings matching the current selection that have a value for this filter. */
  count?: number;
}

/**
 * A globally-scoped facet returned by `GET /filters`.
 *
 * The same logical filter is defined once per category that uses it (for
 * example `fuel_type` appears under SUVs, sedans and hatchbacks), so a global
 * facet is deduplicated by `key` and carries whichever options are declared
 * anywhere. It therefore has no definition `id` or `categoryId`: those belong
 * to a category-scoped definition, not to the global view.
 */
export interface GlobalFilterWithCounts {
  /** Filter slug, e.g. `fuel_type`. */
  key: string;
  /** Human-readable name, e.g. `Fuel Type`. */
  label: string;
  type: FilterAttributeType;
  /** Declared options with counts, or `[]` for `range` filters. */
  options: FilterOption[];
  /** Smallest available value across matching listings (`range` filters). */
  min?: number | null;
  /** Largest available value across matching listings (`range` filters). */
  max?: number | null;
  /** Listings matching the current selection that have a value for this filter. */
  count: number;
}

export interface FilterQuery {
  categoryId: string | null;
  /** Current filter selections, used to compute facet counts. */
  selections?: Record<string, string | string[]>;
}

/**
 * Query for the global facet endpoint.
 *
 * There is no `categoryId`: `GET /filters` aggregates across every category.
 * `selections` reuses the same `key:value` contract as the category-scoped
 * facets, so counts can reflect an active result set.
 */
export interface GlobalFilterQuery {
  selections?: Record<string, string | string[]>;
}
