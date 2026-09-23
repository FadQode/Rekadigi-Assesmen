import { AppError } from './app-error.ts';

/** Unexpected non-operational failure. The cause is logged, never returned. */
export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL_SERVER_ERROR';

  constructor(message = 'Internal server error', options?: { cause?: unknown }) {
    super(message, options);
  }
}
