import { logger, type LogLevel } from '../shared/logger';

type NodeEnv = 'development' | 'test' | 'production';

function readString(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a finite number`);
  }
  return parsed;
}

function readNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV ?? 'development';
  if (raw !== 'development' && raw !== 'test' && raw !== 'production') {
    throw new Error(`NODE_ENV must be one of development | test | production (received "${raw}")`);
  }
  return raw;
}

function readLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw !== 'debug' && raw !== 'info' && raw !== 'warn' && raw !== 'error') {
    throw new Error(`LOG_LEVEL must be one of debug | info | warn | error (received "${raw}")`);
  }
  return raw;
}

/**
 * Validated, typed view over `process.env`.
 *
 * Configuration is read once at module load so that the process fails fast on
 * a misconfigured deployment rather than midway through a request.
 */
export const env = {
  nodeEnv: readNodeEnv(),
  port: readNumber('PORT', 3000),
  host: readString('HOST', '0.0.0.0'),

  database: {
    url: readString('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/rekadigi'),
    poolMax: readNumber('DATABASE_POOL_MAX', 10),
    idleTimeoutMs: readNumber('DATABASE_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMs: readNumber('DATABASE_CONNECTION_TIMEOUT_MS', 5_000),
  },

  logLevel: readLogLevel(),
} as const;

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

logger.setLevel(env.logLevel);
