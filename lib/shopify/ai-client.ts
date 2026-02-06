/**
 * AI Client - Centralized LLM Access Layer
 * 
 * Provides a single entry point for all AI text generation in the application.
 * Uses Google Gemini 2.0 Flash as the primary model (free tier: 15 RPM).
 * 
 * Features:
 * - Rate limiting: 15 requests/minute via throttle queue
 * - Auto-retry: Exponential backoff on 429 (Too Many Requests)
 * - Centralized model config: Change model in one place
 * - Cost tracking: Logs token usage for monitoring
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
import { generateText, generateObject, type CoreMessage } from 'ai';
import { env } from '@/lib/env';
import { loggers } from '@/lib/logger';
import type { z } from 'zod';

const log = loggers.shopify;

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Primary model: Gemini 2.0 Flash (free tier: 15 RPM, 1M tokens/min) */
const PRIMARY_MODEL = 'gemini-2.0-flash';

/** Fallback model (lighter, for less critical tasks) */
const LITE_MODEL = 'gemini-2.0-flash-lite';

/** Rate limit: max requests per minute (Gemini free tier = 15 RPM) */
const MAX_REQUESTS_PER_MINUTE = 15;

/** Max retries on 429 errors */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 4000;

// =============================================================================
// GOOGLE AI PROVIDER
// =============================================================================

const google = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// =============================================================================
// THROTTLE QUEUE (15 RPM)
// =============================================================================

/**
 * Simple token-bucket rate limiter.
 * Allows up to MAX_REQUESTS_PER_MINUTE requests per 60-second window.
 * If the bucket is empty, callers wait until a token becomes available.
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillInterval: number;
  private lastRefill: number;
  private waitQueue: Array<() => void> = [];

  constructor(maxPerMinute: number) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillInterval = 60000 / maxPerMinute; // ms between each token refill
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillInterval);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Wait for next token
    const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
    log.info(`[AIClient] Rate limit reached, waiting ${Math.round(waitTime)}ms...`);
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.refill();
        this.tokens = Math.max(0, this.tokens - 1);
        resolve();
      }, Math.max(waitTime, 100));
    });
  }
}

const rateLimiter = new RateLimiter(MAX_REQUESTS_PER_MINUTE);

// =============================================================================
// METRICS
// =============================================================================

interface AIMetrics {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  retries: number;
  errors: number;
}

const metrics: AIMetrics = {
  totalRequests: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  retries: 0,
  errors: 0,
};

export function getAIMetrics(): AIMetrics {
  return { ...metrics };
}

// =============================================================================
// RETRY LOGIC
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
  messages?: CoreMessage[];
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
  /** Use lite model for less critical tasks */
  useLiteModel?: boolean;
}

export interface GenerateTextResult {
  /** The generated text */
  text: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Which model was used */
  model: string;
  /** Number of retries needed */
  retries: number;
}

/**
 * Generate text using Gemini with rate limiting and auto-retry.
 * 
 * This is the main function all modules should use for text generation.
 * It handles:
 * - Rate limiting (15 RPM queue)
 * - Retry on 429 with exponential backoff
 * - Token usage tracking
 * - Error logging
 * 
 * @example
 *   const result = await generateTextSafe({
 *     system: 'You are a product specification expert.',
 *     prompt: 'Extract the key specifications of Milwaukee M18 FUEL 2767-20',
 *   });
 *   console.log(result.text);
 */
export async function generateTextSafe(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const modelId = options.useLiteModel ? LITE_MODEL : PRIMARY_MODEL;
  const model = google(modelId);
  let retries = 0;

  while (retries <= MAX_RETRIES) {
    try {
      // Wait for rate limit token
      await rateLimiter.acquire();

      metrics.totalRequests++;

      const result = await generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        messages: options.messages,
        maxTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      });

      // Track usage
      const usage = {
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        totalTokens: (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0),
      };
      metrics.totalTokensIn += usage.promptTokens;
      metrics.totalTokensOut += usage.completionTokens;

      return {
        text: result.text,
        usage,
        model: modelId,
        retries,
      };

    } catch (error) {
      if (isRateLimitError(error) && retries < MAX_RETRIES) {
        retries++;
        metrics.retries++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        log.info(`[AIClient] 429 Rate limit hit, retry ${retries}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      metrics.errors++;
      log.error(`[AIClient] generateTextSafe failed after ${retries} retries:`, error);
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('[AIClient] Max retries exceeded');
}

// =============================================================================
// GENERATE OBJECT (SAFE) — For structured JSON output
// =============================================================================

export interface GenerateObjectOptions<T> {
  /** System instruction */
  system?: string;
  /** User prompt */
  prompt?: string;
  /** Multi-turn messages */
  messages?: CoreMessage[];
  /** Zod schema for the expected output */
  schema: z.ZodType<T>;
  /** Schema name for logging */
  schemaName?: string;
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.3 for structured output) */
  temperature?: number;
  /** Use lite model */
  useLiteModel?: boolean;
}

export interface GenerateObjectResult<T> {
  /** The parsed object */
  object: T;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Which model was used */
  model: string;
  /** Number of retries needed */
  retries: number;
}

/**
 * Generate a structured JSON object using Gemini with rate limiting.
 * Uses Zod schema for type-safe structured output.
 * 
 * @example
 *   const result = await generateObjectSafe({
 *     system: 'Extract product specs.',
 *     prompt: 'Milwaukee M18 FUEL 2767-20',
 *     schema: z.object({ voltage: z.string(), torque: z.string() }),
 *   });
 *   console.log(result.object.voltage); // "18V"
 */
export async function generateObjectSafe<T>(options: GenerateObjectOptions<T>): Promise<GenerateObjectResult<T>> {
  const modelId = options.useLiteModel ? LITE_MODEL : PRIMARY_MODEL;
  const model = google(modelId);
  let retries = 0;

  while (retries <= MAX_RETRIES) {
    try {
      await rateLimiter.acquire();

      metrics.totalRequests++;

      const result = await generateObject({
        model,
        system: options.system,
        prompt: options.prompt,
        messages: options.messages,
        schema: options.schema,
        schemaName: options.schemaName,
        maxTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.3,
      });

      const usage = {
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        totalTokens: (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0),
      };
      metrics.totalTokensIn += usage.promptTokens;
      metrics.totalTokensOut += usage.completionTokens;

      return {
        object: result.object,
        usage,
        model: modelId,
        retries,
      };

    } catch (error) {
      if (isRateLimitError(error) && retries < MAX_RETRIES) {
        retries++;
        metrics.retries++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        log.info(`[AIClient] 429 Rate limit hit, retry ${retries}/${MAX_RETRIES} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      metrics.errors++;
      log.error(`[AIClient] generateObjectSafe failed after ${retries} retries:`, error);
      throw error;
    }
  }

  throw new Error('[AIClient] Max retries exceeded');
}

// =============================================================================
// CONVENIENCE HELPERS
// =============================================================================

/**
 * Simple text generation with just a prompt (no system instruction).
 * Useful for quick one-off generations.
 */
export async function quickGenerate(prompt: string): Promise<string> {
  const result = await generateTextSafe({ prompt, useLiteModel: true });
  return result.text;
}

/**
 * Get the current model configuration.
 */
export function getModelConfig() {
  return {
    primaryModel: PRIMARY_MODEL,
    liteModel: LITE_MODEL,
    maxRPM: MAX_REQUESTS_PER_MINUTE,
    maxRetries: MAX_RETRIES,
    provider: 'google-gemini',
  };
}
