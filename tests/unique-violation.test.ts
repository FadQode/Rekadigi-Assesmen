import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { mapDatabaseError } from '../src/database/pool';
import { ConflictError } from '../src/shared/errors/http-errors';
import { DatabaseError } from '../src/shared/errors/database-error';
import { errorHandler } from '../src/middleware/error-handler';

describe('PostgreSQL unique-constraint error mapping', () => {
  it('maps error code 23505 to ConflictError (409)', () => {
    const mapped = mapDatabaseError({ code: '23505', message: 'duplicate key' });

    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped.statusCode).toBe(409);
    expect(mapped.code).toBe('CONFLICT');
  });

  it('keeps other database errors as DatabaseError (500)', () => {
    const mapped = mapDatabaseError({ code: '42P01', message: 'undefined_table' });

    expect(mapped).toBeInstanceOf(DatabaseError);
    expect(mapped.statusCode).toBe(500);
  });

  it('passes through already-mapped AppErrors unchanged', () => {
    const conflict = new ConflictError('already exists');
    expect(mapDatabaseError(conflict)).toBe(conflict);
  });

  it('renders a ConflictError as HTTP 409, not 500', async () => {
    const app = new Elysia().use(errorHandler).get('/dupe', () => {
      throw mapDatabaseError({ code: '23505', message: 'duplicate key value' });
    });

    const response = await app.handle(new Request('http://localhost/dupe'));
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });
});
