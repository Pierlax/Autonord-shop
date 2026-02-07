/**
 * Danea EasyFatt XML Webhook Endpoint
 * 
 * Receives XML files from Danea EasyFatt via HTTP POST (multipart/form-data).
 * Parses products and syncs them to Shopify.
 * 
 * **V2: After successful sync, automatically queues AI enrichment via QStash.**
 * This means: Danea upload → Shopify sync → AI enrichment (no waiting for cron).
 * 
 * Danea sends: Content-type "multipart/form-data" with field "file"
 * Expected response: "OK" on success, error message on failure
 * 
 * Reference: https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseDaneaXML, isDaneaXML } from '@/lib/danea/xml-parser';
import { syncProductsToShopify, syncSingleProduct } from '@/lib/danea/shopify-sync';
import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';
import { loggers } from '@/lib/logger';

const log = loggers.sync;

// Verify sync secret for security (optional but recommended)
function verifySecret(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // No secret configured, allow all
  
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === secret;
  }
  
  // Also check query param for Danea compatibility
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  return querySecret === secret;
}

// Delete product from Shopify by SKU
async function deleteProductBySku(sku: string): Promise<boolean> {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  
  if (!domain || !token) {
    log.error('Missing Shopify credentials');
    return false;
  }
  
  try {
    // First, find the product by SKU
    const searchUrl = `https://${domain}/admin/api/2024-01/products.json?fields=id,variants&limit=250`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    
    if (!searchResponse.ok) {
      log.error('Failed to search products', { sku });
      return false;
    }
    
    const { products } = await searchResponse.json();
    
    // Find product with matching SKU
    for (const product of products) {
      for (const variant of product.variants || []) {
        if (variant.sku === sku) {
          // Delete the product
          const deleteUrl = `https://${domain}/admin/api/2024-01/products/${product.id}.json`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'X-Shopify-Access-Token': token,
            },
          });
          
          if (deleteResponse.ok) {
            log.info('Product deleted', { sku, productId: product.id });
            return true;
          }
        }
      }
    }
    
    log.warn('Product not found for deletion', { sku });
    return false;
  } catch (error) {
    log.error('Error deleting product', error);
    return false;
  }
}

/**
 * Queue AI enrichment for a successfully synced product.
 * Non-blocking: if QStash fails, the sync is still considered successful.
 */
async function triggerAIEnrichment(
  shopifyId: string,
  daneaCode: string,
  productTitle: string,
  vendor: string,
  productType: string,
  baseUrl: string
): Promise<void> {
  try {
    const job: EnrichmentJob = {
      productId: shopifyId,
      productGid: `gid://shopify/Product/${shopifyId}`,
      title: productTitle || `Prodotto ${daneaCode}`,
      vendor: vendor || 'Sconosciuto',
      sku: daneaCode,
      price: '0',
      productType: productType || 'Elettroutensile',
      tags: ['danea-sync', 'auto-enrich'],
      hasImages: false,
      receivedAt: new Date().toISOString(),
    };

    const result = await queueProductEnrichment(job, baseUrl);
    
    if (result.queued) {
      log.info(`[Danea→AI] Product ${daneaCode} (Shopify: ${shopifyId}) queued for AI enrichment. MessageId: ${result.messageId}`);
    } else {
      log.warn(`[Danea→AI] Failed to queue enrichment for ${daneaCode}: ${result.error}`);
    }
  } catch (error) {
    // Non-blocking: log the error but don't fail the sync
    log.error(`[Danea→AI] Error queuing enrichment for ${daneaCode}:`, error);
  }
}

/**
 * Determine the base URL for QStash callbacks.
 * Uses VERCEL_URL in production, falls back to request origin.
 */
function getBaseUrl(request: NextRequest): string {
  // IMPORTANT: Non usare VERCEL_URL — punta al deployment specifico con Deployment Protection
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  return 'https://autonord-shop.vercel.app';
}

