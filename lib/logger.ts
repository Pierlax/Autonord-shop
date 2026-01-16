/**
 * Universal Logger Module
 * 
 * Provides structured logging for all services in the application.
 * Replaces console.log/warn/error with consistent, contextual logging.
 * 
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('service-name');
 *   log.info('Message', { data });
 *   log.warn('Warning', { data });
 *   log.error('Error', error, { data });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
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

/**
 * Format log entry for console output
 */
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
 * Create a logger instance for a specific service
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
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
      const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
      log('error', message, data, err);
    },
  };
}

// Pre-configured loggers for common services
export const loggers = {
  enrichment: createLogger('enrichment'),
  blog: createLogger('blog-researcher'),
  taya: createLogger('taya-director'),
  memory: createLogger('agent-memory'),
  shopify: createLogger('shopify'),
  queue: createLogger('queue'),
  api: createLogger('api'),
  ui: createLogger('ui'),
};

// Default export for quick usage
export default createLogger;
