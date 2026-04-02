/**
 * Batch Optimizer
 *
 * Computes safe concurrency and inter-job delay based on the configured
 * Gemini RPM limit (AI_RPM_LIMIT env var).  Use this when bulk-enqueuing
 * products so we never exceed the rate limit.
 *
 * RPM tiers:
 *   < 100  (free tier)  → 1 concurrent, 30 s delay
 *   100–999 (PAYG low) → 3 concurrent, 5 s delay
 *   ≥ 1000 (PAYG high) → 10 concurrent, 500 ms delay
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

export interface BatchConfig {
  /** Max parallel workers */
  maxConcurrent: number;
  /** Milliseconds between sequential batches */
  delayBetweenMs: number;
  /** Estimated throughput: products per minute */
  productsPerMinute: number;
  /** Estimated time for N products */
  estimateMinutes: (count: number) => number;
}

/** Average Gemini calls per product (conservative estimate). */
const CALLS_PER_PRODUCT = 6;

/**
 * Return a BatchConfig tuned to the given RPM cap.
 * Defaults to 15 RPM when AI_RPM_LIMIT is not set.
 */
export function getBatchConfig(rpmOverride?: number): BatchConfig {
  const rpm = rpmOverride ?? parseInt(process.env.AI_RPM_LIMIT ?? '15', 10);

  if (rpm >= 1000) {
    const ppm = Math.floor(rpm / CALLS_PER_PRODUCT);
    return {
      maxConcurrent: 10,
      delayBetweenMs: 500,
      productsPerMinute: ppm,
      estimateMinutes: (n) => Math.ceil(n / ppm),
    };
  }

  if (rpm >= 100) {
    const ppm = Math.floor(rpm / CALLS_PER_PRODUCT);
    return {
      maxConcurrent: 3,
      delayBetweenMs: 5_000,
      productsPerMinute: ppm,
      estimateMinutes: (n) => Math.ceil(n / ppm),
    };
  }

  // Free tier (< 100 RPM)
  const ppm = Math.max(1, Math.floor(rpm / CALLS_PER_PRODUCT));
  return {
    maxConcurrent: 1,
    delayBetweenMs: Math.ceil((60_000 * CALLS_PER_PRODUCT) / rpm),
    productsPerMinute: ppm,
    estimateMinutes: (n) => Math.ceil(n / ppm),
  };
}

/**
 * Process an array of items in rate-limited batches.
 *
 * @param items      — items to process
 * @param processor  — async function called for each item; errors are caught and counted
 * @param rpmOverride — optional override for RPM (reads AI_RPM_LIMIT by default)
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  rpmOverride?: number,
): Promise<{ processed: number; failed: number }> {
  const cfg = getBatchConfig(rpmOverride);
  const total = items.length;
  let processed = 0;
  let failed = 0;

  log.info(`[BatchOptimizer] Processing ${total} items — ${cfg.maxConcurrent} concurrent, ${cfg.delayBetweenMs}ms delay (~${cfg.estimateMinutes(total)} min)`);

  for (let i = 0; i < total; i += cfg.maxConcurrent) {
    const batch = items.slice(i, i + cfg.maxConcurrent);

    await Promise.all(
      batch.map((item, batchIdx) =>
        processor(item, i + batchIdx)
          .then(() => { processed++; })
          .catch(err => {
            failed++;
            log.error(`[BatchOptimizer] Item ${i + batchIdx} failed:`, err);
          }),
      ),
    );

    // Delay before next batch (skip after last batch)
    if (i + cfg.maxConcurrent < total) {
      await new Promise(resolve => setTimeout(resolve, cfg.delayBetweenMs));
    }
  }

  log.info(`[BatchOptimizer] Done — ${processed} processed, ${failed} failed`);
  return { processed, failed };
}
