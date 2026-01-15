/**
 * Structured Logging Utility for Product Enrichment Agent
 * 
 * Provides consistent logging format for monitoring and debugging.
 * All logs include timestamp, context, and structured data.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface EnrichmentLogContext {
  productId: string | number;
  handle?: string;
  title?: string;
  step?: string;
  duration?: number;
  outcome?: 'success' | 'failure' | 'skipped';
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: EnrichmentLogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: EnrichmentLogContext,
  error?: Error,
  metadata?: Record<string, any>
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'product-enrichment-agent',
    message,
  };

  if (context) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (metadata) {
    entry.metadata = metadata;
  }

  return entry;
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const prefix = `[${entry.level.toUpperCase()}] [${entry.service}]`;
  const contextStr = entry.context 
    ? ` [product:${entry.context.productId}${entry.context.step ? ` step:${entry.context.step}` : ''}]`
    : '';
  
  return `${prefix}${contextStr} ${entry.message}`;
}

/**
 * Logger class for enrichment operations
 */
class EnrichmentLogger {
  private context?: EnrichmentLogContext;

  /**
   * Set context for subsequent log calls
   */
  setContext(context: EnrichmentLogContext) {
    this.context = context;
    return this;
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context = undefined;
    return this;
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>) {
    const entry = createLogEntry('info', message, this.context, undefined, metadata);
    console.log(formatLogEntry(entry));
    
    // In production, you could send to external logging service here
    // e.g., await sendToLoggingService(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>) {
    const entry = createLogEntry('warn', message, this.context, undefined, metadata);
    console.warn(formatLogEntry(entry));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, metadata?: Record<string, any>) {
    const entry = createLogEntry('error', message, this.context, error, metadata);
    console.error(formatLogEntry(entry));
    if (error?.stack) {
      console.error(error.stack);
    }
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, metadata?: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
      const entry = createLogEntry('debug', message, this.context, undefined, metadata);
      console.log(formatLogEntry(entry));
    }
  }

  /**
   * Log enrichment start
   */
  logEnrichmentStart(productId: string | number, title: string) {
    this.setContext({ productId, title, step: 'start' });
    this.info(`Starting enrichment for "${title}"`, { productId });
  }

  /**
   * Log enrichment step
   */
  logStep(step: string, details?: Record<string, any>) {
    if (this.context) {
      this.context.step = step;
    }
    this.info(`Step: ${step}`, details);
  }

  /**
   * Log enrichment completion
   */
  logEnrichmentComplete(duration: number, imagesAdded: number = 0) {
    if (this.context) {
      this.context.duration = duration;
      this.context.outcome = 'success';
    }
    this.info(`Enrichment completed in ${duration}ms`, { 
      duration, 
      imagesAdded,
      outcome: 'success'
    });
    this.clearContext();
  }

  /**
   * Log enrichment skipped (already processed)
   */
  logEnrichmentSkipped(reason: string) {
    if (this.context) {
      this.context.outcome = 'skipped';
    }
    this.info(`Enrichment skipped: ${reason}`, { outcome: 'skipped' });
    this.clearContext();
  }

  /**
   * Log enrichment failure
   */
  logEnrichmentFailed(error: Error, duration: number) {
    if (this.context) {
      this.context.duration = duration;
      this.context.outcome = 'failure';
    }
    this.error(`Enrichment failed after ${duration}ms`, error, {
      duration,
      outcome: 'failure'
    });
    this.clearContext();
  }
}

// Export singleton instance
export const logger = new EnrichmentLogger();

// Export for creating new instances if needed
export { EnrichmentLogger };
