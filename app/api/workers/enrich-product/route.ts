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
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Increase max duration for Vercel Pro (60 seconds)
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const job: EnrichmentJob = await request.json();
    
    // Initialize structured logging
    logger.logEnrichmentStart(job.productId, job.title);
    logger.logStep('job_received', {
      receivedAt: job.receivedAt,
      processingStarted: new Date().toISOString(),
      queueLatency: `${Date.now() - new Date(job.receivedAt).getTime()}ms`,
    });

    // Step 1: Get fresh product data from Shopify (in case it was updated)
    const product = await getProductById(parseInt(job.productId, 10));
    
    if (!product) {
      logger.error(`Product ${job.productId} not found in Shopify`);
      return NextResponse.json(
        { error: 'Product not found', productId: job.productId },
        { status: 404 }
      );
    }

    // Step 2: Double-check if already enriched (race condition protection)
    if (product.tags && product.tags.includes('AI-Enhanced')) {
      logger.logEnrichmentSkipped('Product already has AI-Enhanced tag');
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
    logger.logStep('ai_generation', { vendor: job.vendor, productType: job.productType });
    
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
    logger.logStep('shopify_update');
    await updateProductWithEnrichedContent(
      parseInt(job.productId),
      enrichedData,
      formattedHtml,
      job.tags.join(', ')
    );

    // Step 6: Search and add images if product has no images
    let imagesAdded = 0;
    
    if (!job.hasImages) {
      logger.logStep('image_search', { reason: 'Product has no images' });
      
      try {
        const imageResults = await searchProductImages({
          title: job.title,
          vendor: job.vendor,
          sku: job.sku,
          productType: job.productType,
        });

        if (imageResults.length > 0) {
          const imageUrls = imageResults.slice(0, 3).map(r => r.url);
          
          logger.logStep('image_upload', { found: imageResults.length, uploading: imageUrls.length });
          
          imagesAdded = await addProductImages(
            parseInt(job.productId),
            imageUrls,
            job.title
          );
          
          logger.info(`Successfully added ${imagesAdded} images`);
        } else {
          logger.warn('No images found for product');
        }
      } catch (imageError) {
        logger.error('Image search/upload failed', imageError instanceof Error ? imageError : new Error(String(imageError)));
        // Don't fail the whole job for image errors
      }
    }

    const duration = Date.now() - startTime;
    logger.logEnrichmentComplete(duration, imagesAdded);

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
    logger.logEnrichmentFailed(error instanceof Error ? error : new Error(String(error)), duration);
    
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
