/**
 * Debug endpoint — runs image agent for a product and returns detailed diagnostics.
 * Bypasses the Redis cache so every call does a fresh search.
 *
 * GET /api/test/image-agent?title=...&vendor=...&sku=...&barcode=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { findProductImage } from '@/lib/agents/image-agent-v4';
import { searchProductImages, searchImagesWithBing } from '@/lib/shopify/search-client';
import { UniversalRAGPipeline } from '@/lib/shopify/universal-rag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title   = searchParams.get('title')   ?? 'Batteria M18 5.0Ah';
  const vendor  = searchParams.get('vendor')  ?? 'Milwaukee';
  const sku     = searchParams.get('sku')     ?? '4932430483';
  const barcode = searchParams.get('barcode') ?? '4002395381449';
  // Optional: pass explicit ragPageUrls to test STEP 1.5 directly (comma-separated)
  const ragPageUrlsParam = searchParams.get('ragPageUrls');
  const explicitRagPageUrls = ragPageUrlsParam
    ? ragPageUrlsParam.split(',').map(u => u.trim()).filter(Boolean)
    : null;

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

  // --- Step 1c: Bing image search with compact model code (no spaces) ---
  // Tests the new broad-fallback query added in fix commit 19f2fd7
  const mpnMatch = title.replace(new RegExp(vendor, 'gi'), '').match(/\b((?:M12|M18|M28)\s*[A-Z]{2,}[A-Z0-9\-]*)/i);
  const compactCode = mpnMatch ? mpnMatch[1].replace(/\s+/g, '') : null;
  let bingCompact: unknown = null;
  if (compactCode) {
    const compactQuery = `"${normalizedBrand}" "${compactCode}"`;
    try {
      const compactResults = await searchImagesWithBing(compactQuery, undefined, 8);
      bingCompact = {
        query: compactQuery,
        total: compactResults.length,
        results: compactResults.slice(0, 5).map((r: {imageUrl: string; domain: string; sourcePageUrl?: string}) => ({
          imageUrl: r.imageUrl.slice(0, 100),
          domain: r.domain,
          sourcePageUrl: (r.sourcePageUrl || '').slice(0, 100),
          hasExtension: /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(r.imageUrl),
        })),
      };
    } catch (err) {
      bingCompact = { query: compactCode, error: String(err) };
    }
  } else {
    bingCompact = { note: 'No compact model code found in title' };
  }

  // --- Step 2: RAG discovery → extract ragPageUrls (skip if explicit URLs provided) ---
  let ragPageUrls: string[] = explicitRagPageUrls ?? [];
  let ragDiscovery: unknown = null;

  if (!explicitRagPageUrls) {
    try {
      const ragPipeline = new UniversalRAGPipeline({ maxSources: 3, maxTokenBudget: 2000, timeoutMs: 20000 });
      const ragResult = await ragPipeline.enrichProduct(title, vendor, vendor, sku || '', 'specs');
      ragPageUrls = ragResult.ragPageUrls ?? [];
      ragDiscovery = {
        success: ragResult.success,
        ragPageUrls,
        v2DiscoverySources: ragResult.v2?.discoverySourceCount ?? 0,
        note: 'auto-discovered via RAG',
      };
    } catch (err) {
      ragDiscovery = { error: String(err) };
    }
  } else {
    ragDiscovery = {
      ragPageUrls: explicitRagPageUrls,
      note: 'explicitly provided via ?ragPageUrls=',
    };
  }

  // --- Step 3: full image agent with ragPageUrls (cache disabled via unique title suffix) ---
  // Append a timestamp so the cache key is unique each time we test
  const testTitle = `${title} [debug-${Date.now()}]`;
  let agentResult: unknown = null;
  let agentError: string | null = null;
  try {
    agentResult = await findProductImage(testTitle, vendor, sku, barcode, ragPageUrls);
  } catch (err) {
    agentError = String(err);
  }

  return NextResponse.json({
    query: { title, vendor, sku, barcode },
    ragDiscovery,
    rawSearch: {
      domains: euDomains,
      queries: rawSearches,
    },
    bingDirect,
    bingCompact,
    agentResult,
    agentError,
    totalMs: Date.now() - startTime,
  });
}
