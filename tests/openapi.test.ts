import { describe, expect, it } from 'bun:test';
import { app } from '../src/app.ts';

describe('OpenAPI documentation', () => {
  it('serves the OpenAPI JSON specification', async () => {
    const response = await app.handle(new Request('http://localhost/docs/json'));
    expect(response.status).toBe(200);

    const spec = (await response.json()) as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(spec.info.title).toBe('Automotive Marketplace API');
  });

  it('documents all required endpoints', async () => {
    const response = await app.handle(new Request('http://localhost/docs/json'));
    const spec = (await response.json()) as { paths: Record<string, Record<string, unknown>> };

    const documented = Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );

    const required = [
      'POST /listings',
      'GET /listings',
      'GET /listings/{id}',
      'PATCH /listings/{id}',
      'DELETE /listings/{id}',
      'GET /listings/search',
      'GET /listings/search/suggest',
      'GET /categories',
      'GET /categories/{id}',
      'GET /categories/{id}/listings',
      'POST /categories',
      'PATCH /categories/{id}',
      'GET /filters',
      'GET /filters/{categoryId}',
    ];

    for (const endpoint of required) {
      expect(documented).toContain(endpoint);
    }
  });
});
