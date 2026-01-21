/**
 * Danea Orders Export API Endpoint
 * 
 * GET /api/sync/danea/orders
 * - Exports Shopify orders as CSV for Danea import
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportOrdersToCSV } from '@/lib/danea';
import { getShopifyOrders } from '@/lib/danea/shopify-sync';
import { loggers } from '@/lib/logger';

const log = loggers.sync;

// Verify sync secret for security
function verifySecret(request: NextRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true;
  
  const authHeader = request.headers.get('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  return providedSecret === secret;
}

export async function GET(request: NextRequest) {
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
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') as 'any' | 'open' | 'closed') || 'any';
    const limit = parseInt(url.searchParams.get('limit') || '250', 10);
    const format = url.searchParams.get('format') || 'csv';

    log.info(`Fetching orders from Shopify (status: ${status}, limit: ${limit})`);

    // Get orders from Shopify
    const orders = await getShopifyOrders(status, limit);

    log.info(`Retrieved ${orders.length} orders`);

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        count: orders.length,
        orders,
      });
    }

    // Export as CSV
    const csv = exportOrdersToCSV(orders);

    // Return CSV file
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ordini-shopify-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Orders export error:', error);
    
    return NextResponse.json(
      { 
        error: 'Export Error', 
        message: errorMessage 
      },
      { status: 500 }
    );
  }
}
