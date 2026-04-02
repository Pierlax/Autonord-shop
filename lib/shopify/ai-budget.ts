/**
 * AI Budget & Metrics Persistence
 *
 * - Persists per-call token usage to Upstash Redis (fire-and-forget via waitUntil)
 * - Exposes AIBudgetManager class with trackUsage() for per-model cost tracking
 * - Exposes checkBudget() for on-demand cost reporting (used by admin metrics)
 *
 * Redis schema:
 *   Key:    ai:metrics:YYYY-MM-DD   (hash, TTL 7 days)
 *   Fields: requests | tokensIn | tokensOut | costUSD
 *
 * Pricing (Gemini 2.5 Flash):
 *   Input : $0.15 / 1M tokens
 *   Output: $0.60 / 1M tokens
 */

import { waitUntil } from '@vercel/functions';
import { loggers } from '@/lib/logger';
import { optionalEnv } from '@/lib/env';

const log = loggers.shopify;

// Pricing per model (USD per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':             { input: 0.15, output: 0.60 },
  'gemini-2.5-flash-preview':     { input: 0.15, output: 0.60 },
  'gemini-2.0-flash':             { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite':        { input: 0.075, output: 0.30 },
};

const DEFAULT_PRICING = { input: 0.15, output: 0.60 };

const METRICS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// =============================================================================
// REDIS HELPERS
// =============================================================================

