import type { Static } from 'elysia';
import type { HttpContext } from '../../shared/types/http.ts';
import { categoryService, type CategoryService } from './category.service.ts';
import type {
  categoryIdParamsSchema,
  categoryListingsQuerySchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from './category.schema.ts';

type CategoryIdParams = Static<typeof categoryIdParamsSchema>;
type CreateCategoryBody = Static<typeof createCategoryBodySchema>;
type UpdateCategoryBody = Static<typeof updateCategoryBodySchema>;
type CategoryListingsQuery = Static<typeof categoryListingsQuerySchema>;

/**
 * HTTP adapter for the Categories module.
 *
 * Thin by design: extract validated input, call the service, shape the
 * response. No SQL and no business rules live here.
 */
export class CategoryController {
  constructor(private readonly service: CategoryService = categoryService) {}

  list = async () => {
    return this.service.list();
  };

  tree = async () => {
    return this.service.getTree();
  };

  getById = async (ctx: HttpContext<unknown, unknown, CategoryIdParams>) => {
    return this.service.getById(ctx.params.id);
  };

  create = async (ctx: HttpContext<CreateCategoryBody, unknown, unknown>) => {
    ctx.set.status = 201;
    return this.service.create(ctx.body);
  };

  update = async (ctx: HttpContext<UpdateCategoryBody, unknown, CategoryIdParams>) => {
    return this.service.update(ctx.params.id, ctx.body);
  };

  listListings = async (ctx: HttpContext<unknown, CategoryListingsQuery, CategoryIdParams>) => {
    return this.service.listListings(ctx.params.id, {
      includeDescendants: ctx.query.includeDescendants ?? true,
      limit: ctx.query.limit ?? 20,
      cursor: ctx.query.cursor,
    });
  };
}

export const categoryController = new CategoryController();
