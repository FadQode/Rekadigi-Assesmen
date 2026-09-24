import { Elysia } from 'elysia';
import { AppError } from '../shared/errors/app-error';
import { ValidationError } from '../shared/errors/http-errors';
import { InternalServerError } from '../shared/errors/internal-error';
import { logger } from '../shared/logger';
import { isProduction } from '../config/env';
import type { ApiErrorBody } from '../shared/types/api';

/** Elysia may surface non-`Error` values (e.g. custom status responses). */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Convert anything thrown in the request lifecycle into the project's single
 * error response shape:
 *
 * ```
 * { "error": { "code": "...", "message": "..." } }
 * ```
 *
 * Expected `AppError`s keep their status and code. Elysia's own validation
 * failures are normalized to `VALIDATION_ERROR`. Everything else becomes a
 * 500 and is logged with its original cause; in production the client only
 * sees a generic message.
 */
export const errorHandler = new Elysia({ name: 'middleware.error-handler' }).onError(
  { as: 'global' },
  ({ code, error, set }) => {
    const build = (status: number, body: ApiErrorBody): ApiErrorBody => {
      set.status = status;
      return body;
    };

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error(error.message, { code: error.code, error: error.cause ?? error });
      } else {
        logger.warn(error.message, { code: error.code });
      }

      return build(error.statusCode, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }

    const message = describe(error);

    // `VALIDATION` covers schema mismatches; `PARSE` covers a body that could
    // not be parsed at all (malformed JSON). Both are client mistakes and must
    // not be reported as a server fault.
    if (code === 'VALIDATION' || code === 'PARSE') {
      logger.warn('Request validation failed', { code, error: message });
      return build(400, {
        error: { code: new ValidationError().code, message: 'Request validation failed' },
      });
    }

    if (code === 'NOT_FOUND') {
      return build(404, {
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      });
    }

    const internal = new InternalServerError();
    logger.error('Unhandled error', { code, error });
    return build(internal.statusCode, {
      error: {
        code: internal.code,
        message: internal.message,
        ...(!isProduction ? { details: { cause: message } } : {}),
      },
    });
  },
);
