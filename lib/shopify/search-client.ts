/**
 * Search Client - Unified Web Search Engine for RAG Pipeline
 *
 * Provides a single `performWebSearch()` function that abstracts over
 * multiple search providers with automatic fallback:
 *
 *   1. Google Custom Search (if GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX configured)
 *   2. Bing HTML scraping (free — no API key required)
 *   3. Mock (dev mode — no API key needed)
 *
 * SerpAPI and Exa have been removed (free plan limits exhausted).
 *
 * Usage:
 *   import { performWebSearch } from './search-client';
 *   const results = await performWebSearch('Milwaukee M18 FUEL specs', ['milwaukeetool.eu']);
 */

import { optionalEnv } from '@/lib/env';
import { loggers } from '@/lib/logger';
import { CircuitBreaker } from '@/lib/circuit-breaker';

const log = loggers.shopify;

// D1 fix: Circuit breakers for search providers.
// Bing scraping is fragile (HTML layout changes, geo-blocks, rate limits).
// Without a breaker, a down Bing provider wastes 10s per search call across
// every product in a batch before falling to mock.  With the breaker, after
// 3 consecutive failures the circuit opens and we skip straight to mock for
// 60 seconds, then probe once to see if it's back.
const bingBreaker = new CircuitBreaker('bing-search', { threshold: 3, resetMs: 60_000 });
const googleBreaker = new CircuitBreaker('google-search', { threshold: 3, resetMs: 120_000 });
const ddgBreaker = new CircuitBreaker('ddg-search', { threshold: 3, resetMs: 60_000 });

// =============================================================================
// TYPES
// =============================================================================

export interface SearchResult {
  /** Page title */
  title: string;
  /** Full URL of the result */
  link: string;
  /** Text snippet / description */
  snippet: string;
  /** Domain of the result (e.g., 'milwaukeetool.eu') */
  domain: string;
  /** Which search provider returned this result */
  provider: 'google' | 'bing' | 'ddg' | 'mock';
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  maxResults?: number;
  /** Language hint for search (default: 'it' for Italian) */
  language?: string;
  /** Country/region hint (default: 'it') */
  region?: string;
}

type SearchProvider = 'google' | 'bing' | 'ddg' | 'mock';

// =============================================================================
// PROVIDER DETECTION
// =============================================================================

/**
 * Detects which search provider to use based on available API keys.
 * Priority: Google Custom Search > Bing scraping > Mock
 */
function detectProvider(): SearchProvider {
  if (optionalEnv.GOOGLE_SEARCH_API_KEY && optionalEnv.GOOGLE_SEARCH_CX) {
    return 'google';
  }
  // Bing scraping is always available — no API key required
  return 'bing';
}

// =============================================================================
// GOOGLE CSE DAILY QUOTA TRACKER (100 free queries/day)
// =============================================================================

async function checkGoogleQuota(): Promise<boolean> {
  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return true; // no Redis — allow (graceful degradation)

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key   = `cse:count:${today}`;

  try {
    const incrRes = await fetch(`${redisUrl}/incr/${key}`, {
      headers: { Authorization: `Bearer ${redisToken}` },
      signal: AbortSignal.timeout(3_000),
    });
    if (!incrRes.ok) return true; // Redis error — allow
    const data = await incrRes.json() as { result?: number };
    const count = data.result ?? 0;

    if (count === 1) {
      // First use today — set 25-hour TTL so the key expires after the day rolls over
      await fetch(`${redisUrl}/expire/${key}/90000`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(3_000),
      }).catch(() => {/* fire-and-forget */});
    }

    if (count > 100) {
      log.warn(`[SearchClient] Google CSE daily quota exhausted (${count}/100) — falling back to Bing`);
      return false; // quota exceeded
    }
    return true; // within quota
  } catch {
    return true; // network error — allow
  }
}

// =============================================================================
// MAIN SEARCH FUNCTION
// =============================================================================

