/**
 * Universal Logger Module — V2
 * 
 * Provides structured logging for all services in the application.
 * Inspired by OpenClaw's JSONL session logging pattern.
 * 
 * Features:
 * - Console output with color-coded levels
 * - In-memory ring buffer for dashboard access (no file I/O in serverless)
 * - JSONL format for structured log entries
 * - Pre-configured loggers for common services
 * 
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('service-name');
 *   log.info('Message', { data });
 *   log.warn('Warning', { data });
 *   log.error('Error', error, { data });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// =============================================================================
// IN-MEMORY RING BUFFER — For dashboard and API access
// =============================================================================

const MAX_BUFFER_SIZE = 1000;
const logBuffer: LogEntry[] = [];

/**
 * Add a log entry to the in-memory ring buffer.
 */
function bufferLog(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

/**
 * Get recent log entries from the buffer.
 * Optionally filter by service and/or level.
 */
export function getRecentLogs(options?: {
  service?: string;
  level?: LogLevel;
  limit?: number;
}): LogEntry[] {
  let logs = [...logBuffer];

  if (options?.service) {
    logs = logs.filter((l) => l.service === options.service);
  }
  if (options?.level) {
    logs = logs.filter((l) => l.level === options.level);
  }

  const limit = options?.limit ?? 100;
  return logs.slice(-limit);
}

/**
 * Get all unique service names that have logged.
 */
export function getLoggedServices(): string[] {
  const services = new Set(logBuffer.map((l) => l.service));
  return Array.from(services).sort();
}

/**
 * Get log statistics.
 */
export function getLogStats(): {
  totalEntries: number;
  byLevel: Record<LogLevel, number>;
  byService: Record<string, number>;
} {
  const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  const byService: Record<string, number> = {};

  for (const entry of logBuffer) {
    byLevel[entry.level]++;
    byService[entry.service] = (byService[entry.service] || 0) + 1;
  }

  return { totalEntries: logBuffer.length, byLevel, byService };
}

/**
 * Clear the log buffer (for testing).
 */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatLogEntry(entry: LogEntry): string {
  const levelColors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const color = levelColors[entry.level];

  const prefix = `${color}[${entry.level.toUpperCase()}]${reset} [${entry.service}]`;
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';

  return `${prefix} ${entry.message}${dataStr}`;
}

/**
 * Format a log entry as a JSONL line (for external log shipping).
 */
export function toJsonl(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// =============================================================================
// LOGGER FACTORY
// =============================================================================

/**
 * Create a logger instance for a specific service.
 */
export function createLogger(service: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
    };

    if (data) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Buffer for dashboard access
    bufferLog(entry);

    // Console output
    const formatted = formatLogEntry(entry);

    switch (level) {
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.log(formatted);
        }
        break;
      case 'info':
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        if (error?.stack) {
          console.error(error.stack);
        }
        break;
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown> | unknown) => {
      const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : data ? { value: data } : undefined;
      log('debug', message, safeData);
    },
    info: (message: string, data?: Record<string, unknown> | unknown) => {
      const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : data ? { value: data } : undefined;
      log('info', message, safeData);
    },
    warn: (message: string, data?: Record<string, unknown> | unknown) => {
      const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : data ? { value: data } : undefined;
      log('warn', message, safeData);
    },
    error: (message: string, error?: Error | unknown, data?: Record<string, unknown> | unknown) => {
      const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
      const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : data ? { value: data } : undefined;
      log('error', message, safeData, err);
    },
  };
}

// =============================================================================
// PRE-CONFIGURED LOGGERS
// =============================================================================

export const loggers = {
  enrichment: createLogger('enrichment'),
  blog: createLogger('blog-researcher'),
  taya: createLogger('taya-director'),
  memory: createLogger('agent-memory'),
  shopify: createLogger('shopify'),
  queue: createLogger('queue'),
  api: createLogger('api'),
  ui: createLogger('ui'),
  sync: createLogger('danea-sync'),
  gateway: createLogger('gateway'),
  cron: createLogger('cron-service'),
  skills: createLogger('skills'),
  notifications: createLogger('notifications'),
};

// Default export for quick usage
export default createLogger;
