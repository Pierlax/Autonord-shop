/**
 * Product Enrichment Worker
 * 
 * This endpoint is called by QStash to process products asynchronously.
 * It has no timeout concerns because QStash handles retries and the
 * processing happens outside the original webhook request.
 * 
 * Security: Only accepts requests from QStash (verified via signature)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { generateProductContent, formatDescriptionAsHtml } from '@/lib/shopify/ai-enrichment';
import { 
  updateProductWithEnrichedContent, 
  addProductImages,
  getProductById,
} from '@/lib/shopify/admin-api';
import { searchProductImages } from '@/lib/shopify/image-search';
import { EnrichmentJob } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Increase max duration for Vercel Pro (60 seconds)
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const job: EnrichmentJob = await request.json();
    
    console.log(`[Worker] Processing product: ${job.productId} - ${job.title}`);
    console.log(`[Worker] Job received at: ${job.receivedAt}, processing started at: ${new Date().toISOString()}`);

    // Step 1: Get fresh product data from Shopify (in case it was updated)
    const product = await getProductById(job.productId);
    
    if (!product) {
      console.error(`[Worker] Product ${job.productId} not found in Shopify`);
      return NextResponse.json(
        { error: 'Product not found', productId: job.productId },
        { status: 404 }
      );
    }

    // Step 2: Double-check if already enriched (race condition protection)
    if (product.tags && product.tags.includes('AI-Enhanced')) {
      console.log(`[Worker] Product ${job.productId} already enriched, skipping`);
      return NextResponse.json(
        { 
          message: 'Product already enriched',
          productId: job.productId,
          skipped: true,
        },
        { status: 200 }
      );
    }

    // Step 3: Generate AI content
    console.log(`[Worker] Generating AI content for product ${job.productId}`);
    
    const enrichedData = await generateProductContent({
      id: parseInt(job.productId),
      title: job.title,
      vendor: job.vendor,
      product_type: job.productType,
      tags: job.tags.join(', '),
      variants: [{
        sku: job.sku,
        price: job.price,
        barcode: '',
      }],
      images: job.hasImages ? [{ src: 'placeholder' }] : [],
      body_html: '',
      handle: '',
      created_at: job.receivedAt,
      updated_at: job.receivedAt,
    });
    
    // Step 4: Format as HTML
    const formattedHtml = formatDescriptionAsHtml(enrichedData);

    // Step 5: Update Shopify product with content
    console.log(`[Worker] Updating Shopify product ${job.productId}`);
    await updateProductWithEnrichedContent(
      parseInt(job.productId),
      enrichedData,
      formattedHtml,
      job.tags.join(', ')
    );

    // Step 6: Search and add images if product has no images
    let imagesAdded = 0;
    
    if (!job.hasImages) {
      console.log(`[Worker] Product ${job.productId} has no images, searching...`);
      
      try {
        const imageResults = await searchProductImages({
          title: job.title,
          vendor: job.vendor,
          sku: job.sku,
          productType: job.productType,
        });

        if (imageResults.length > 0) {
          const imageUrls = imageResults.slice(0, 3).map(r => r.url);
          
          console.log(`[Worker] Found ${imageResults.length} images, adding top ${imageUrls.length}`);
          
          imagesAdded = await addProductImages(
            parseInt(job.productId),
            imageUrls,
            job.title
          );
          
          console.log(`[Worker] Successfully added ${imagesAdded} images`);
        } else {
          console.log(`[Worker] No images found for product ${job.productId}`);
        }
      } catch (imageError) {
        console.error(`[Worker] Image search/upload failed:`, imageError);
        // Don't fail the whole job for image errors
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Worker] Successfully enriched product ${job.productId} in ${duration}ms`);

    return NextResponse.json(
      {
        success: true,
        productId: job.productId,
        productTitle: job.title,
        enrichedFields: ['body_html', 'tags', 'metafields', ...(imagesAdded > 0 ? ['images'] : [])],
        imagesAdded,
        processingTime: `${duration}ms`,
        queueLatency: `${new Date().getTime() - new Date(job.receivedAt).getTime()}ms`,
      },
      { status: 200 }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Worker] Error after ${duration}ms:`, error);
    
    // Return 500 to trigger QStash retry
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: `${duration}ms`,
      },
      { status: 500 }
    );
  }
}

// Wrap handler with QStash signature verification for security
export const POST = verifySignatureAppRouter(handler);

// Health check endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: 'active',
      endpoint: '/api/workers/enrich-product',
      description: 'Product Enrichment Worker (QStash Consumer)',
      security: 'QStash signature verification enabled',
      maxDuration: '60 seconds',
      capabilities: [
        'AI content generation (Claude Opus 4.1)',
        'Shopify product update',
        'Image search and upload',
        'Automatic retries on failure',
      ],
    },
    { status: 200 }
  );
}
