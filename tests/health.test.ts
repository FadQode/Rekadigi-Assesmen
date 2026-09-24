import { describe, expect, it } from 'bun:test';
import { app } from '../src/app';

describe('health endpoints', () => {
  it('exposes a liveness probe', async () => {
    const response = await app.handle(new Request('http://localhost/health/live'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('reports database connectivity on the readiness probe', async () => {
    const response = await app.handle(new Request('http://localhost/health'));
    const body = (await response.json()) as {
      status: string;
      checks: { database: string };
    };

    expect([200, 503]).toContain(response.status);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(['up', 'down']).toContain(body.checks.database);
  });
});