/**
 * Performs a web search using the best available provider.
 *
 * Supports domain filtering via the `domainFilter` parameter, which
 * restricts results to the specified domains (using `site:` operators).
 *
 * @param query - The search query string
 * @param domainFilter - Optional list of domains to restrict results to
 * @param options - Optional search configuration
 * @returns Array of SearchResult objects
 */
export async function performWebSearch(
  query: string,
  domainFilter?: string[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const provider = detectProvider();
  const maxResults = options.maxResults ?? 10;
  const language = options.language ?? 'it';

  log.info(`[SearchClient] Provider: ${provider}, Query: "${query.substring(0, 80)}...", Domains: ${domainFilter?.length || 'all'}`);

  // Try Google Custom Search first (if configured) — D1: circuit-breaker protected
  if (optionalEnv.GOOGLE_SEARCH_API_KEY && optionalEnv.GOOGLE_SEARCH_CX) {
    try {
      const results = await googleBreaker.execute(
        () => searchWithGoogle(query, domainFilter, maxResults, language),
        async () => [],  // fallback: empty → drops to Bing below
      );
      if (results.length > 0) {
        log.info(`[SearchClient] Returned ${results.length} results via google`);
        return results;
      }
    } catch (error) {
      log.error('[SearchClient] Google Custom Search failed:', error);
    }
  }

  // Bing HTML scraping — free, no API key required — D1: circuit-breaker protected
  try {
    const results = await bingBreaker.execute(
      async () => {
        const r = await searchWithBing(query, domainFilter, maxResults);
        if (r.length === 0) {
          // Treat 0 results as a failure signal for the circuit breaker —
          // Bing returning nothing usually means HTML layout changed or geo-block
          throw new Error('Bing returned 0 results');
        }
        return r;
      },
      async () => [],  // fallback: empty → drops to mock below
    );
    if (results.length > 0) {
      log.info(`[SearchClient] Returned ${results.length} results via bing`);
      return results;
    }
  } catch (error) {
    log.error('[SearchClient] Bing search failed:', error);
  }

  // C1 fix: DuckDuckGo Lite as third fallback — simpler HTML, more stable than Bing
  try {
    const results = await ddgBreaker.execute(
      async () => {
        const r = await searchWithDuckDuckGo(query, domainFilter, maxResults);
        if (r.length === 0) throw new Error('DDG returned 0 results');
        return r;
      },
      async () => [],
    );
    if (results.length > 0) {
      log.info(`[SearchClient] Returned ${results.length} results via ddg`);
      return results;
    }
  } catch (error) {
    log.error('[SearchClient] DuckDuckGo search failed:', error);
  }

  // Last resort: mock results so the pipeline never crashes
  log.info('[SearchClient] All providers failed, returning mock results');
  return generateMockResults(query, domainFilter, maxResults);
}

// =============================================================================
// GOOGLE CUSTOM SEARCH PROVIDER
// =============================================================================

async function searchWithGoogle(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number,
  language: string
): Promise<SearchResult[]> {
  const apiKey = optionalEnv.GOOGLE_SEARCH_API_KEY;
  const cx = optionalEnv.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) throw new Error('GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX not configured');

  // Build query with site: operators for domain filtering
  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  // Google Custom Search API allows max 10 results per request
  const num = Math.min(maxResults, 10);

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: searchQuery,
    num: String(num),
    lr: `lang_${language}`,
  });

  if (!(await checkGoogleQuota())) {
    // Quota exhausted — caller will fall back to Bing
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Google Custom Search HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.items) {
    for (const item of data.items) {
      results.push({
        title: item.title || '',
        link: item.link || '',
        snippet: item.snippet || '',
        domain: extractDomain(item.link || ''),
        provider: 'google',
      });
    }
  }

  return results.slice(0, maxResults);
}

// =============================================================================
// BING HTML SCRAPING (FREE — no API key)
// =============================================================================

/**
 * Fetches Bing search results by scraping the HTML response.
 * No API key required. Results may be less rich than Google CSE but
 * are completely free and reliable for technical product queries.
 */
