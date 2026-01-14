/**
 * Shopify Product Enrichment Webhook
 * 
 * Listens to products/create webhook and enriches products with:
 * - TAYA-style AI-generated descriptions
 * - Pro/Contro lists
 * - Technical FAQs
 * - Product images (searched automatically)
 * 
 * Does NOT modify: Title, Price, SKU, EAN (managed by gestionale)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook, getWebhookTopic } from '@/lib/shopify/webhook-verify';
import { generateProductContent, formatDescriptionAsHtml } from '@/lib/shopify/ai-enrichment';
import { 
  updateProductWithEnrichedContent, 
  isProductAlreadyEnriched,
  productHasImages,
  addProductImages,
} from '@/lib/shopify/admin-api';
import { getBestProductImage, searchProductImages } from '@/lib/shopify/image-search';
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

    // Step 7: Update Shopify product with content
    console.log(`[Enrichment] Updating Shopify product ${product.id}`);
    await updateProductWithEnrichedContent(
      product.id,
      enrichedData,
      formattedHtml,
      product.tags
    );

    // Step 8: Search and add images if product has no images
    let imagesAdded = 0;
    const hasImages = product.images && product.images.length > 0;
    
    if (!hasImages) {
      console.log(`[Enrichment] Product ${product.id} has no images, searching...`);
      
      try {
        // Search for product images
        const imageResults = await searchProductImages({
          title: product.title,
          vendor: product.vendor,
          sku: product.variants[0]?.sku || '',
          barcode: product.variants[0]?.barcode || undefined,
          productType: product.product_type,
        });

        if (imageResults.length > 0) {
          // Take up to 3 best images
          const imageUrls = imageResults.slice(0, 3).map(r => r.url);
          
          console.log(`[Enrichment] Found ${imageResults.length} images, adding top ${imageUrls.length}`);
          
          imagesAdded = await addProductImages(
            product.id,
            imageUrls,
            product.title
          );
          
          console.log(`[Enrichment] Successfully added ${imagesAdded} images to product ${product.id}`);
        } else {
          console.log(`[Enrichment] No images found for product ${product.id}`);
        }
      } catch (imageError) {
        // Log but don't fail the whole enrichment
        console.error(`[Enrichment] Image search/upload failed:`, imageError);
      }
    } else {
      console.log(`[Enrichment] Product ${product.id} already has ${product.images.length} images`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Enrichment] Successfully enriched product ${product.id} in ${duration}ms`);

    return NextResponse.json(
      {
        success: true,
        productId: product.id,
        productTitle: product.title,
        enrichedFields: ['body_html', 'tags', 'metafields', ...(imagesAdded > 0 ? ['images'] : [])],
        metafieldsCreated: ['custom.pros', 'custom.cons', 'custom.faqs', 'custom.ai_description'],
        imagesAdded,
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
        'images (auto-searched if missing)',
        'metafield: custom.pros',
        'metafield: custom.cons',
        'metafield: custom.faqs',
        'metafield: custom.ai_description',
      ],
      preservedFields: ['title', 'price', 'sku', 'barcode', 'inventory'],
      imageSearch: {
        enabled: !!process.env.SERPAPI_API_KEY,
        provider: 'SerpAPI Google Images',
      },
    },
    { status: 200 }
  );
}
