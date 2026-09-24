import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './pool';

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');

async function ensureSchemaMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id UUID PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

async function main(): Promise<void> {
  await ensureSchemaMigrationsTable();

  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations();

  let appliedCount = 0;
  let skippedCount = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`skip    ${filename}`);
      skippedCount += 1;
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id, filename) VALUES ($1, $2)', [
        randomUUID(),
        filename,
      ]);
      await client.query('COMMIT');
      console.log(`apply   ${filename}`);
      appliedCount += 1;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original error is more useful than a rollback failure.
      }
      console.error(`FAILED  ${filename}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`Migrations complete: ${appliedCount} applied, ${skippedCount} skipped, ${files.length} total`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
