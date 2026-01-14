/**
 * Shopify Product Enrichment Webhook
 * 
 * Listens to products/create webhook and enriches products with:
 * - TAYA-style AI-generated descriptions
 * - Pro/Contro lists
 * - Technical FAQs
 * 
 * Does NOT modify: Title, Price, SKU, EAN (managed by gestionale)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook, getWebhookTopic } from '@/lib/shopify/webhook-verify';
import { generateProductContent, formatDescriptionAsHtml } from '@/lib/shopify/ai-enrichment';
import { updateProductWithEnrichedContent, isProductAlreadyEnriched } from '@/lib/shopify/admin-api';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';

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

    console.log(`[Enrichment] Received webhook from ${shopDomain}, topic: ${topicHeader}`);

    // Step 1: Verify HMAC signature
    const isValid = verifyShopifyWebhook(rawBody, hmacHeader);
    
    if (!isValid) {
      console.error('[Enrichment] HMAC verification failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // Step 2: Verify webhook topic
    const topic = getWebhookTopic(topicHeader);
    
    if (topic !== 'products/create' && topic !== 'products/update') {
      console.log(`[Enrichment] Ignoring webhook topic: ${topic}`);
      return NextResponse.json(
        { message: `Webhook topic ${topic} not handled` },
        { status: 200 }
      );
    }

    // Step 3: Parse payload
    const product: ShopifyProductWebhookPayload = JSON.parse(rawBody);
    
    console.log(`[Enrichment] Processing product: ${product.id} - ${product.title}`);

    // Step 4: Safety Check - Skip if already enriched
    if (isProductAlreadyEnriched(product.tags)) {
      console.log(`[Enrichment] Product ${product.id} already enriched, skipping`);
      return NextResponse.json(
        { 
          message: 'Product already enriched',
          productId: product.id,
          skipped: true,
        },
        { status: 200 }
      );
    }

    // Step 5: Generate AI content
    console.log(`[Enrichment] Generating AI content for product ${product.id}`);
    const enrichedData = await generateProductContent(product);
    
    // Step 6: Format as HTML
    const formattedHtml = formatDescriptionAsHtml(enrichedData);

    // Step 7: Update Shopify product
    console.log(`[Enrichment] Updating Shopify product ${product.id}`);
    await updateProductWithEnrichedContent(
      product.id,
      enrichedData,
      formattedHtml,
      product.tags
    );

    const duration = Date.now() - startTime;
    console.log(`[Enrichment] Successfully enriched product ${product.id} in ${duration}ms`);

    return NextResponse.json(
      {
        success: true,
        productId: product.id,
        productTitle: product.title,
        enrichedFields: ['body_html', 'tags', 'metafields'],
        metafieldsCreated: ['custom.pros', 'custom.cons', 'custom.faqs', 'custom.ai_description'],
        processingTime: `${duration}ms`,
      },
      { status: 200 }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Enrichment] Error after ${duration}ms:`, error);
    
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

// Handle GET requests (for webhook verification/testing)
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: 'active',
      endpoint: '/api/webhooks/enrich-product',
      description: 'Shopify Product Enrichment Webhook (TAYA Style)',
      supportedTopics: ['products/create', 'products/update'],
      enrichmentFields: [
        'body_html (AI-generated description)',
        'tags (adds AI-Enhanced)',
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