async function searchWithBing(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): Promise<SearchResult[]> {
  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  const params = new URLSearchParams({
    q: searchQuery,
    count: String(Math.min(maxResults * 2, 20)),
    setlang: 'IT',
    cc: 'IT',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const response = await fetch(`https://www.bing.com/search?${params.toString()}`, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Bing search HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // D1 fix: Bing health check — detect DOM structure changes before parsing.
  // If the HTML contains Bing's results container (#b_results) but our regex
  // can't find any <li class="b_algo"> blocks, the DOM has changed silently.
  const hasResultsContainer = html.includes('id="b_results"') || html.includes('class="b_results"');
  const resultBlocks: string[] = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];

  if (hasResultsContainer && resultBlocks.length === 0) {
    // Bing returned a results page but our parser couldn't extract anything.
    // Try alternative selectors that Bing has used in past DOM updates.
    const altBlocks = html.match(/<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?<\/li>/g) || [];
    if (altBlocks.length === 0) {
      log.error(
        `[SearchClient] BING HEALTH CHECK FAILED: Results container found but 0 results parsed. ` +
        `Bing may have changed its DOM structure. HTML length: ${html.length}, ` +
        `contains b_algo class: ${html.includes('b_algo')}, ` +
        `contains <h2>: ${html.includes('<h2>')}`
      );
      // Return empty — caller will fall back to mock + log the 0-result warning
      return results;
    }
    // Alternative selector worked — use it instead
    resultBlocks.push(...altBlocks);
  }

  for (const block of resultBlocks) {
    if (results.length >= maxResults) break;

    // Extract URL — C1: multi-pattern for resilience against Bing DOM changes.
    // Accepts <h2> or <h3> (Bing has used both), plus a generic class-based fallback.
    const linkMatch = block.match(/<h[23]><a[^>]+href="(https?:\/\/[^"]+)"/)
      ?? block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*tilk[^"]*"/)
      ?? block.match(/<a[^>]+href="(https?:\/\/(?!www\.bing\.com)[^"]+)"[^>]*>/);
    if (!linkMatch) continue;
    const link = linkMatch[1];
    if (!link.startsWith('http')) continue;

    // Extract title — C1: accept <h2> or <h3>, plus generic first-link text fallback
    const titleMatch = block.match(/<h[23]><a[^>]+>([^<]+)<\/a>/)
      ?? block.match(/<a[^>]+>([^<]{5,})<\/a><\/h[23]>/)
      ?? block.match(/<a[^>]+href="[^"]*"[^>]*>([^<]{5,})<\/a>/);
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

    // Extract snippet — try multiple class patterns
    const snippetMatch = block.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/)
      ?? block.match(/<p[^>]*class="[^"]*b_paractl[^"]*"[^>]*>([\s\S]*?)<\/p>/)
      ?? block.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
      : '';

    results.push({
      title,
      link,
      snippet,
      domain: extractDomain(link),
      provider: 'bing',
    });
  }

  // D1 fix: Log health metric — ratio of parsed results to detected blocks
  if (resultBlocks.length > 0 && results.length === 0) {
    log.error(
      `[SearchClient] BING PARSE DEGRADED: ${resultBlocks.length} blocks found but 0 valid results extracted. ` +
      `Link/title parsing may need updating.`
    );
  }

  return results;
}

// =============================================================================
// DUCKDUCKGO LITE PROVIDER (C1 — third fallback, simpler HTML than Bing)
// =============================================================================

/**
 * C1 fix: DuckDuckGo Lite as resilient third-tier fallback.
 *
 * lite.duckduckgo.com renders a simple table-based layout that's far more
 * stable than Bing's complex DOM.  DDG Lite has barely changed its markup
 * since 2015, making it an excellent long-term scraping target.
 *
 * Fallback chain: Google CSE → Bing → DuckDuckGo Lite → Mock
 */
