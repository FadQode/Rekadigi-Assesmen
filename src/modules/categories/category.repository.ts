import { pool, type Queryable } from '../../database/pool.ts';
import { NotImplementedError } from '../../shared/errors/not-implemented-error.ts';
import type {
  Category,
  CategoryTreeNode,
  CreateCategoryData,
  UpdateCategoryData,
} from './category.types.ts';

/**
 * Persistence boundary for the Categories module.
 *
 * Hierarchical traversal will use recursive CTEs in Phase 1; the contract is
 * kept framework-free so it can be substituted in tests.
 */
export interface CategoryRepository {
  findAll(): Promise<Category[]>;

  findTree(): Promise<CategoryTreeNode[]>;

  findById(id: string): Promise<Category | null>;

  findBySlug(slug: string): Promise<Category | null>;

  /** Ids of the category and every descendant, used for subtree filtering. */
  findDescendantIds(id: string): Promise<string[]>;

  create(data: CreateCategoryData): Promise<Category>;

  update(id: string, data: UpdateCategoryData): Promise<Category | null>;
}

/**
 * PostgreSQL implementation of `CategoryRepository`.
 *
 * Phase 0 establishes the boundary; SQL lands in Phase 1 together with the
 * recursive category queries and their indexes.
 */
export class PostgresCategoryRepository implements CategoryRepository {
  constructor(protected readonly db: Queryable = pool) {}

  async findAll(): Promise<Category[]> {
    throw new NotImplementedError('CategoryRepository.findAll is implemented in Phase 1');
  }

  async findTree(): Promise<CategoryTreeNode[]> {
    throw new NotImplementedError('CategoryRepository.findTree is implemented in Phase 1');
  }

  async findById(_id: string): Promise<Category | null> {
    throw new NotImplementedError('CategoryRepository.findById is implemented in Phase 1');
  }

  async findBySlug(_slug: string): Promise<Category | null> {
    throw new NotImplementedError('CategoryRepository.findBySlug is implemented in Phase 1');
  }

  async findDescendantIds(_id: string): Promise<string[]> {
    throw new NotImplementedError('CategoryRepository.findDescendantIds is implemented in Phase 1');
  }

  async create(_data: CreateCategoryData): Promise<Category> {
    throw new NotImplementedError('CategoryRepository.create is implemented in Phase 1');
  }

  async update(_id: string, _data: UpdateCategoryData): Promise<Category | null> {
    throw new NotImplementedError('CategoryRepository.update is implemented in Phase 1');
  }
}

export const categoryRepository: CategoryRepository = new PostgresCategoryRepository();
