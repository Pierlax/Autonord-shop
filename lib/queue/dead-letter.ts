/**
 * Dead Letter Queue (DLQ)
 *
 * Stores jobs that have exhausted all retry attempts so they are never
 * silently dropped. Jobs can be inspected, replayed, or discarded manually.
 *
 * Redis schema:
 *   Key:  queue:dead-letter          (list, newest at head via LPUSH)
 *   Item: JSON-serialised DeadLetterEntry
 *
 * Flow:
 *   Worker fails → retryCount >= MAX_RETRIES → moveToDeadLetter()
 *   process-retry-queue cron → peekDeadLetterQueue() → re-queue if retryCount < MAX_RETRIES
 *   On success → removeFromDeadLetter()
 */

import { loggers } from '@/lib/logger';
import { optionalEnv } from '@/lib/env';

const log = loggers.queue;

export const DLQ_KEY = 'queue:dead-letter';
/** Hard limit: entries older than this stay in the DLQ permanently for manual review */
export const MAX_RETRIES = 5;
/** Maximum entries kept in the DLQ (oldest trimmed automatically) */
const DLQ_MAX_SIZE = 500;

// =============================================================================
// TYPES
// =============================================================================

export interface DeadLetterEntry {
  /** Unique job identifier (productId or custom ID) */
  jobId: string;
  /** Original job payload — enough to re-queue without data loss */
  payload: unknown;
  /** Last error message that caused the failure */
  error: string;
  /** Total number of attempts already made */
  retryCount: number;
  /** ISO timestamp of when the job was moved to the DLQ */
  failedAt: string;
}

// =============================================================================
// REDIS TRANSPORT
// =============================================================================

async function redisCommand(command: unknown[]): Promise<unknown> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const data = await resp.json() as { result: unknown };
    return data.result;
  } catch (err) {
    log.error('[DLQ] Redis command failed:', err);
    return null;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Move a failed job into the Dead Letter Queue.
 *
 * Uses LPUSH so the newest failures appear at the head (index 0).
 * The list is capped at DLQ_MAX_SIZE to prevent unbounded growth.
 *
 * @returns true if successfully persisted, false when Redis is unavailable.
 */
export async function moveToDeadLetter(
  jobId: string,
  payload: unknown,
  error: unknown,
  retryCount: number,
): Promise<boolean> {
  const entry: DeadLetterEntry = {
    jobId,
    payload,
    error: error instanceof Error ? error.message : String(error),
    retryCount,
    failedAt: new Date().toISOString(),
  };

  try {
    const result = await redisCommand(['LPUSH', DLQ_KEY, JSON.stringify(entry)]);
    if (result === null) {
      log.warn(`[DLQ] Redis unavailable — job ${jobId} could not be persisted to DLQ`);
      return false;
    }
    // Trim to keep the list bounded (LTRIM keeps indices 0..MAX-1)
    await redisCommand(['LTRIM', DLQ_KEY, '0', String(DLQ_MAX_SIZE - 1)]);
    log.info(`[DLQ] Job ${jobId} moved to dead-letter queue (retries: ${retryCount})`);
    return true;
  } catch (err) {
    log.error(`[DLQ] Failed to move job ${jobId} to DLQ:`, err);
    return false;
  }
}

/**
 * Read up to `limit` entries from the DLQ without removing them.
 *
 * Returns null when Redis is not configured, [] when the queue is empty.
 */
export async function peekDeadLetterQueue(limit = 10): Promise<DeadLetterEntry[] | null> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const raw = await redisCommand(['LRANGE', DLQ_KEY, '0', String(limit - 1)]);
    if (!Array.isArray(raw)) return [];

    return raw
      .map(item => {
        try {
          return JSON.parse(item as string) as DeadLetterEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is DeadLetterEntry => e !== null);
  } catch {
    return null;
  }
}

/**
 * Remove a specific entry from the DLQ by exact JSON match.
 * Call this after a successful re-queue.
 */
export async function removeFromDeadLetter(entry: DeadLetterEntry): Promise<void> {
  await redisCommand(['LREM', DLQ_KEY, '1', JSON.stringify(entry)]);
}

/**
 * Return the current length of the DLQ.
 * Returns null when Redis is unavailable.
 */
export async function deadLetterQueueLength(): Promise<number | null> {
  const result = await redisCommand(['LLEN', DLQ_KEY]);
  if (typeof result === 'number') return result;
  return null;
}
