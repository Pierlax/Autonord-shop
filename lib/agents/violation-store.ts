/**
 * Violation Store — Redis persistence for the D20 TAYA Police feedback loop.
 *
 * Persists ViolationFrequency[] across serverless cold starts so the D20
 * learning loop is effective in Vercel / QStash environments where the
 * in-process violationAccumulator resets on every cold start.
 *
 * Redis schema (30-day sliding TTL — refreshed on every saveViolations call):
 *   taya:violations:v1  → String  JSON<ViolationFrequency[]>
 *
 * Usage (route.ts):
 *   // At request start — BEFORE running TAYA Police on any product
 *   const stored = await loadViolations();
 *   if (stored.length > 0) loadViolationStats(stored);
 *
 *   // At request end — AFTER TAYA Police ran on all products in the invocation
 *   await saveViolations(getViolationStats());
 *
 * Concurrency note:
 *   Two concurrent QStash workers can overwrite each other's save (last-write-wins).
 *   This is acceptable — the count drift is small and self-corrects on the next
 *   invocation.  A Redis INCR-per-phrase approach would be more precise but
 *   requires N commands per phrase.
 *
 * Falls back to a silent no-op when Redis env vars are absent (dev / test).
 */

import type { ViolationFrequency } from '@/lib/agents/taya-police';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY = 'taya:violations:v1';

/** 30-day sliding TTL — same as the KG keys in kg-store.ts. */
const TTL_SECONDS = 30 * 24 * 60 * 60; // 2 592 000 s

// ---------------------------------------------------------------------------
// Internal Redis helpers
// ---------------------------------------------------------------------------

function getRedisConfig(): { baseUrl: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return null;
  return { baseUrl: url.replace(/\/$/, ''), token: tok };
}

async function redisCommand(
  baseUrl: string,
  token: string,
  command: (string | number)[],
): Promise<unknown> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`[ViolationStore] Redis HTTP ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { result: unknown };
  return json.result;
}

async function redisPipeline(
  baseUrl: string,
  token: string,
  commands: (string | number)[][],
): Promise<unknown[]> {
  const res = await fetch(`${baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`[ViolationStore] Redis pipeline HTTP ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { result: unknown }[];
  return json.map(r => r.result);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load persisted violation stats from Redis.
 *
 * Returns an empty array when:
 *  - Redis is not configured (dev / test mode)
 *  - The key does not exist (first run, or TTL expired)
 *  - The stored JSON is malformed
 *
 * Never throws — all errors are swallowed and logged as warnings.
 */
export async function loadViolations(): Promise<ViolationFrequency[]> {
  const cfg = getRedisConfig();
  if (!cfg) return [];

  try {
    const raw = (await redisCommand(cfg.baseUrl, cfg.token, ['GET', KEY])) as string | null;
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      log.warn('[ViolationStore] Stored data is not an array — discarding');
      return [];
    }

    return parsed as ViolationFrequency[];
  } catch (err) {
    log.warn('[ViolationStore] loadViolations failed (non-fatal):', err);
    return [];
  }
}

/**
 * Persist violation stats to Redis with a 30-day sliding TTL.
 *
 * Overwrites the previous snapshot — subsequent calls within the same
 * invocation (e.g., after each product in a batch) are safe because
 * each call writes the full accumulated state, not a diff.
 *
 * No-op when the stats array is empty (nothing to learn yet) or when
 * Redis is not configured.
 *
 * Never throws — errors are swallowed and logged as warnings.
 */
export async function saveViolations(stats: ViolationFrequency[]): Promise<void> {
  if (stats.length === 0) return;

  const cfg = getRedisConfig();
  if (!cfg) return;

  try {
    await redisPipeline(cfg.baseUrl, cfg.token, [
      ['SET', KEY, JSON.stringify(stats)],
      ['EXPIRE', KEY, TTL_SECONDS],
    ]);
    log.info(`[ViolationStore] Saved ${stats.length} violation entries (TTL refreshed: 30 days)`);
  } catch (err) {
    log.warn('[ViolationStore] saveViolations failed (non-fatal):', err);
  }
}
