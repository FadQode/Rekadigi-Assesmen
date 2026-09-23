/**
 * Shape returned by every error response.
 *
 * ```
 * {
 *   "error": {
 *     "code": "LISTING_NOT_FOUND",
 *     "message": "Listing not found"
 *   }
 * }
 * ```
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export type SortDirection = 'asc' | 'desc';
