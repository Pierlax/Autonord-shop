/**
 * Danea Sync API Endpoint
 * 
 * POST /api/sync/danea
 * - Accepts CSV file upload from Danea
 * - Parses products and syncs to Shopify
 * - Returns sync results
 * 
 * GET /api/sync/danea
 * - Returns sync status and instructions
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseDaneaCSV, syncProductsToShopify } from '@/lib/danea';
import { loggers } from '@/lib/logger';

const log = loggers.sync;

// Verify sync secret for security
function verifySecret(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // If no secret configured, allow all
  
  const authHeader = request.headers.get('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  return providedSecret === secret;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ready',
    message: 'Danea Sync API',
    endpoints: {
      'POST /api/sync/danea': {
        description: 'Upload CSV file to sync products to Shopify',
        contentType: 'multipart/form-data or text/csv',
        parameters: {
          file: 'CSV file (multipart) or raw CSV content (text/csv)',
          onlyEcommerce: 'boolean - Only sync products marked for e-commerce (default: true)',
        },
        authentication: 'Bearer token in Authorization header (if SYNC_SECRET is configured)',
      },
      'GET /api/sync/danea/orders': {
        description: 'Export Shopify orders as CSV for Danea import',
      },
    },
    requiredEnvVars: [
      'SHOPIFY_SHOP_DOMAIN',
      'SHOPIFY_ADMIN_ACCESS_TOKEN',
    ],
    optionalEnvVars: [
      'SYNC_SECRET - For securing the endpoint',
    ],
  });
}

export async function POST(request: NextRequest) {
  // Verify authentication
  if (!verifySecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing Authorization header' },
      { status: 401 }
    );
  }

  // Check required environment variables
  if (!process.env.SHOPIFY_SHOP_DOMAIN || !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return NextResponse.json(
      { 
        error: 'Configuration Error', 
        message: 'Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN environment variables' 
      },
      { status: 500 }
    );
  }

  try {
    let csvContent: string;
    const contentType = request.headers.get('content-type') || '';

    // Handle different content types
    if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'No file provided' },
          { status: 400 }
        );
      }
      
      csvContent = await file.text();
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      // Raw CSV content
      csvContent = await request.text();
    } else if (contentType.includes('application/json')) {
      // JSON with CSV content
      const body = await request.json();
      csvContent = body.csv || body.content || '';
    } else {
      // Try to read as text
      csvContent = await request.text();
    }

    if (!csvContent || csvContent.trim() === '') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Empty CSV content' },
        { status: 400 }
      );
    }

    log.info('Received Danea sync request');

    // Parse CSV
    const products = parseDaneaCSV(csvContent);
    
    if (products.length === 0) {
      return NextResponse.json(
        { 
          error: 'Parse Error', 
          message: 'No valid products found in CSV. Check column names match Danea format.' 
        },
        { status: 400 }
      );
    }

    log.info(`Parsed ${products.length} products from CSV`);

    // Get options from query params
    const url = new URL(request.url);
    const onlyEcommerce = url.searchParams.get('onlyEcommerce') !== 'false';

    // Sync to Shopify
    const result = await syncProductsToShopify(products, { onlyEcommerce });

    log.info(`Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Sync completed successfully`,
      summary: {
        total: result.total,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Danea sync error:', error);
    
    return NextResponse.json(
      { 
        error: 'Sync Error', 
        message: errorMessage 
      },
      { status: 500 }
    );
  }
}
