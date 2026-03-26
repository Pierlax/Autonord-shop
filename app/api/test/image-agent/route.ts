/**
 * Debug endpoint — runs image agent for a product and returns detailed diagnostics.
 * Bypasses the Redis cache so every call does a fresh search.
 *
 * GET /api/test/image-agent?title=...&vendor=...&sku=...&barcode=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { findProductImage } from '@/lib/agents/image-agent-v4';
import { searchProductImages, searchImagesWithBing } from '@/lib/shopify/search-client';

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

  // --- Step 1: raw GCS image search diagnostic — test 3 query strategies ---
  const euDomains = ['toolstop.co.uk', 'ffx.co.uk', 'rotopino.it', 'fixami.it', 'contorion.de'];

  const rawSearches: Record<string, unknown> = {};
  for (const q of [
    `"${vendor}" "${sku}"`,
    `${vendor} ${title}`,
    `Milwaukee M18 5.0Ah battery`,
  ]) {
    try {
      rawSearches[q] = await searchProductImages(q, euDomains, 5);
    } catch (err) {
      rawSearches[q] = { error: String(err) };
    }
  }

  // --- Step 1b: Bing image search direct with exact broad-fallback query ---
  // Simulates what searchGCSImageDirect broad fallback actually does
  const normalizedBrand = vendor.split(' ')[0]; // simple normalization
  const titleWords = title
    .replace(new RegExp(vendor, 'gi'), '')
    .split(/[\s\-\/,\[\]]+/)
    .filter((w: string) => w.length >= 3 && !/^(per|con|the|and|kit|set|pro|new|da|di|il|la|le|debug)$/i.test(w))
    .slice(0, 4);
  const broadQuery = `"${normalizedBrand}" ${titleWords.join(' ')}`;

  let bingDirect: unknown = null;
  try {
    const rawResults = await searchImagesWithBing(broadQuery, undefined, 8);
    // Simulate the filters applied in the broad fallback
    const filtered = rawResults.map((r: {imageUrl: string; domain: string}) => {
      const lower = r.imageUrl.toLowerCase();
      const blocked = lower.includes('amazon.') || lower.includes('ebay.') || lower.includes('facebook.');
      const invalidExt = lower.endsWith('.svg');
      const noImage = lower.includes('no-image') || lower.includes('placeholder');
      const defaultFilter = /(?:^|[/_-])default(?:[-_.]|$)/.test(lower);
      const editorial = lower.includes('/blog/') || lower.includes('/news/') || lower.includes('/post/');
      const rejected = blocked || invalidExt || noImage || defaultFilter || editorial;
      return { imageUrl: r.imageUrl.slice(0, 90), domain: r.domain, rejected, reason: rejected ? (blocked?'blocked':invalidExt?'svg':noImage?'noimage':defaultFilter?'default':editorial?'editorial':'?') : null };
    });
    bingDirect = { query: broadQuery, total: rawResults.length, filtered };
  } catch (err) {
    bingDirect = { error: String(err) };
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
      domains: euDomains,
      queries: rawSearches,
    },
    bingDirect,
    agentResult,
    agentError,
    totalMs: Date.now() - startTime,
  });
}
