/**
 * Bun test preload.
 *
 * Keeps the test environment deterministic and prevents tests from reaching a
 * real database or emitting noisy logs.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/rekadigi_test';
