/**
 * Circuit Breaker — queue package re-export
 *
 * The canonical implementation lives in lib/circuit-breaker.ts.
 * This file re-exports it so queue-layer code can import consistently
 * from '@/lib/queue/circuit-breaker' without duplication.
 *
 * Usage:
 *   import { CircuitBreaker } from '@/lib/queue/circuit-breaker';
 *   const cb = new CircuitBreaker('redis', { threshold: 3, resetMs: 60_000 });
 *   const value = await cb.execute(() => redisGet(key), () => fallback());
 */

export { CircuitBreaker } from '@/lib/circuit-breaker';
export type { CircuitBreakerOptions } from '@/lib/circuit-breaker';
