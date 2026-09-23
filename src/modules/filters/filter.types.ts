/**
 * Supported filter value kinds.
 *
 * - `enum`     : fixed set of options (fuel type, transmission, ...)
 * - `range`    : numeric/date bounds (price, year, mileage)
 * - `boolean`  : yes/no flags (accident-free, warranty, ...)
 */
export type FilterAttributeType = 'enum' | 'range' | 'boolean';

/** A single selectable option for an `enum` filter. */
export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * A filter definition, optionally scoped to one category.
 *
 * Filter metadata drives both the query builder and the API documentation so
 * request validation and filtering stay aligned.
 */
export interface FilterAttribute {
  id: string;
  key: string;
  label: string;
  type: FilterAttributeType;
  categoryId: string | null;
  /** JSONB path used for dynamic attributes (e.g. `attributes.color`). */
  attributePath: string | null;
  options: FilterOption[];
  unit: string | null;
  min: number | null;
  max: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Filter definition enriched with facet counts for a result set. */
export interface FilterWithCounts extends FilterAttribute {
  options: FilterOption[];
}

export interface FilterQuery {
  categoryId: string | null;
  /** Current filter selections, used to compute facet counts. */
  selections?: Record<string, string | string[]>;
}