function getRedisCredentials(): { url: string; token: string } | null {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redisCommand(command: unknown[]): Promise<unknown> {
  const creds = getRedisCredentials();
  if (!creds) return null;
  try {
    const resp = await fetch(creds.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const data = await resp.json() as { result: unknown };
    return data.result;
  } catch {
    return null;
  }
}

function todayKey(): string {
  return `ai:metrics:${new Date().toISOString().slice(0, 10)}`;
}

/** All day-keys for the current UTC month up to today. */
function monthKeys(): string[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const days = now.getUTCDate();
  const keys: string[] = [];
  for (let d = 1; d <= days; d++) {
    keys.push(`ai:metrics:${year}-${month}-${String(d).padStart(2, '0')}`);
  }
  return keys;
}

function estimateCostUSD(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (tokensIn / 1_000_000) * pricing.input
       + (tokensOut / 1_000_000) * pricing.output;
}

// =============================================================================
// AI BUDGET MANAGER
// =============================================================================

/**
 * AIBudgetManager — per-model cost tracking backed by Redis.
 *
 * Usage:
 *   import { budgetManager } from '@/lib/shopify/ai-budget';
 *   budgetManager.trackUsage('gemini-2.5-flash', promptTokens, completionTokens);
 */
export class AIBudgetManager {
  /**
   * Record a single AI call's token usage to Redis (fire-and-forget).
   *
   * @param model     - Model ID string (e.g. 'gemini-2.5-flash')
   * @param tokensIn  - Input / prompt tokens
   * @param tokensOut - Output / completion tokens
   */
  trackUsage(model: string, tokensIn: number, tokensOut: number): void {
    const creds = getRedisCredentials();
    if (!creds) return; // Redis not configured — skip silently

    const key = todayKey();
    const costUSD = estimateCostUSD(model, tokensIn, tokensOut);

    waitUntil(
      Promise.all([
        redisCommand(['HINCRBY',    key, 'requests',  '1']),
        redisCommand(['HINCRBY',    key, 'tokensIn',  String(tokensIn)]),
        redisCommand(['HINCRBY',    key, 'tokensOut', String(tokensOut)]),
        redisCommand(['HINCRBYFLOAT', key, 'costUSD', String(costUSD)]),
        redisCommand(['EXPIRE',     key, String(METRICS_TTL_SECONDS)]),
      ]).catch(err => log.error('[AIBudget] Redis persist failed:', err))
    );
  }
}

/** Singleton instance — import and call directly */
export const budgetManager = new AIBudgetManager();

// =============================================================================
// PERSIST METRICS — legacy function kept for backward compatibility
// =============================================================================

/**
 * @deprecated Use budgetManager.trackUsage() instead.
 * Kept for modules that still call this directly.
 */
export function persistAIMetrics(tokensIn: number, tokensOut: number): void {
  budgetManager.trackUsage('gemini-2.5-flash', tokensIn, tokensOut);
}

// =============================================================================
// TYPES
// =============================================================================

export interface DailyAIUsage {
  date: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUSD: number;
}

export interface BudgetStatus {
  daily: DailyAIUsage;
  monthlyCostUSD: number;
  dailyLimitUSD: number;
  monthlyLimitUSD: number;
  dailyPercent: number;
  monthlyPercent: number;
  warning?: string;
}

// =============================================================================
// READ USAGE
// =============================================================================

async function readDailyRaw(key: string): Promise<{ requests: number; tokensIn: number; tokensOut: number }> {
  try {
    const result = await redisCommand(['HMGET', key, 'requests', 'tokensIn', 'tokensOut']);
    const [req, tin, tout] = result as (string | null)[];
    return {
      requests: parseInt(req ?? '0', 10),
      tokensIn: parseInt(tin ?? '0', 10),
      tokensOut: parseInt(tout ?? '0', 10),
    };
  } catch {
    return { requests: 0, tokensIn: 0, tokensOut: 0 };
  }
}

/**
 * Returns current daily + monthly usage and budget status.
 * Reads from Redis; returns zero-usage defaults when Redis is unavailable.
 */
export async function checkBudget(): Promise<BudgetStatus> {
  const dailyLimitUSD  = parseFloat(optionalEnv.AI_BUDGET_DAILY_USD  ?? '10');
  const monthlyLimitUSD = parseFloat(optionalEnv.AI_BUDGET_MONTHLY_USD ?? '150');

  const todayRaw    = await readDailyRaw(todayKey());
  const dailyCostUSD = estimateCostUSD('gemini-2.5-flash', todayRaw.tokensIn, todayRaw.tokensOut);

  // Monthly: sum all days in current month
  const keys = monthKeys();
  let monthlyCostUSD = 0;
  if (keys.length > 0) {
    const usages = await Promise.all(keys.map(readDailyRaw));
    for (const u of usages) {
      monthlyCostUSD += estimateCostUSD('gemini-2.5-flash', u.tokensIn, u.tokensOut);
    }
  }

  const daily: DailyAIUsage = {
    date: todayKey().replace('ai:metrics:', ''),
    requests: todayRaw.requests,
    tokensIn: todayRaw.tokensIn,
    tokensOut: todayRaw.tokensOut,
    estimatedCostUSD: dailyCostUSD,
  };

  const dailyPercent   = dailyLimitUSD   > 0 ? (dailyCostUSD   / dailyLimitUSD)   * 100 : 0;
  const monthlyPercent = monthlyLimitUSD > 0 ? (monthlyCostUSD / monthlyLimitUSD) * 100 : 0;

  let warning: string | undefined;
  if (dailyPercent >= 100) {
    warning = `Daily budget exceeded: $${dailyCostUSD.toFixed(3)} / $${dailyLimitUSD}`;
  } else if (monthlyPercent >= 100) {
    warning = `Monthly budget exceeded: $${monthlyCostUSD.toFixed(2)} / $${monthlyLimitUSD}`;
  } else if (dailyPercent >= 80) {
    warning = `Daily budget at ${Math.round(dailyPercent)}%: $${dailyCostUSD.toFixed(3)} / $${dailyLimitUSD}`;
  } else if (monthlyPercent >= 80) {
    warning = `Monthly budget at ${Math.round(monthlyPercent)}%: $${monthlyCostUSD.toFixed(2)} / $${monthlyLimitUSD}`;
  }

  if (warning) log.info(`[AIBudget] ${warning}`);

  return { daily, monthlyCostUSD, dailyLimitUSD, monthlyLimitUSD, dailyPercent, monthlyPercent, warning };
}
