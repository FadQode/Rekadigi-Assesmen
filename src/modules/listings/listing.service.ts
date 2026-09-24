import { NotFoundError, ValidationError } from '../../shared/errors/http-errors';
import { categoryRepository, type CategoryRepository } from '../categories/category.repository';
import { filterRepository, type FilterRepository } from '../filters/filter.repository';
import type { FilterAttribute } from '../filters/filter.types';
import { listingRepository, type ListingRepository } from './listing.repository';
import type {
  CreateListingData,
  Listing,
  ListingAttributes,
  ListingAttributeIssue,
  ListingSearchFilters,
  ListingSearchResult,
  ListingSuggestion,
  UpdateListingData,
} from './listing.types';

/**
 * Application/business logic for listings.
 *
 * Framework-independent by design: no Elysia, no request/response objects.
 * Rules that depend on database state — category existence and dynamic
 * attribute validation — live here rather than in the HTTP schema or SQL.
 *
 * Collaborators are the Categories and Filters *repositories*, matching the
 * pattern already used by `FilterService`. Importing `CategoryService` here
 * would create an import cycle: `CategoryService` already depends on
 * `ListingService` to serve category-scoped listings.
 */
export class ListingService {
  constructor(
    private readonly repository: ListingRepository = listingRepository,
    private readonly categories: CategoryRepository = categoryRepository,
    private readonly filters: FilterRepository = filterRepository,
  ) {}

  async getById(id: string): Promise<Listing> {
    const listing = await this.repository.findById(id);
    if (listing === null) {
      throw new NotFoundError('Listing not found', { details: { code: 'LISTING_NOT_FOUND' } });
    }
    return listing;
  }

  /**
   * Create a listing.
   *
   * Category existence and dynamic attributes are validated before the insert,
   * but the database constraints (FK, CHECK) remain the final source of truth:
   * the pre-checks produce precise errors, they do not replace the constraints.
   */
  async create(data: CreateListingData): Promise<Listing> {
    await this.assertCategoryExists(data.categoryId);

    const attributes = await this.resolveAttributes(data.categoryId, data.attributes);

    return this.repository.create({ ...data, attributes });
  }

  /**
   * Update a listing.
   *
   * `attributes` is a complete replacement of the JSONB object (the repository
   * writes it wholesale), so the submitted set is validated as the full new
   * attribute map and `{}` clears it.
   *
   * When only the category changes, the stored attributes are re-validated
   * against the new category instead of silently keeping attributes that the
   * new category does not declare.
   */
  async update(id: string, data: UpdateListingData): Promise<Listing> {
    const existing = await this.repository.findById(id);
    if (existing === null) {
      throw new NotFoundError('Listing not found', { details: { code: 'LISTING_NOT_FOUND' } });
    }

    const nextCategoryId = data.categoryId ?? existing.categoryId;
    const categoryChanged = nextCategoryId !== existing.categoryId;

    if (categoryChanged) {
      await this.assertCategoryExists(nextCategoryId);
    }

    let attributes: ListingAttributes | undefined;
    if (data.attributes !== undefined) {
      attributes = await this.resolveAttributes(nextCategoryId, data.attributes);
    } else if (categoryChanged) {
      attributes = await this.resolveAttributes(nextCategoryId, existing.attributes);
    }

    const updated = await this.repository.update(id, { ...data, attributes });
    if (updated === null) {
      // The row disappeared between the read and the write.
      throw new NotFoundError('Listing not found', { details: { code: 'LISTING_NOT_FOUND' } });
    }
    return updated;
  }

  /**
   * Soft delete: delegates to the repository, which sets `status = 'removed'`
   * and stamps `deleted_at`. The row is never physically removed.
   */
  async remove(id: string): Promise<void> {
    const deleted = await this.repository.softDelete(id);
    if (!deleted) {
      throw new NotFoundError('Listing not found', { details: { code: 'LISTING_NOT_FOUND' } });
    }
  }

  /**
   * Search and browse.
   *
   * The one code path serves both plain browsing (no `text`) and full-text /
   * faceted search (with `text`); the repository decides whether to add the
   * `search_vector` predicate, so they differ only by the filters supplied.
   *
   * Keyset pagination over `(created_at DESC, id DESC)` — including encoding
   * the opaque cursor from the exact timestamp of the last returned row — is a
   * repository concern. The service only normalizes the response envelope and
   * must not re-encode the cursor.
   */
  async search(filters: ListingSearchFilters): Promise<ListingSearchResult> {
    const resolved = await this.resolveCategoryScope(filters);
    const result = await this.repository.search(resolved);
    return {
      data: result.data,
      pagination: result.pagination,
      ...(result.total !== undefined ? { total: result.total } : {}),
    };
  }