async function searchWithDuckDuckGo(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): Promise<SearchResult[]> {
  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  const body = new URLSearchParams({ q: searchQuery, kl: 'it-it' });

  const response = await fetch('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`DDG Lite HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // DDG Lite uses a simple table layout:
  //   <a class="result-link" href="URL">TITLE</a>
  //   <td class="result-snippet">SNIPPET</td>
  //
  // Three patterns tried for resilience (same approach as sentiment.ts):
  const PATTERNS = [
    // Primary: DDG Lite standard layout
    /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
    // Alternative: looser class matching
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result[^"]*"[^>]*>([^<]+)<\/a>/g,
  ];

  // Try patterns in order — use the first one that yields results
  let matches: Array<{ url: string; title: string }> = [];
  for (const pattern of PATTERNS) {
    const found: Array<{ url: string; title: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const url = m[1];
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        found.push({ url, title: m[2] });
      }
    }
    if (found.length > 0) {
      matches = found;
      break;
    }
  }

  // Extract snippets separately (they follow the links in table cells)
  const snippetPattern = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/g;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetPattern.exec(html)) !== null) {
    snippets.push(sm[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim());
  }

  for (let i = 0; i < Math.min(matches.length, maxResults); i++) {
    const { url, title } = matches[i];
    results.push({
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      link: url,
      snippet: snippets[i] || '',
      domain: extractDomain(url),
      provider: 'ddg',
    });
  }

  return results;
}

// =============================================================================
// MOCK PROVIDER (LAST RESORT)
// =============================================================================

/**
 * Generates realistic mock results when all providers fail.
 * Returns structured data that mimics real search results so the
 * downstream pipeline can process them without crashing.
 */
