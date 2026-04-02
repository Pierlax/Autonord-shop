/**
 * AI Client - Centralized LLM Access Layer
 *
 * Provides a single entry point for all AI text generation in the application.
 * Uses Google Gemini 2.5 Flash as the primary model.
 *
 * Features:
 * - Distributed rate limiting via @upstash/ratelimit (sliding window, Redis-backed)
 *   Falls back to allowing requests when Redis is not configured (dev / no Redis)
 * - Auto-retry with exponential backoff on 429 errors
 * - Budget tracking: fire-and-forget per-call token cost to Redis (AIBudgetManager)
 * - Centralized model config: override via GOOGLE_AI_MODEL / GOOGLE_AI_LITE_MODEL env
 *
 * Usage:
 *   import { generateTextSafe, generateObjectSafe } from '@/lib/shopify/ai-client';
 *
 *   const result = await generateTextSafe({
 *     system: 'You are a product expert.',
 *     prompt: 'Describe this product...',
 *   });
 *   console.log(result.text);
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, generateObject, type ModelMessage } from 'ai';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env, optionalEnv } from '@/lib/env';
import { loggers } from '@/lib/logger';
import { budgetManager } from '@/lib/shopify/ai-budget';
import type { z } from 'zod';

const log = loggers.shopify;

// =============================================================================
// CONFIGURATION
// =============================================================================

const PRIMARY_MODEL = optionalEnv.GOOGLE_AI_MODEL      ?? 'gemini-2.5-flash';
const LITE_MODEL    = optionalEnv.GOOGLE_AI_LITE_MODEL ?? 'gemini-2.5-flash';

/** RPM limit — AI_THROTTLE_LIMIT takes precedence, then AI_RPM_LIMIT, then 15 */
const MAX_RPM = parseInt(
  optionalEnv.AI_THROTTLE_LIMIT ?? optionalEnv.AI_RPM_LIMIT ?? '15',
  10,
);

const MAX_RETRIES         = 3;
const BASE_RETRY_DELAY_MS = 4_000;
const MAX_TOKENS_HARD_LIMIT = 8_000;

// =============================================================================
// GOOGLE AI PROVIDER
// =============================================================================

const google = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// =============================================================================
// DISTRIBUTED RATE LIMITER (Redis sliding window)
// =============================================================================

/**
 * Build the Ratelimit instance lazily.
 * Returns null when Redis is not configured — callers skip throttling gracefully.
 */
let _ratelimit: Ratelimit | null | undefined = undefined; // undefined = not yet initialised

function getRatelimit(): Ratelimit | null {
  if (_ratelimit !== undefined) return _ratelimit;

  const url   = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    log.info('[AIClient] Redis not configured — rate limiter disabled (dev/local mode)');
    _ratelimit = null;
    return null;
  }

  const redis = new Redis({ url, token });
  _ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(MAX_RPM, '1 m'),
    prefix: 'rl:gemini',
    analytics: false, // avoids extra Redis writes
  });

  log.info(`[AIClient] Distributed rate limiter initialised: ${MAX_RPM} RPM (sliding window)`);
  return _ratelimit;
}

// =============================================================================
// IN-MEMORY RATE LIMITER (fallback when Redis is unavailable)
// =============================================================================

/**
 * Simple sliding-window rate limiter backed by an in-process timestamp array.
 * Used when Redis is not configured (dev) or when Redis is down (prod failsafe).
 * Limits to MAX_RPM requests per 60-second window, same as the Redis limiter.
 */
const _inMemoryRequests: number[] = [];

async function inMemoryRateLimit(): Promise<void> {
  const now = Date.now();
  const windowMs = 60_000;

  // Evict timestamps outside the current window
  while (_inMemoryRequests.length > 0 && now - _inMemoryRequests[0] >= windowMs) {
    _inMemoryRequests.shift();
  }

  if (_inMemoryRequests.length >= MAX_RPM) {
    const oldest = _inMemoryRequests[0];
    const waitMs = windowMs - (now - oldest) + 100; // small buffer
    log.info(`[AIClient] In-memory rate limit reached (${MAX_RPM} RPM) — waiting ${waitMs}ms`);
    await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    // Re-evict after wait
    const nowAfter = Date.now();
    while (_inMemoryRequests.length > 0 && nowAfter - _inMemoryRequests[0] >= windowMs) {
      _inMemoryRequests.shift();
    }
  }

  _inMemoryRequests.push(Date.now());
}

/**
 * Ask the rate limiter for permission.
 * If Redis is configured: uses distributed sliding-window (Upstash).
 * If Redis is unavailable: falls back to conservative in-memory limiter.
 * Never allows unlimited throughput — Redis failure is not a free pass.
 */
async function checkRateLimit(): Promise<void> {
  const rl = getRatelimit();
  if (!rl) {
    // Redis not configured — enforce limit in-process
    await inMemoryRateLimit();
    return;
  }

  try {
    const { success, reset } = await rl.limit('gemini-global');
    if (!success) {
      const waitMs = Math.max(reset - Date.now(), 0) + 100; // small buffer
      log.info(`[AIClient] Rate limit reached — waiting ${waitMs}ms until reset`);
      await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    }
  } catch (err) {
    // Redis error — fall back to in-memory limiter rather than allowing unlimited
    log.error('[AIClient] Rate limiter Redis error — falling back to in-memory limiter:', err);
    await inMemoryRateLimit();
  }
}

