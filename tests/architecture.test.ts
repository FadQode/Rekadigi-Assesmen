import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    }),
  );
  return files.flat();
}

const SQL_PATTERN = /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|FROM\s+\w+)\b/i;

/**
 * Guards the mandatory dependency direction described in the architecture
 * document. These assertions fail the build if a future change moves SQL or
 * HTTP concerns into the wrong layer.
 */
describe('layer boundaries', () => {
  it('keeps SQL out of controllers and routes', async () => {
    const files = (await collectFiles(SRC)).filter(
      (file) => file.endsWith('.controller.ts') || file.endsWith('.routes.ts'),
    );

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(SQL_PATTERN.test(source)).toBe(false);
    }
  });

  it('keeps Elysia and HTTP out of services and repositories', async () => {
    const files = (await collectFiles(SRC)).filter(
      (file) => file.endsWith('.service.ts') || file.endsWith('.repository.ts'),
    );

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source).not.toContain("from 'elysia'");
      expect(source).not.toMatch(/Request|Response/);
    }
  });

  it('does not import pg inside controllers', async () => {
    const files = (await collectFiles(SRC)).filter((file) => file.endsWith('.controller.ts'));

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source).not.toContain("from 'pg'");
    }
  });
});
