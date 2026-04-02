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
import { syncProductsToShopify, syncSingleProduct, deleteProductBySku } from '@/lib/danea/shopify-sync';
import { triggerAIEnrichment } from '@/lib/danea/enrich-trigger';
import { loggers } from '@/lib/logger';

const log = loggers.sync;

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// Verify sync secret — accepts SYNC_SECRET or CRON_SECRET
function verifySecret(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  // Fail-closed: if neither secret is configured, deny all requests
  if (!secret && !cronSecret) return false;

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const provided = authHeader.slice(7);
    if (secret && provided === secret) return true;
    if (cronSecret && provided === cronSecret) return true;
  }

  // Also check query param for Danea compatibility
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (secret && querySecret === secret) return true;
  if (cronSecret && querySecret === cronSecret) return true;
  return false;
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

  // Early file size check via Content-Length header
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE_BYTES) {
    return new NextResponse('Error: File must be under 50 MB', { status: 413 });
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
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return new NextResponse('Error: File must be under 50 MB', { status: 413 });
        }
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
      supplierCode: string | null;
      barcode: string | null;
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
              supplierCode: product?.supplierCode ?? null,
              barcode: product?.barcode ?? null,
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
        created: 0,
        updated: 0,
        failed: 0,
        deleted: { success: 0, failed: 0 },
        errors: [] as string[],
      };

      // Process updates
      for (const product of parseResult.updatedProducts) {
        const result = await syncSingleProduct(product);
        if (result.success) {
          if (result.action === 'created') results.created++;
          else results.updated++;
          // Track for AI enrichment
          if (result.shopifyId) {
            syncedProducts.push({
              shopifyId: result.shopifyId,
              daneaCode: product.daneaCode,
              supplierCode: product.supplierCode ?? null,
              barcode: product.barcode ?? null,
              title: product.title || product.daneaCode,
              vendor: product.manufacturer || 'Sconosciuto',
              productType: product.category || 'Elettroutensile',
            });
          }
        } else {
          results.failed++;
          if (result.error) results.errors.push(`${product.daneaCode}: ${result.error}`);
        }
      }

      // Process deletions
      for (const sku of parseResult.deletedProductCodes) {
        const deleted = await deleteProductBySku(sku);
        if (deleted) {
          results.deleted.success++;
        } else {
          results.deleted.failed++;
          results.errors.push(`delete:${sku}: not found or error`);
        }
      }

      syncResult = {
        total: parseResult.updatedProducts.length + parseResult.deletedProductCodes.length,
        created: results.created,
        updated: results.updated,
        failed: results.failed + results.deleted.failed,
        skipped: 0,
        results: [],
        errors: results.errors,
      };

      log.info('Incremental sync completed', {
        created: results.created,
        updated: results.updated,
        failed: results.failed,
        deletedOk: results.deleted.success,
        deletedFailed: results.deleted.failed,
      });
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
      const enrichmentPromises = syncedProducts.map((product, index) =>
        triggerAIEnrichment(product, baseUrl, index * 30)
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
    return new NextResponse('Error: An internal error occurred during sync. Check server logs for details.', { status: 500 });
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
