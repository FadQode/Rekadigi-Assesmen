import { describe, expect, it } from 'bun:test';
import { app } from '../src/app.ts';

interface ApiErrorBody {
  error: { code: string; message: string };
}

describe('error handling', () => {
  it('returns a consistent shape for unknown routes', async () => {
    const response = await app.handle(new Request('http://localhost/definitely-not-a-route'));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('normalizes invalid query parameters into VALIDATION_ERROR', async () => {
    const response = await app.handle(
      new Request('http://localhost/listings?limit=0&categoryId=not-a-uuid'),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('normalizes invalid request bodies into VALIDATION_ERROR', async () => {
    const response = await app.handle(
      new Request('http://localhost/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      }),
    );
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks internal details for unexpected errors', async () => {
    const response = await app.handle(new Request('http://localhost/listings/invalid-id'));
    const body = (await response.json()) as ApiErrorBody;

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain('pg');
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });
});