// =============================================================================
// RETRY HELPERS
// =============================================================================

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('resource_exhausted');
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// GENERATE TEXT (SAFE)
// =============================================================================

export interface GenerateTextOptions {
  /** System instruction for the model */
  system?: string;
  /** User prompt (simple single-turn) */
  prompt?: string;
  /** Multi-turn messages (alternative to prompt) */
  messages?: ModelMessage[];
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
  /** Use lite model for less critical tasks */
  useLiteModel?: boolean;
}

export interface GenerateTextResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  retries: number;
}

export async function generateTextSafe(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const modelId = options.useLiteModel ? LITE_MODEL : PRIMARY_MODEL;
  const model   = google(modelId);
  let retries   = 0;

  while (retries <= MAX_RETRIES) {
    try {
      // Distributed rate limit check (Redis sliding window)
      await checkRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const baseConfig = {
        model,
        system:          options.system,
        maxOutputTokens: Math.min(options.maxTokens ?? 4096, MAX_TOKENS_HARD_LIMIT),
        temperature:     options.temperature ?? 0.7,
        abortSignal:     controller.signal,
      };

      let result;
      try {
        result = options.messages
          ? await generateText({ ...baseConfig, messages: options.messages })
          : await generateText({ ...baseConfig, prompt: options.prompt ?? '' });
      } finally {
        clearTimeout(timeoutId);
      }

      const usage = {
        promptTokens:     result.usage?.inputTokens  ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens:     (result.usage?.inputTokens  ?? 0) + (result.usage?.outputTokens ?? 0),
      };

      // Fire-and-forget: persist token cost to Redis
      budgetManager.trackUsage(modelId, usage.promptTokens, usage.completionTokens);

      return { text: result.text, usage, model: modelId, retries };

    } catch (error) {
      if (isRateLimitError(error) && retries < MAX_RETRIES) {
        retries++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        log.info(`[AIClient] 429 hit, retry ${retries}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      log.error(`[AIClient] generateTextSafe failed after ${retries} retries:`, error);
      throw error;
    }
  }

  throw new Error('[AIClient] Max retries exceeded');
}

// =============================================================================
// GENERATE OBJECT (SAFE)
// =============================================================================

export interface GenerateObjectOptions<T> {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  schema: z.ZodType<T>;
  schemaName?: string;
  maxTokens?: number;
  temperature?: number;
  useLiteModel?: boolean;
}

export interface GenerateObjectResult<T> {
  object: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  retries: number;
}

export async function generateObjectSafe<T>(options: GenerateObjectOptions<T>): Promise<GenerateObjectResult<T>> {
  const modelId = options.useLiteModel ? LITE_MODEL : PRIMARY_MODEL;
  const model   = google(modelId);
  let retries   = 0;

  while (retries <= MAX_RETRIES) {
    try {
      await checkRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const baseObjConfig = {
        model,
        system:          options.system,
        schema:          options.schema,
        schemaName:      options.schemaName,
        maxOutputTokens: Math.min(options.maxTokens ?? 4096, MAX_TOKENS_HARD_LIMIT),
        temperature:     options.temperature ?? 0.3,
        abortSignal:     controller.signal,
      };

      let result;
      try {
        result = options.messages
          ? await generateObject({ ...baseObjConfig, messages: options.messages })
          : await generateObject({ ...baseObjConfig, prompt: options.prompt ?? '' });
      } finally {
        clearTimeout(timeoutId);
      }

      const usage = {
        promptTokens:     result.usage?.inputTokens  ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens:     (result.usage?.inputTokens  ?? 0) + (result.usage?.outputTokens ?? 0),
      };

      budgetManager.trackUsage(modelId, usage.promptTokens, usage.completionTokens);

      return { object: result.object, usage, model: modelId, retries };

    } catch (error) {
      if (isRateLimitError(error) && retries < MAX_RETRIES) {
        retries++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        log.info(`[AIClient] 429 hit, retry ${retries}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      log.error(`[AIClient] generateObjectSafe failed after ${retries} retries:`, error);
      throw error;
    }
  }

  throw new Error('[AIClient] Max retries exceeded');
}

// =============================================================================
// CONVENIENCE HELPERS
// =============================================================================

export async function quickGenerate(prompt: string): Promise<string> {
  const result = await generateTextSafe({ prompt, useLiteModel: true });
  return result.text;
}

export function getModelConfig() {
  return {
    primaryModel: PRIMARY_MODEL,
    liteModel:    LITE_MODEL,
    maxRPM:       MAX_RPM,
    maxRetries:   MAX_RETRIES,
    provider:     'google-gemini',
    rpmSource:    optionalEnv.AI_THROTTLE_LIMIT ? 'AI_THROTTLE_LIMIT'
                : optionalEnv.AI_RPM_LIMIT      ? 'AI_RPM_LIMIT'
                : 'default (15)',
    rateLimiter:  getRatelimit() ? 'redis-sliding-window' : 'disabled (no Redis)',
  };
}

/**
 * @deprecated In-memory metrics removed in favour of Redis-backed AIBudgetManager.
 * Stub kept for backward compatibility with any callers of getAIMetrics().
 */
export function getAIMetrics() {
  return { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, retries: 0, errors: 0 };
}
