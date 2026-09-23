type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values must never reach the log output. */
const REDACTED_KEYS = new Set([
  'password',
  'pass',
  'secret',
  'token',
  'authorization',
  'database_url',
  'databaseUrl',
  'connectionString',
  'apiKey',
]);

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(item, seen);
  }
  return output;
}

/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line so output remains parseable by log
 * aggregators. Kept dependency-free on purpose: the assessment does not
 * justify a logging framework.
 */
class Logger {
  private threshold: number = LEVEL_PRIORITY.info;

  setLevel(level: LogLevel): void {
    this.threshold = LEVEL_PRIORITY[level];
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < this.threshold) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context: redact(context) } : {}),
    };

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }
}

export const logger = new Logger();
export type { LogLevel };
