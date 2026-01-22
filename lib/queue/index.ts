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
 */

import { Client } from '@upstash/qstash';
import { loggers } from '@/lib/logger';

const log = loggers.queue;

// Lazy initialization to avoid build-time errors
let qstashClient: Client | null = null;

function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
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
}

export interface BlogResearchJob {
  triggeredAt: string;
  manual: boolean;
}

/**
 * Queue a product for enrichment processing
 * Returns immediately, processing happens asynchronously
 */
export async function queueProductEnrichment(
  job: EnrichmentJob,
  baseUrl: string
): Promise<{ messageId: string; queued: true } | { error: string; queued: false }> {
  try {
    const client = getQStashClient();
    
    const result = await client.publishJSON({
      url: `${baseUrl}/api/workers/regenerate-product`,
      body: job,
      retries: 3,
      // Delay between retries (in seconds)
      // QStash will retry with exponential backoff
    });

    log.info(`[Queue] Product ${job.productId} queued for enrichment. MessageId: ${result.messageId}`);
    
    return {
      messageId: result.messageId,
      queued: true,
    };
  } catch (error) {
    log.error('[Queue] Failed to queue product enrichment:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      queued: false,
    };
  }
}

/**
 * Queue a blog research job
 */
export async function queueBlogResearch(
  job: BlogResearchJob,
  baseUrl: string
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