  /**
   * Expand a single `categoryId` with `includeDescendants` into the explicit
   * id set the repository filters on.
   *
   * Subtree resolution is a data concern owned by `CategoryRepository`, so the
   * controller never performs it and no category SQL is duplicated here. An
   * explicit `categoryIds` set always wins, and the flag is a no-op without a
   * `categoryId`.
   */
  private async resolveCategoryScope(
    filters: ListingSearchFilters,
  ): Promise<ListingSearchFilters> {
    if (
      filters.includeDescendants !== true ||
      filters.categoryIds !== undefined ||
      filters.categoryId === undefined ||
      filters.categoryId.length === 0
    ) {
      return filters;
    }

    const categoryIds = await this.categories.findDescendantIds(filters.categoryId);
    return { ...filters, categoryIds };
  }

  async suggest(prefix: string, limit: number): Promise<ListingSuggestion[]> {
    return this.repository.suggest(prefix, limit);
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categories.findById(categoryId);
    if (category === null) {
      throw new NotFoundError('Category not found', { details: { code: 'CATEGORY_NOT_FOUND' } });
    }
  }

  /**
   * Validate and normalize submitted dynamic attributes against the filter
   * definitions declared for the category.
   *
   * Validation is strict in both directions:
   * - a submitted key that is not a declared filter attribute is rejected, so
   *   unfilterable data never reaches the JSONB column;
   * - a declared `enum` value must match one of the option values.
   *
   * Values are normalized before storage so the JSONB column is consistent
   * with the repository's filter predicates:
   * - `enum`    → the canonical option value (case-insensitively matched);
   * - `range`   → a number;
   * - `boolean` → a boolean.
   *
   * Enum option values are stored lowercase (`awd`) while clients commonly send
   * display case (`AWD`), so matching is case-insensitive and the canonical
   * value is persisted.
   *
   * When the category declares no attributes at all, any supplied attribute is
   * rejected rather than silently accepted, keeping the three-table model
   * meaningful.
   */
  private async resolveAttributes(
    categoryId: string,
    attributes: ListingAttributes | undefined,
  ): Promise<ListingAttributes | undefined> {
    if (attributes === undefined) return undefined;

    const submittedKeys = Object.keys(attributes).filter((key) => attributes[key] !== undefined);
    if (submittedKeys.length === 0) {
      // An explicit empty object clears the attributes.
      return {};
    }

    const definitions = await this.filters.findByCategoryId(categoryId);
    const byKey = new Map<string, FilterAttribute>(definitions.map((def) => [def.key, def]));

    const issues: ListingAttributeIssue[] = [];
    const normalized: ListingAttributes = {};

    for (const key of submittedKeys) {
      const value = attributes[key];
      const definition = byKey.get(key);

      if (definition === undefined) {
        issues.push({
          key,
          reason: 'unknown_attribute',
          message: 'Attribute is not defined for this category',
        });
        continue;
      }

      switch (definition.type) {
        case 'enum': {
          const matched = matchEnumOption(definition, value);
          if (matched === null) {
            issues.push({
              key,
              reason: 'invalid_enum',
              message: 'Value is not one of the allowed options',
              allowedValues: definition.options.map((option) => option.value),
            });
            continue;
          }
          normalized[key] = matched;
          break;
        }

        case 'range': {
          const numeric = toFiniteNumber(value);
          if (numeric === null) {
            issues.push({
              key,
              reason: 'invalid_range',
              message: 'Value must be a finite number',
            });
            continue;
          }
          normalized[key] = numeric;
          break;
        }

        case 'boolean': {
          const bool = toBoolean(value);
          if (bool === null) {
            issues.push({
              key,
              reason: 'invalid_boolean',
              message: 'Value must be a boolean',
            });
            continue;
          }
          normalized[key] = bool;
          break;
        }

        default: {
          issues.push({
            key,
            reason: 'invalid_value',
            message: `Unsupported filter type "${String((definition as { type: unknown }).type)}"`,
          });
        }
      }
    }

    if (issues.length > 0) {
      throw new ValidationError('Invalid listing attributes', {
        details: {
          code: 'INVALID_LISTING_ATTRIBUTES',
          issues,
          allowedAttributes: definitions.map((def) => def.key),
        },
      });
    }

    return normalized;
  }
}

/** Match a value against an enum definition, returning the canonical option value. */
function matchEnumOption(definition: FilterAttribute, value: unknown): string | null {
  if (typeof value === 'string') {
    const candidate = value.trim().toLowerCase();
    const option = definition.options.find((entry) => entry.value.toLowerCase() === candidate);
    return option?.value ?? null;
  }

  // Booleans have no string form that could satisfy an enum.
  if (typeof value === 'number' && Number.isFinite(value)) {
    const candidate = String(value).toLowerCase();
    const option = definition.options.find((entry) => entry.value.toLowerCase() === candidate);
    return option?.value ?? null;
  }

  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

export const listingService = new ListingService();
