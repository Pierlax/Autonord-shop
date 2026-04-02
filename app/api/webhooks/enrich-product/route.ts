/**
 * Shopify Product Enrichment Webhook
 * 
 * QUEUE-BASED ARCHITECTURE:
 * This webhook now adds products to a queue instead of processing immediately.
 * This avoids Vercel's 10-60 second timeout limits.
 * 
 * Flow:
 * 1. Webhook receives product → validates → adds to QStash queue (fast, <1 second)
 * 2. QStash calls /api/workers/regenerate-product → processes product (V3.1 with TAYA Police + ImageDiscovery)
 * 3. Worker has automatic retries on failure
 * 
 * Does NOT modify: Title, Price, SKU, EAN (managed by gestionale)
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';

const log = loggers.api;
import { verifyShopifyWebhook, getWebhookTopic } from '@/lib/shopify/webhook-verify';
import { isProductAlreadyEnriched } from '@/lib/shopify/admin-api';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';
import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';

// Disable body parsing to get raw body for HMAC verification
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get raw body for HMAC verification
    const rawBody = await request.text();
    
    // Get headers
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
    const topicHeader = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    log.info(`[Webhook] Received from ${shopDomain}, topic: ${topicHeader}`);

    // Step 1: Verify HMAC signature
    const isValid = verifyShopifyWebhook(rawBody, hmacHeader);
    
    if (!isValid) {
      log.error('[Webhook] HMAC verification failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // Step 2: Verify webhook topic
    const topic = getWebhookTopic(topicHeader);
    
    if (topic !== 'products/create' && topic !== 'products/update') {
      log.info(`[Webhook] Ignoring topic: ${topic}`);
      return NextResponse.json(
        { message: `Webhook topic ${topic} not handled` },
        { status: 200 }
      );
    }

    // Step 3: Parse payload
    const product: ShopifyProductWebhookPayload = JSON.parse(rawBody);
    
    log.info(`[Webhook] Product: ${product.id} - ${product.title}`);

    // Step 4: Safety Check - Skip if already enriched
    if (isProductAlreadyEnriched(product.tags)) {
      log.info(`[Webhook] Product ${product.id} already enriched, skipping`);
      return NextResponse.json(
        { 
          message: 'Product already enriched',
          productId: product.id,
          skipped: true,
        },
        { status: 200 }
      );
    }

    // Step 5: Add to queue for async processing
    // This returns immediately, processing happens in the worker
    const baseUrl = getBaseUrl(request);
    
    const job: EnrichmentJob = {
      productId: String(product.id),
      productGid: `gid://shopify/Product/${product.id}`,
      title: product.title,
      vendor: product.vendor,
      sku: product.variants[0]?.sku || '',
      price: product.variants[0]?.price || '0',
      productType: product.product_type,
      tags: product.tags ? product.tags.split(', ') : [],
      hasImages: product.images && product.images.length > 0,
      receivedAt: new Date().toISOString(),
    };

    const queueResult = await queueProductEnrichment(job, baseUrl);
    
    const duration = Date.now() - startTime;

    if (queueResult.queued) {
      log.info(`[Webhook] Product ${product.id} queued in ${duration}ms. MessageId: ${queueResult.messageId}`);
      
      return NextResponse.json(
        {
          success: true,
          queued: true,
          productId: product.id,
          productTitle: product.title,
          messageId: queueResult.messageId,
          processingTime: `${duration}ms`,
          note: 'Product added to enrichment queue. Processing will happen asynchronously.',
        },
        { status: 202 } // 202 Accepted - request accepted for processing
      );
    } else {
      log.error(`[Webhook] Failed to queue product ${product.id}: ${queueResult.error}`);
      
      return NextResponse.json(
        {
          success: false,
          queued: false,
          productId: product.id,
          error: queueResult.error,
          processingTime: `${duration}ms`,
        },
        { status: 500 }
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`[Webhook] Error after ${duration}ms:`, error);
    
    // Return 200 to prevent Shopify from retrying (we'll handle errors internally)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: `${duration}ms`,
      },
      { status: 200 }
    );
  }
}

/**
 * Get the base URL for the current deployment
 */
function getBaseUrl(request: NextRequest): string {
  // IMPORTANT: Non usare VERCEL_URL — punta al deployment specifico con Deployment Protection
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  return 'https://autonord-shop.vercel.app';
}

// Handle GET requests (for webhook verification/testing)
export async function GET(request: NextRequest) {
  const qstashConfigured = !!process.env.QSTASH_TOKEN;
  
  return NextResponse.json(
    {
      status: 'active',
      endpoint: '/api/webhooks/enrich-product',
      description: 'Shopify Product Enrichment Webhook (Queue-Based)',
      architecture: 'async-queue',
      queueProvider: 'Upstash QStash',
      qstashConfigured,
      supportedTopics: ['products/create', 'products/update'],
      flow: [
        '1. Webhook receives product',
        '2. Validates HMAC signature',
        '3. Adds to QStash queue (fast, <1 second)',
        '4. Returns 202 Accepted immediately',
        '5. Worker processes product asynchronously',
        '6. Automatic retries on failure',
      ],
      workerEndpoint: '/api/workers/regenerate-product',
      enrichmentFields: [
        'body_html (AI-generated description)',
        'tags (adds AI-Enhanced)',
        'images (auto-searched if missing)',
        'metafield: custom.pros',
        'metafield: custom.cons',
        'metafield: custom.faqs',
        'metafield: custom.ai_description',
      ],
      preservedFields: ['title', 'price', 'sku', 'barcode', 'inventory'],
    },
    { status: 200 }
  );
}
