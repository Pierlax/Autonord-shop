/**
 * Enrich Pending Products Cron Job
 * 
 * Runs every 4 hours to find and enrich products that:
 * - Don't have the AI-Enhanced tag
 * - Have been created more than 5 minutes ago (to avoid race conditions)
 * 
 * This catches any products that were missed by webhooks or
 * were imported in bulk without triggering webhooks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';
import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';

const log = loggers.api;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// Shopify Admin API helper
async function getUnenrichedProducts(limit: number = 50): Promise<any[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error('Shopify credentials not configured');
  }

  // Get products that don't have AI-Enhanced tag
  // We'll filter client-side since Shopify's tag filtering is limited
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/products.json?limit=${limit}&status=active`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Filter to products without AI-Enhanced tag
  const unenrichedProducts = data.products.filter((product: any) => {
    const tags = product.tags ? product.tags.toLowerCase() : '';
    return !tags.includes('ai-enhanced');
  });

  // Filter to products created more than 5 minutes ago
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  return unenrichedProducts.filter((product: any) => {
    const createdAt = new Date(product.created_at);
    return createdAt < fiveMinutesAgo;
  });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    log.info('[Cron] Starting enrich-pending job');

    // Get unenriched products
    const products = await getUnenrichedProducts(20); // Process max 20 per run

    if (products.length === 0) {
      log.info('[Cron] No pending products to enrich');
      return NextResponse.json({
        success: true,
        message: 'No pending products to enrich',
        productsFound: 0,
        processingTime: `${Date.now() - startTime}ms`,
      });
    }

    log.info(`[Cron] Found ${products.length} products to enrich`);

    // Get base URL for queueing
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'https://autonord-shop.vercel.app';

    // Queue each product for enrichment
    const results = await Promise.all(
      products.map(async (product: any) => {
        const job: EnrichmentJob = {
          productId: String(product.id),
          productGid: `gid://shopify/Product/${product.id}`,
          title: product.title,
          vendor: product.vendor || '',
          sku: product.variants?.[0]?.sku || '',
          price: product.variants?.[0]?.price || '0',
          productType: product.product_type || '',
          tags: product.tags ? product.tags.split(', ') : [],
          hasImages: product.images && product.images.length > 0,
          receivedAt: new Date().toISOString(),
        };

        try {
          const result = await queueProductEnrichment(job, baseUrl);
          return {
            productId: product.id,
            title: product.title,
            queued: result.queued,
            messageId: result.queued ? result.messageId : undefined,
          };
        } catch (error) {
          return {
            productId: product.id,
            title: product.title,
            queued: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const queued = results.filter(r => r.queued).length;
    const failed = results.filter(r => !r.queued).length;

    log.info(`[Cron] Queued ${queued} products, ${failed} failed`);

    return NextResponse.json({
      success: true,
      productsFound: products.length,
      queued,
      failed,
      results,
      processingTime: `${Date.now() - startTime}ms`,
    });

  } catch (error) {
    log.error('[Cron] enrich-pending failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    );
  }
}

// POST handler for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
