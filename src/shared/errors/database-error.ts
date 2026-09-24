import { AppError } from './app-error';

/**
 * Low-level database failure.
 *
 * Only constructed inside the database/repository layer. The original driver
 * error is preserved as `cause` for logging, but is never exposed to clients.
 */
export class DatabaseError extends AppError {
  readonly statusCode = 500;
  readonly code = 'DATABASE_ERROR';

  constructor(message = 'Database operation failed', options?: { cause?: unknown }) {
    super(message, options);
  }
}
