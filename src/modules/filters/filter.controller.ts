import type { Static } from 'elysia';
import type { HttpContext } from '../../shared/types/http.ts';
import { filterService, type FilterService } from './filter.service.ts';
import type { filterCategoryParamsSchema, filterQuerySchema } from './filter.schema.ts';

type FilterQueryParams = Static<typeof filterQuerySchema>;
type FilterCategoryParams = Static<typeof filterCategoryParamsSchema>;

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

  listForCategory = async (ctx: HttpContext<unknown, unknown, FilterCategoryParams>) => {
    return this.service.listForCategory(ctx.params.categoryId);
  };
}

export const filterController = new FilterController();
