/**
 * Distributed Job Lock
 *
 * Prevents duplicate processing when multiple cron jobs or QStash retries
 * attempt to enrich the same product concurrently.
 *
 * Uses Upstash Redis SET NX PX — atomic "set if not exists with TTL".
 * If the key already exists the command returns null, meaning another worker
 * holds the lock.  The TTL guarantees the lock is released even if the worker
 * crashes before it can clean up.
 *
 * Redis key schema:  lock:enrich:{productId}
 * Default TTL:       300 000 ms (5 minutes) — matches Vercel's maxDuration
 *
 * Usage:
 *   import { acquireJobLock, releaseJobLock } from '@/lib/queue/lock';
 *
 *   const locked = await acquireJobLock(productId);
 *   if (!locked) return NextResponse.json({ status: 'skipped', reason: 'already_processing' });
 *   try {
 *     // ... do work ...
 *   } finally {
 *     await releaseJobLock(productId);  // optional but courteous
 *   }
 */

import { loggers } from '@/lib/logger';
import { optionalEnv } from '@/lib/env';

const log = loggers.queue;

const LOCK_KEY_PREFIX = 'lock:enrich:';
const DEFAULT_TTL_MS = 300_000; // 5 minutes

// =============================================================================
// REDIS TRANSPORT (minimal — no shared client to keep this module self-contained)
// =============================================================================

async function redisSet(
  key: string,
  value: string,
  options: { nx: boolean; pxMs: number },
): Promise<string | null> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Upstash REST API: ["SET", key, value, "NX", "PX", ttlMs]
  const command: unknown[] = ['SET', key, value];
  if (options.nx) command.push('NX');
  command.push('PX', options.pxMs);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const data = await resp.json() as { result: string | null };
    return data.result;
  } catch (err) {
    log.error(`[Lock] Redis SET failed for key ${key}:`, err);
    return null;
  }
}

async function redisDel(key: string): Promise<void> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['DEL', key]),
    });
  } catch (err) {
    log.error(`[Lock] Redis DEL failed for key ${key}:`, err);
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Attempt to acquire an exclusive lock for a product enrichment job.
 *
 * @param productId - The Shopify product ID (numeric string or GID).
 * @param ttlMs     - Lock TTL in milliseconds (default: 300 000 = 5 min).
 *
 * @returns `true`  — lock acquired, safe to proceed.
 *          `false` — lock already held by another worker; skip this job.
 *
 * When Redis is not configured (no UPSTASH_REDIS_REST_URL), returns `true`
 * so the pipeline is never blocked in development or Redis-less environments.
 */
export async function acquireJobLock(
  productId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  if (!url) {
    // Redis not configured — allow processing (no distributed lock available)
    return true;
  }

  const key = `${LOCK_KEY_PREFIX}${productId}`;
  const result = await redisSet(key, '1', { nx: true, pxMs: ttlMs });

  if (result === 'OK') {
    log.info(`[Lock] Acquired lock for product ${productId} (ttl: ${ttlMs}ms)`);
    return true;
  }

  log.info(`[Lock] Product ${productId} already locked — skipping`);
  return false;
}

/**
 * Explicitly release the lock before the TTL expires.
 *
 * Optional but recommended: calling this at the end of a successful run
 * allows the next job to start immediately rather than waiting for TTL expiry.
 */
export async function releaseJobLock(productId: string): Promise<void> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  if (!url) return;

  const key = `${LOCK_KEY_PREFIX}${productId}`;
  await redisDel(key);
  log.info(`[Lock] Released lock for product ${productId}`);
}
