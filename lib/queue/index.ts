/**
 * Queue Infrastructure for Product Enrichment
 *
 * Uses Upstash QStash to handle webhooks asynchronously,
 * avoiding Vercel's 10-60 second timeout limits.
 *
 * Architecture:
 * 1. Webhook receives product → adds to queue (fast, <1 second)
 * 2. QStash calls worker endpoint → processes product (can take 30+ seconds)
 * 3. Worker has automatic retries on failure
 *
 * Fallback strategy (when QStash is unavailable):
 *   L1: QStash   — preferred, async delivery + retries
 *   L2: Redis retry queue (`retry:enrichment:v1`) — processed by process-retry-queue cron
 */

import { Client } from '@upstash/qstash';
import { loggers } from '@/lib/logger';
import { optionalEnv } from '@/lib/env';

const log = loggers.queue;

// Lazy initialization to avoid build-time errors
let qstashClient: Client | null = null;

function getQStashClient(): Client {
  if (!qstashClient) {
    const token = optionalEnv.QSTASH_TOKEN;
    if (!token) {
      throw new Error('QSTASH_TOKEN environment variable is not set');
    }
    qstashClient = new Client({ token });
  }
  return qstashClient;
}

export interface EnrichmentJob {
  productId: string;
  productGid: string;
  title: string;
  vendor: string;
  sku: string;
  price: string;
  productType: string;
  tags: string[];
  hasImages: boolean;
  receivedAt: string;
  /** EAN/barcode — passed to ImageAgent for precise image lookup */
  barcode?: string | null;
}

export interface BlogResearchJob {
  triggeredAt: string;
  manual: boolean;
}

// =============================================================================
// REDIS RETRY QUEUE (L2 fallback)
// =============================================================================

const RETRY_QUEUE_KEY = 'retry:enrichment:v1';
const RETRY_QUEUE_MAX = 1000;

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
  } catch {
    return null;
  }
}

/**
 * Push a job to the Redis retry queue.
 * Returns true if successfully saved, false otherwise (Redis not configured or error).
 */
async function pushToRetryQueue(job: EnrichmentJob): Promise<boolean> {
  try {
    const result = await redisCommand(['RPUSH', RETRY_QUEUE_KEY, JSON.stringify(job)]);
    if (result !== null) {
      // Keep queue bounded
      await redisCommand(['LTRIM', RETRY_QUEUE_KEY, '0', String(RETRY_QUEUE_MAX - 1)]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Read up to `limit` jobs from the retry queue (non-destructive).
 * Returns null when Redis is not configured.
 */
export async function peekRetryQueue(limit = 20): Promise<EnrichmentJob[] | null> {
  const url = optionalEnv.UPSTASH_REDIS_REST_URL;
  const token = optionalEnv.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const raw = await redisCommand(['LRANGE', RETRY_QUEUE_KEY, '0', String(limit - 1)]);
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      try { return JSON.parse(item as string) as EnrichmentJob; }
      catch { return null; }
    }).filter((j): j is EnrichmentJob => j !== null);
  } catch {
    return null;
  }
}

/**
 * Remove a specific job from the retry queue (by exact JSON match).
 */
export async function removeFromRetryQueue(job: EnrichmentJob): Promise<void> {
  await redisCommand(['LREM', RETRY_QUEUE_KEY, '1', JSON.stringify(job)]);
}

// =============================================================================
// ENQUEUE PRODUCT ENRICHMENT
// =============================================================================

export type QueueResult =
  | { queued: true; messageId: string; via: 'qstash' }
  | { queued: false; retryQueued: true; error: string; via: 'redis-retry' }
  | { queued: false; retryQueued: false; error: string; via: 'none' };

/**
 * Queue a product for enrichment processing.
 * Returns immediately; processing happens asynchronously.
 *
 * @param options.delaySeconds - Delay before QStash delivers the job.
 *   Use `index * 30` for staggered bulk enrichment to avoid Gemini rate-limit storms.
 */
export async function queueProductEnrichment(
  job: EnrichmentJob,
  baseUrl: string,
  options?: { delaySeconds?: number },
): Promise<QueueResult> {
  // L1: QStash
  try {
    const client = getQStashClient();
    const result = await client.publishJSON({
      url: `${baseUrl}/api/workers/regenerate-product`,
      body: job,
      retries: 3,
      ...(options?.delaySeconds ? { delay: options.delaySeconds } : {}),
    });
    log.info(`[Queue] Product ${job.productId} queued via QStash. MessageId: ${result.messageId}`);
    return { queued: true, messageId: result.messageId, via: 'qstash' };
  } catch (qstashError) {
    const errorMsg = qstashError instanceof Error ? qstashError.message : 'Unknown QStash error';
    log.error('[Queue] QStash failed, falling back to Redis retry queue:', qstashError);

    // L2: Redis retry queue
    const retryQueued = await pushToRetryQueue(job);
    if (retryQueued) {
      log.info(`[Queue] Product ${job.productId} saved to Redis retry queue`);
      return { queued: false, retryQueued: true, error: errorMsg, via: 'redis-retry' };
    }

    log.error(`[Queue] Both QStash and Redis retry queue failed for product ${job.productId}`);
    return { queued: false, retryQueued: false, error: errorMsg, via: 'none' };
  }
}

// =============================================================================
// ENQUEUE BLOG RESEARCH
// =============================================================================

/**
 * Queue a blog research job
 */
export async function queueBlogResearch(
  job: BlogResearchJob,
  baseUrl: string,
): Promise<{ messageId: string; queued: true } | { error: string; queued: false }> {
  try {
    const client = getQStashClient();

    const result = await client.publishJSON({
      url: `${baseUrl}/api/workers/blog-researcher`,
      body: job,
      retries: 2,
    });

    log.info(`[Queue] Blog research job queued. MessageId: ${result.messageId}`);

    return {
      messageId: result.messageId,
      queued: true,
    };
  } catch (error) {
    log.error('[Queue] Failed to queue blog research:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      queued: false,
    };
  }
}

/**
 * Verify that a request comes from QStash
 * Use this in worker endpoints for security
 *
 * Note: Use dynamic import in route handlers to avoid build-time errors:
 * const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs');
 */
// Re-export removed to avoid build-time initialization errors
// Import directly in route handlers using dynamic import instead
