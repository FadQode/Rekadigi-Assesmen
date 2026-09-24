import { AppError } from './app-error';

/** Request payload or query parameters failed validation. */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Request validation failed', options?: { details?: unknown }) {
    super(message, options);
  }
}

/** Requested resource does not exist. */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(message = 'Resource not found', options?: { details?: unknown }) {
    super(message, options);
  }
}

/** Request conflicts with the current state of the resource. */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message = 'Resource conflict', options?: { details?: unknown }) {
    super(message, options);
  }
}
