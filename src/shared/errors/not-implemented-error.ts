import { AppError } from './app-error';

/**
 * Feature is intentionally scaffolded but not yet implemented (later phase).
 * Returning a distinct 501 keeps Phase 0 endpoints honest instead of
 * pretending to succeed.
 */
export class NotImplementedError extends AppError {
  readonly statusCode = 501;
  readonly code = 'NOT_IMPLEMENTED';

  constructor(message = 'Not implemented', options?: { details?: unknown }) {
    super(message, options);
  }
}
