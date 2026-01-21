/**
 * Publish All Products to Online Store
 * 
 * POST /api/sync/publish-all
 * 
 * Publishes all existing Shopify products to the Online Store sales channel.
 * This is a one-time utility to fix products that were created before auto-publish was added.
 * 
 * Requires SYNC_SECRET for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { publishAllProductsToOnlineStore } from '@/lib/danea/shopify-sync';

export async function POST(request: NextRequest) {
  try {
    // Verify SYNC_SECRET if configured
    const syncSecret = process.env.SYNC_SECRET;
    if (syncSecret) {
      const authHeader = request.headers.get('authorization');
      const providedSecret = authHeader?.replace('Bearer ', '');
      
      if (providedSecret !== syncSecret) {
        return NextResponse.json(
          { error: 'Unauthorized - Invalid SYNC_SECRET' },
          { status: 401 }
        );
      }
    }

    console.log('[publish-all] Starting to publish all products to Online Store...');
    
    const result = await publishAllProductsToOnlineStore();
    
    console.log(`[publish-all] Completed: ${result.published} published, ${result.failed} failed`);

    return NextResponse.json({
      success: true,
      message: `Published ${result.published} products to Online Store`,
      published: result.published,
      failed: result.failed,
    });
  } catch (error) {
    console.error('[publish-all] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to publish products',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
