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

  /**
   * The documented surface is exactly the required set plus the health probe and
   * the `/categories/tree` traversal endpoint. An accidental route should fail
   * this test rather than silently widening the API.
   */
  it('documents exactly the intended operation count', async () => {
    const response = await app.handle(new Request('http://localhost/docs/json'));
    const spec = (await response.json()) as { paths: Record<string, Record<string, unknown>> };

    const documented = Object.entries(spec.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods)
          .filter((method) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
          .map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    const expected = [
      'DELETE /listings/{id}',
      'GET /categories',
      'GET /categories/tree',
      'GET /categories/{id}',
      'GET /categories/{id}/listings',
      'GET /filters',
      'GET /filters/{categoryId}',
      'GET /health',
      'GET /listings',
      'GET /listings/search',
      'GET /listings/search/suggest',
      'GET /listings/{id}',
      'PATCH /categories/{id}',
      'PATCH /listings/{id}',
      'POST /categories',
      'POST /listings',
    ].sort();

    expect(documented).toEqual(expected);
    expect(documented).toHaveLength(16);
  });

  it('documents suggestions as make/model only', async () => {
    const response = await app.handle(new Request('http://localhost/docs/json'));
    const spec = (await response.json()) as {
      paths: Record<string, { get?: { summary?: string; description?: string } }>;
    };

    const operation = spec.paths['/listings/search/suggest']?.get;
    expect(operation).toBeDefined();
    expect(operation?.summary).toBe('Typeahead suggestions for make and model');
    expect(operation?.summary?.toLowerCase()).not.toContain('title');
    expect(operation?.description?.toLowerCase()).toContain('title suggestions are not supported');
  });

  /**
   * The category writes carry a custom `transform` guard. It must not erase the
   * documented request body, and the schema must expose only persisted fields.
   */
  it('documents the category write body without description or position', async () => {
    const response = await app.handle(new Request('http://localhost/docs/json'));
    const spec = (await response.json()) as {
      paths: Record<
        string,
        Record<
          string,
          { requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> } }
        >
      >;
    };

    for (const [path, method] of [
      ['/categories', 'post'],
      ['/categories/{id}', 'patch'],
    ] as const) {
      const schema = spec.paths[path]?.[method]?.requestBody?.content?.['application/json']?.schema;
      expect(schema).toBeDefined();
      const properties = Object.keys(schema?.properties ?? {});
      expect(properties.length).toBeGreaterThan(0);
      expect(properties).not.toContain('description');
      expect(properties).not.toContain('position');
      expect(properties).toContain('name');
      expect(properties).toContain('slug');
    }
  });
});