function generateMockResults(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): SearchResult[] {
  log.info('[SearchClient] Using MOCK provider — configure GOOGLE_SEARCH_API_KEY for real results');

  const mockDomains = domainFilter && domainFilter.length > 0
    ? domainFilter
    : ['toolstop.co.uk', 'acmetools.com', 'protoolreviews.com'];

  const results: SearchResult[] = [];

  for (let i = 0; i < Math.min(maxResults, mockDomains.length); i++) {
    const domain = mockDomains[i % mockDomains.length];
    results.push({
      title: `[MOCK] ${query} — ${domain}`,
      link: `https://${domain}/mock-result-${i + 1}`,
      snippet: `[MOCK DATA] Simulated result for "${query}" from ${domain}. Configure GOOGLE_SEARCH_API_KEY for real web search.`,
      domain,
      provider: 'mock',
    });
  }

  return results;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extracts the domain from a URL string.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Returns the currently active search provider name.
 * Useful for logging and debugging.
 */
export function getActiveProvider(): SearchProvider {
  return detectProvider();
}

/**
 * Checks if a real (non-mock) search provider is available.
 */
export function isRealSearchAvailable(): boolean {
  return detectProvider() !== 'mock';
}

// =============================================================================
// IMAGE SEARCH
// =============================================================================

/**
 * Result from a direct image search.
 * Unlike SearchResult (which returns page URLs), this returns actual image file URLs.
 */
export interface ImageSearchResult {
  /** Direct URL to the image file (.jpg/.png/.webp) */
  imageUrl: string;
  /** Product page where the image was found */
  sourcePageUrl: string;
  /** Domain of the source page */
  domain: string;
  /** Image width in pixels (if available) */
  width?: number;
  /** Image height in pixels (if available) */
  height?: number;
  /** Which search provider returned this result */
  provider: 'google' | 'bing';
}

/**
 * Searches for product images using the best available image search provider.
 *
 * Unlike `performWebSearch` which returns page URLs, this function returns
 * direct image file URLs (.jpg, .png, .webp) ready to be used as Shopify image sources.
 *
 * Supported providers:
 * - Google Custom Search: uses `searchType=image` → returns image URLs
 * - Bing image search: free HTML scraping — no API key required
 *
 * @param query      - Product search query (e.g., "Milwaukee M18 FUEL 4933464590")
 * @param domainFilter - Optional list of domains to restrict image search to
 * @param maxResults - Maximum number of image results (default: 5)
 */
export async function searchProductImages(
  query: string,
  domainFilter?: string[],
  maxResults: number = 5
): Promise<ImageSearchResult[]> {
  // Try Google Custom Search with image mode (if configured) — D1: circuit-breaker
  if (optionalEnv.GOOGLE_SEARCH_API_KEY && optionalEnv.GOOGLE_SEARCH_CX) {
    try {
      const results = await googleBreaker.execute(
        () => searchImagesWithGoogle(query, domainFilter, maxResults),
        async () => [],
      );
      if (results.length > 0) {
        log.info(`[SearchClient] Image search: ${results.length} results via google`);
        return results;
      }
    } catch (e) {
      log.error('[SearchClient] Google image search failed:', e);
    }
  }

  // Free fallback: Bing image search HTML scraping — D1: circuit-breaker
  try {
    const results = await bingBreaker.execute(
      () => searchImagesWithBing(query, domainFilter, maxResults),
      async () => [],
    );
    if (results.length > 0) {
      log.info(`[SearchClient] Image search: ${results.length} results via bing-scrape`);
      return results;
    }
  } catch (e) {
    log.error('[SearchClient] Bing image scraping failed:', e);
  }

  log.info('[SearchClient] No image search provider returned results');
  return [];
}

/**
 * Free Bing image search fallback — no API key required.
 *
 * Fetches Bing Images HTML and extracts full image URLs from the embedded JSON
 * blobs in `<a class="iusc">` anchor `m` attributes.
 * Format: m={"murl":"https://...","turl":"...","t":"..."}
 *
 * Domain filtering is achieved via site: operators in the query.
 */
export async function searchImagesWithBing(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): Promise<ImageSearchResult[]> {
  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  const params = new URLSearchParams({
    q: searchQuery,
    form: 'HDRSC2',
    first: '1',
    count: String(Math.min(maxResults * 3, 30)), // fetch extra to account for filtering
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(`https://www.bing.com/images/search?${params.toString()}`, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Bing image search HTTP ${response.status}`);
  }

  const rawHtml = await response.text();

  // Bing encodes JSON data with HTML entities (&quot; → "). Decode first.
  const html = rawHtml
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");

  const results: ImageSearchResult[] = [];

  // Extract full image URLs from Bing's embedded JSON blobs
  // Each <a class="iusc"> has m={"murl":"https://...","turl":"...","purl":"page_url",...}
  const murlRegex = /"murl":"(https?:[^"]+)"/g;
  const linkRegex = /"purl":"(https?:[^"]+)"/g;
  const murlMatches: RegExpExecArray[] = [];
  const purlMatches: RegExpExecArray[] = [];
  let _m: RegExpExecArray | null;
  while ((_m = murlRegex.exec(html)) !== null) murlMatches.push(_m);
  while ((_m = linkRegex.exec(html)) !== null) purlMatches.push(_m);

  for (let i = 0; i < murlMatches.length && results.length < maxResults; i++) {
    const imageUrl = murlMatches[i][1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const pageUrl = purlMatches[i] ? purlMatches[i][1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : '';
    if (!imageUrl.startsWith('http')) continue;
    results.push({
      imageUrl,
      sourcePageUrl: pageUrl,
      domain: extractDomain(pageUrl || imageUrl),
      provider: 'bing',
    });
  }

  return results;
}

async function searchImagesWithGoogle(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): Promise<ImageSearchResult[]> {
  const apiKey = optionalEnv.GOOGLE_SEARCH_API_KEY;
  const cx = optionalEnv.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) throw new Error('Google Custom Search not configured');

  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: searchQuery,
    searchType: 'image',
    num: String(Math.min(maxResults, 10)),
    imgType: 'photo',
    imgSize: 'large',
  });

  if (!(await checkGoogleQuota())) {
    // Quota exhausted — caller will fall back to Bing
    return [];
  }

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Google Custom Search Images HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results: ImageSearchResult[] = [];

  if (data.items) {
    for (const item of data.items) {
      if (!item.link) continue;
      results.push({
        imageUrl: item.link,
        sourcePageUrl: item.image?.contextLink || '',
        domain: extractDomain(item.image?.contextLink || item.link),
        width: item.image?.width,
        height: item.image?.height,
        provider: 'google',
      });
      if (results.length >= maxResults) break;
    }
  }

  return results;
}
