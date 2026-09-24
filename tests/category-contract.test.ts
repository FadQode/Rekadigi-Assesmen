import { describe, expect, it } from 'bun:test';
import { app } from '../src/app.ts';

/**
 * HTTP-boundary regression tests for the category write contract.
 *
 * These assert behavior at the interface, where the unknown-field guard lives,
 * so they need no database: invalid requests are rejected before any query runs.
 */

async function postCategory(body: unknown): Promise<Response> {
  return app.handle(
    new Request('http://localhost/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function patchCategory(id: string, body: unknown): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/categories/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('category write contract', () => {
  it('rejects the removed description field instead of discarding it', async () => {
    const response = await postCategory({ name: 'A', slug: 'a', description: 'ignored' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; details?: { unknown?: string[] } } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.unknown).toContain('description');
  });

  it('rejects the removed position field instead of discarding it', async () => {
    const response = await postCategory({ name: 'A', slug: 'a', position: 3 });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { details?: { unknown?: string[] } } };
    expect(body.error.details?.unknown).toContain('position');
  });

  it('rejects any unknown field on PATCH', async () => {
    const response = await patchCategory('11111111-2222-3333-4444-555555555555', { bogus: 1 });
    expect(response.status).toBe(400);
  });

  it('still validates the declared fields', async () => {
    const response = await postCategory({ name: '', slug: 'INVALID SLUG' });
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await app.handle(
      new Request('http://localhost/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('does not leak internals in the rejection response', async () => {
    const response = await postCategory({ name: 'A', slug: 'a', description: 'x' });
    const text = await response.text();
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('pg-');
    expect(text).not.toContain('node_modules');
  });
});

describe('unrelated endpoints keep tolerant query parsing', () => {
  it('ignores unknown query parameters on GET /listings', async () => {
    const response = await app.handle(
      new Request('http://localhost/listings?limit=1&utm_source=newsletter'),
    );
    expect(response.status).toBe(200);
  });

  it('ignores unknown query parameters on GET /categories/:id/listings', async () => {
    const response = await app.handle(
      new Request('http://localhost/categories?trace=1'),
    );
    expect(response.status).toBe(200);
  });
});
