/**
 * A node in the category hierarchy.
 *
 * Categories are self-referencing (`parent_id`) and may be nested to
 * arbitrary depth. `path` is a materialized ancestry (e.g. `/cars/suv`) used
 * for efficient subtree queries.
 */
export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A category with its direct children attached, used by the tree endpoint. */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

export interface CreateCategoryData {
  parentId?: string | null;
  name: string;
  slug: string;
}

export type UpdateCategoryData = Partial<Omit<CreateCategoryData, 'parentId'>> & {
  parentId?: string | null;
};
