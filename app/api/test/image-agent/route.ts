/**
 * Debug endpoint — runs image agent for a product and returns detailed diagnostics.
 * Bypasses the Redis cache so every call does a fresh search.
 *
 * GET /api/test/image-agent?title=...&vendor=...&sku=...&barcode=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { findProductImage } from '@/lib/agents/image-agent-v4';
import { searchProductImages } from '@/lib/shopify/search-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title   = searchParams.get('title')   ?? 'Batteria M18 5.0Ah';
  const vendor  = searchParams.get('vendor')  ?? 'Milwaukee';
  const sku     = searchParams.get('sku')     ?? '4932430483';
  const barcode = searchParams.get('barcode') ?? '4002395381449';

  const startTime = Date.now();

  // --- Step 1: raw GCS image search diagnostic ---
  const gcsTestQuery = `"${vendor}" "${sku}"`;
  const gcsDomains   = ['toolstop.co.uk', 'acmetools.com', 'ohiopowertool.com', 'ffx.co.uk'];

  let rawSearchResults: unknown[] = [];
  let rawSearchError: string | null = null;
  try {
    rawSearchResults = await searchProductImages(gcsTestQuery, gcsDomains, 5);
  } catch (err) {
    rawSearchError = String(err);
  }

  // --- Step 2: full image agent (with cache disabled via unique title suffix) ---
  // Append a timestamp so the cache key is unique each time we test
  const testTitle = `${title} [debug-${Date.now()}]`;
  let agentResult: unknown = null;
  let agentError: string | null = null;
  try {
    agentResult = await findProductImage(testTitle, vendor, sku, barcode);
  } catch (err) {
    agentError = String(err);
  }

  return NextResponse.json({
    query: { title, vendor, sku, barcode },
    rawSearch: {
      query:   gcsTestQuery,
      domains: gcsDomains,
      results: rawSearchResults,
      error:   rawSearchError,
    },
    agentResult,
    agentError,
    totalMs: Date.now() - startTime,
  });
}
