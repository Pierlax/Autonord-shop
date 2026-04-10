/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping calls to a failing dependency.
 *
 * States:
 *   CLOSED    — normal operation; failures are counted
 *   OPEN      — dependency is down; calls fail immediately (no I/O)
 *   HALF_OPEN — cooldown expired; one probe call is allowed through
 *
 * Usage:
 *   const cb = new CircuitBreaker('redis', { threshold: 3, resetMs: 60_000 });
 *   const result = await cb.execute(() => redis.get(key));
 *   // or with fallback:
 *   const result = await cb.execute(() => redis.get(key), () => localCache.get(key));
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit (default: 3) */
  threshold?: number;
  /** Milliseconds before moving from OPEN to HALF_OPEN to retry (default: 60_000) */
  resetMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureAt = 0;

  private readonly threshold: number;
  private readonly resetMs: number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.threshold = options.threshold ?? 3;
    this.resetMs = options.resetMs ?? 60_000;
  }

  /**
   * Execute `fn`. If the circuit is OPEN and the cooldown has not expired,
   * throws immediately (or calls `fallback` if provided).
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureAt < this.resetMs) {
        if (fallback) return fallback();
        throw new Error(`[CircuitBreaker:${this.name}] Circuit OPEN — skipping call`);
      }
      // Cooldown expired — allow one probe
      this.state = 'HALF_OPEN';
      log.info(`[CircuitBreaker:${this.name}] HALF_OPEN — probing`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state !== 'CLOSED') {
      log.info(`[CircuitBreaker:${this.name}] Recovered → CLOSED`);
    }
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.threshold && this.state !== 'OPEN') {
      this.state = 'OPEN';
      log.info(`[CircuitBreaker:${this.name}] OPEN after ${this.failures} failures (reset in ${this.resetMs}ms)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}
