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
    // Fail-closed auth: deny all if neither SYNC_SECRET nor CRON_SECRET is configured
    const syncSecret = process.env.SYNC_SECRET;
    const cronSecret = process.env.CRON_SECRET;
    if (!syncSecret && !cronSecret) {
      return NextResponse.json({ error: 'Unauthorized - No secret configured' }, { status: 401 });
    }
    const authHeader = request.headers.get('authorization') ?? '';
    const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!(syncSecret && providedSecret === syncSecret) && !(cronSecret && providedSecret === cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized - Invalid secret' }, { status: 401 });
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
