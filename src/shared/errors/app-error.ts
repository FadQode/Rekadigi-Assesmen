/**
 * Base class for all expected (operational) application errors.
 *
 * The global error handler maps `statusCode` and `code` directly onto the
 * HTTP response, so subclasses never need to know about HTTP themselves
 * beyond declaring the status they represent.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  /** Optional machine-readable details (never raw SQL or stack traces). */
  readonly details?: unknown;

  /** Distinguishes expected errors from unexpected programmer/runtime errors. */
  readonly isOperational = true;

  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options?.details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }
}
