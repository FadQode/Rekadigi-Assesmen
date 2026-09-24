import type { Static } from 'elysia';
import type { HttpContext } from '../../shared/types/http';
import { filterService, type FilterService } from './filter.service';
import type {
  facetCountsQuerySchema,
  filterCategoryParamsSchema,
  filterQuerySchema,
} from './filter.schema';

type FilterQueryParams = Static<typeof filterQuerySchema>;
type FilterCategoryParams = Static<typeof filterCategoryParamsSchema>;
type FacetCountsQuery = Static<typeof facetCountsQuerySchema>;

/**
 * HTTP adapter for the Filters module.
 *
 * Thin by design: extract validated input, call the service, shape the
 * response. No SQL and no business rules live here.
 */
export class FilterController {
  constructor(private readonly service: FilterService = filterService) {}

  list = async (ctx: HttpContext<unknown, FilterQueryParams, unknown>) => {
    return this.service.list(ctx.query.categoryId ?? null);
  };

  listForCategory = async (ctx: HttpContext<unknown, FacetCountsQuery, FilterCategoryParams>) => {
    return this.service.listForCategory(ctx.params.categoryId, toSelections(ctx.query.filters));
  };
}

/**
 * Decode `key:value` selection pairs into the service's selection map.
 *
 * Repeated keys accumulate into an array, matching the repository's
 * `string | string[]` contract. Malformed pairs are ignored rather than
 * rejected, since a bad selection should not break an otherwise valid request.
 */
function toSelections(filters: FacetCountsQuery['filters']): Record<string, string | string[]> {
  if (filters === undefined) return {};

  const raw = Array.isArray(filters) ? filters : [filters];
  const selections: Record<string, string | string[]> = {};

  for (const entry of raw) {
    const separator = entry.indexOf(':');
    if (separator <= 0 || separator === entry.length - 1) continue;

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key.length === 0 || value.length === 0) continue;

    const existing = selections[key];
    if (existing === undefined) {
      selections[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      selections[key] = [existing, value];
    }
  }

  return selections;
}

export const filterController = new FilterController();
