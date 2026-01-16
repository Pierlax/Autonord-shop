/**
 * Force Enrich ALL Products (One-time use)
 * 
 * This endpoint forces enrichment of ALL products, ignoring the AI-Enhanced tag.
 * Use this for initial setup or to re-process all products.
 * 
 * WARNING: This will re-process products that were already enriched!
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';
import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';

const log = loggers.api;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// Get ALL products (ignoring AI-Enhanced tag)
async function getAllProducts(limit: number = 50): Promise<any[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error('Shopify credentials not configured');
  }

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
  return data.products || [];
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Verify with CRON_SECRET for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    log.info('[ForceEnrich] Starting force enrichment of ALL products...');

    // Get ALL products (no filtering)
    const products = await getAllProducts(50);

    if (products.length === 0) {
      log.info('[ForceEnrich] No products found in store');
      return NextResponse.json({
        success: true,
        message: 'No products found in store',
        productsFound: 0,
        processingTime: `${Date.now() - startTime}ms`,
      });
    }

    log.info(`[ForceEnrich] Found ${products.length} products to enrich (forcing all)`);

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
            hasImages: job.hasImages,
            currentTags: product.tags,
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
    const withImages = results.filter(r => r.hasImages).length;
    const withoutImages = results.filter(r => !r.hasImages).length;

    log.info(`[ForceEnrich] Queued ${queued} products, ${failed} failed`);
    log.info(`[ForceEnrich] Products with images: ${withImages}, without: ${withoutImages}`);

    return NextResponse.json({
      success: true,
      message: 'Force enrichment triggered for ALL products',
      productsFound: products.length,
      queued,
      failed,
      withImages,
      withoutImages,
      results,
      processingTime: `${Date.now() - startTime}ms`,
    });

  } catch (error) {
    log.error('[ForceEnrich] Error:', error);
    
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

export async function POST(request: NextRequest) {
  return GET(request);
}