export async function POST(request: NextRequest) {
  log.info('Danea XML webhook received');
  
  // Verify secret
  if (!verifySecret(request)) {
    log.warn('Unauthorized sync attempt');
    return new NextResponse('Unauthorized', { status: 401 });
  }
  
  const baseUrl = getBaseUrl(request);
  
  try {
    let xmlContent: string | null = null;
    
    // Check content type
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Danea sends as multipart/form-data with field "file"
      const formData = await request.formData();
      const file = formData.get('file');
      
      if (file instanceof File) {
        xmlContent = await file.text();
        log.info('Received XML file', { filename: file.name, size: file.size });
      } else if (typeof file === 'string') {
        xmlContent = file;
      }
    } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      // Direct XML body
      xmlContent = await request.text();
    } else {
      // Try to read as text anyway
      xmlContent = await request.text();
    }
    
    if (!xmlContent || xmlContent.trim() === '') {
      log.error('No XML content received');
      return new NextResponse('Error: No XML content received', { status: 400 });
    }
    
    // Verify it's Danea XML format
    if (!isDaneaXML(xmlContent)) {
      log.error('Invalid XML format - not Danea EasyFatt format');
      return new NextResponse('Error: Invalid XML format', { status: 400 });
    }
    
    // Parse the XML
    const parseResult = parseDaneaXML(xmlContent);
    
    log.info('XML parsed successfully', {
      mode: parseResult.mode,
      warehouse: parseResult.warehouse,
      productsCount: parseResult.products.length,
      updatedCount: parseResult.updatedProducts.length,
      deletedCount: parseResult.deletedProductCodes.length,
    });
    
    // Track successfully synced products for AI enrichment
    const syncedProducts: Array<{
      shopifyId: string;
      daneaCode: string;
      title: string;
      vendor: string;
      productType: string;
    }> = [];
    
    let syncResult;
    
    if (parseResult.mode === 'full') {
      // Full sync: sync all products
      if (parseResult.products.length === 0) {
        log.warn('No products to sync in full mode');
        return new NextResponse('OK', { status: 200 });
      }
      
      syncResult = await syncProductsToShopify(parseResult.products, {
        onProgress: (_current, _total, result) => {
          if (result.success && result.shopifyId) {
            const product = parseResult.products.find(p => p.daneaCode === result.daneaCode);
            syncedProducts.push({
              shopifyId: result.shopifyId,
              daneaCode: result.daneaCode,
              title: product?.title || result.daneaCode,
              vendor: product?.manufacturer || 'Sconosciuto',
              productType: product?.category || 'Elettroutensile',
            });
          }
        },
      });
      
    } else {
      // Incremental sync: update and delete
      const results = {
        updated: { success: 0, failed: 0 },
        deleted: { success: 0, failed: 0 },
      };
      
      // Process updates
      for (const product of parseResult.updatedProducts) {
        const result = await syncSingleProduct(product);
        if (result.success) {
          results.updated.success++;
          // Track for AI enrichment
          if (result.shopifyId) {
            syncedProducts.push({
              shopifyId: result.shopifyId,
              daneaCode: product.daneaCode,
              title: product.title || product.daneaCode,
              vendor: product.manufacturer || 'Sconosciuto',
              productType: product.category || 'Elettroutensile',
            });
          }
        } else {
          results.updated.failed++;
        }
      }
      
      // Process deletions
      for (const sku of parseResult.deletedProductCodes) {
        const deleted = await deleteProductBySku(sku);
        if (deleted) {
          results.deleted.success++;
        } else {
          results.deleted.failed++;
        }
      }
      
      syncResult = {
        total: parseResult.updatedProducts.length + parseResult.deletedProductCodes.length,
        created: results.updated.success,
        updated: 0,
        failed: results.updated.failed + results.deleted.failed,
        skipped: 0,
        results: [],
        errors: [] as string[],
      };
      
      log.info('Incremental sync completed', results);
    }
    
    log.info('Sync completed', {
      total: syncResult.total,
      created: syncResult.created,
      updated: syncResult.updated,
      failed: syncResult.failed,
    });
    
    // =========================================================================
    // NEW: Trigger AI enrichment for all successfully synced products
    // =========================================================================
    if (syncedProducts.length > 0) {
      log.info(`[Danea→AI] Triggering AI enrichment for ${syncedProducts.length} synced products...`);
      
      // Queue enrichment for each product (fire-and-forget, non-blocking)
      const enrichmentPromises = syncedProducts.map(product =>
        triggerAIEnrichment(
          product.shopifyId,
          product.daneaCode,
          product.title,
          product.vendor,
          product.productType,
          baseUrl
        )
      );
      
      // Wait for all queuing to complete (but don't fail if some fail)
      const enrichResults = await Promise.allSettled(enrichmentPromises);
      const queued = enrichResults.filter(r => r.status === 'fulfilled').length;
      const failed = enrichResults.filter(r => r.status === 'rejected').length;
      
      log.info(`[Danea→AI] Enrichment queuing complete: ${queued} queued, ${failed} failed`);
    }
    
    // Danea expects "OK" response on success
    if (syncResult.failed === 0) {
      return new NextResponse('OK', { status: 200 });
    } else if (syncResult.created > 0 || syncResult.updated > 0) {
      // Partial success
      return new NextResponse(`OK (${syncResult.failed} errors)`, { status: 200 });
    } else {
      return new NextResponse(`Error: Sync failed - ${syncResult.errors.join(', ')}`, { status: 500 });
    }
    
  } catch (error) {
    log.error('Error processing Danea XML', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new NextResponse(`Error: ${message}`, { status: 500 });
  }
}

// GET endpoint for testing connectivity
export async function GET(request: NextRequest) {
  // Verify secret
  if (!verifySecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Danea EasyFatt XML Sync',
    version: '2.0',
    features: ['sync-to-shopify', 'auto-ai-enrichment'],
    supportedModes: ['full', 'incremental'],
    usage: {
      method: 'POST',
      contentType: 'multipart/form-data',
      field: 'file',
      format: 'Danea EasyFatt XML',
    },
    documentation: '/docs/DANEA_SYNC.md',
  });
}
