/**
 * Search Client - Unified Web Search Engine for RAG Pipeline
 * 
 * Provides a single `performWebSearch()` function that abstracts over
 * multiple search providers with automatic fallback:
 * 
 *   1. SerpAPI (preferred — best snippet quality)
 *   2. Exa.ai (neural search — great for technical content)
 *   3. Google Custom Search (reliable fallback)
 *   4. Mock (dev mode — no API key needed)
 * 
 * The provider is selected automatically based on which API keys are
 * configured in environment variables (via lib/env.ts).
 * 
 * Usage:
 *   import { performWebSearch } from './search-client';
 *   const results = await performWebSearch('Milwaukee M18 FUEL specs', ['milwaukeetool.eu']);
 */

import { optionalEnv } from '@/lib/env';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

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
  provider: 'serpapi' | 'exa' | 'google' | 'mock';
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  maxResults?: number;
  /** Language hint for search (default: 'it' for Italian) */
  language?: string;
  /** Country/region hint (default: 'it') */
  region?: string;
}

type SearchProvider = 'serpapi' | 'exa' | 'google' | 'mock';

// =============================================================================
// PROVIDER DETECTION
// =============================================================================

/**
 * Detects which search provider to use based on available API keys.
 * Priority: SerpAPI > Exa > Google Custom Search > Mock
 */
function detectProvider(): SearchProvider {
  if (optionalEnv.SERPAPI_API_KEY) {
    return 'serpapi';
  }
  if (optionalEnv.EXA_API_KEY) {
    return 'exa';
  }
  if (optionalEnv.GOOGLE_SEARCH_API_KEY && optionalEnv.GOOGLE_SEARCH_CX) {
    return 'google';
  }
  return 'mock';
}

// =============================================================================
// MAIN SEARCH FUNCTION
// =============================================================================

/**
 * Performs a web search using the best available provider.
 * 
 * Supports domain filtering via the `domainFilter` parameter, which
 * restricts results to the specified domains (using `site:` operators
 * for SerpAPI/Google, or `includeDomains` for Exa).
 * 
 * @param query - The search query string
 * @param domainFilter - Optional list of domains to restrict results to
 * @param options - Optional search configuration
 * @returns Array of SearchResult objects
 * 
 * @example
 *   // Search with domain restriction
 *   const results = await performWebSearch(
 *     'Milwaukee M18 FUEL 2767-20 specifications',
 *     ['milwaukeetool.eu', 'milwaukeetool.com', 'acmetools.com']
 *   );
 * 
 *   // Search without domain restriction
 *   const results = await performWebSearch('Milwaukee M18 FUEL review');
 */
export async function performWebSearch(
  query: string,
  domainFilter?: string[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const provider = detectProvider();
  const maxResults = options.maxResults ?? 10;
  const language = options.language ?? 'it';
  const region = options.region ?? 'it';

  log.info(`[SearchClient] Provider: ${provider}, Query: "${query.substring(0, 80)}...", Domains: ${domainFilter?.length || 'all'}`);

  try {
    let results: SearchResult[];

    switch (provider) {
      case 'serpapi':
        results = await searchWithSerpApi(query, domainFilter, maxResults, language, region);
        break;
      case 'exa':
        results = await searchWithExa(query, domainFilter, maxResults);
        break;
      case 'google':
        results = await searchWithGoogle(query, domainFilter, maxResults, language);
        break;
      case 'mock':
      default:
        results = generateMockResults(query, domainFilter, maxResults);
        break;
    }

    log.info(`[SearchClient] Returned ${results.length} results via ${provider}`);
    return results;

  } catch (error) {
    log.error(`[SearchClient] ${provider} search failed:`, error);

    // Attempt fallback to next available provider
    const fallbackResult = await attemptFallback(provider, query, domainFilter, maxResults, language, region);
    if (fallbackResult.length > 0) {
      return fallbackResult;
    }

    // Last resort: return mock results so the pipeline doesn't crash
    log.info('[SearchClient] All providers failed, returning mock results');
    return generateMockResults(query, domainFilter, maxResults);
  }
}

// =============================================================================
// SERPAPI PROVIDER
// =============================================================================

async function searchWithSerpApi(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number,
  language: string,
  region: string
): Promise<SearchResult[]> {
  const apiKey = optionalEnv.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY not configured');

  // Build query with site: operators for domain filtering
  const searchQuery = domainFilter && domainFilter.length > 0
    ? `${query} (${domainFilter.map(d => `site:${d}`).join(' OR ')})`
    : query;

  const params = new URLSearchParams({
    q: searchQuery,
    api_key: apiKey,
    num: String(maxResults),
    hl: language,
    gl: region,
    engine: 'google',
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`SerpAPI HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.organic_results) {
    for (const item of data.organic_results) {
      results.push({
        title: item.title || '',
        link: item.link || '',
        snippet: item.snippet || '',
        domain: extractDomain(item.link || ''),
        provider: 'serpapi',
      });
    }
  }

  return results.slice(0, maxResults);
}

// =============================================================================
// EXA PROVIDER
// =============================================================================

async function searchWithExa(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): Promise<SearchResult[]> {
  const apiKey = optionalEnv.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY not configured');

  const body: Record<string, any> = {
    query,
    type: 'neural',
    useAutoprompt: true,
    numResults: maxResults,
    contents: {
      text: { maxCharacters: 500 },
    },
  };

  // Exa supports includeDomains natively
  if (domainFilter && domainFilter.length > 0) {
    body.includeDomains = domainFilter;
  }

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Exa API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.results) {
    for (const item of data.results) {
      results.push({
        title: item.title || '',
        link: item.url || '',
        snippet: item.text || item.highlight || '',
        domain: extractDomain(item.url || ''),
        provider: 'exa',
      });
    }
  }

  return results.slice(0, maxResults);
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

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);

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
// MOCK PROVIDER (DEV MODE)
// =============================================================================

/**
 * Generates realistic mock results for development/testing.
 * Returns structured data that mimics real search results so the
 * downstream pipeline (adapter, QA) can process them normally.
 */
function generateMockResults(
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number
): SearchResult[] {
  log.info('[SearchClient] Using MOCK provider — set SERPAPI_API_KEY, EXA_API_KEY, or GOOGLE_SEARCH_API_KEY for real results');

  const mockDomains = domainFilter && domainFilter.length > 0
    ? domainFilter
    : ['milwaukeetool.eu', 'acmetools.com', 'protoolreviews.com'];

  const results: SearchResult[] = [];

  for (let i = 0; i < Math.min(maxResults, mockDomains.length); i++) {
    const domain = mockDomains[i % mockDomains.length];
    results.push({
      title: `[MOCK] ${query} — ${domain}`,
      link: `https://${domain}/mock-result-${i + 1}`,
      snippet: `[MOCK DATA] This is a simulated search result for "${query}" from ${domain}. ` +
        `In production, this would contain real product specifications, reviews, or technical data. ` +
        `Configure a search API key (SERPAPI_API_KEY, EXA_API_KEY, or GOOGLE_SEARCH_API_KEY) to enable real web search.`,
      domain,
      provider: 'mock',
    });
  }

  return results;
}

// =============================================================================
// FALLBACK LOGIC
// =============================================================================

/**
 * Attempts to use the next available provider when the primary one fails.
 */
async function attemptFallback(
  failedProvider: SearchProvider,
  query: string,
  domainFilter: string[] | undefined,
  maxResults: number,
  language: string,
  region: string
): Promise<SearchResult[]> {
  const fallbackOrder: SearchProvider[] = ['serpapi', 'exa', 'google'];
  
  for (const provider of fallbackOrder) {
    if (provider === failedProvider) continue;

    try {
      switch (provider) {
        case 'serpapi':
          if (optionalEnv.SERPAPI_API_KEY) {
            log.info(`[SearchClient] Falling back to ${provider}`);
            return await searchWithSerpApi(query, domainFilter, maxResults, language, region);
          }
          break;
        case 'exa':
          if (optionalEnv.EXA_API_KEY) {
            log.info(`[SearchClient] Falling back to ${provider}`);
            return await searchWithExa(query, domainFilter, maxResults);
          }
          break;
        case 'google':
          if (optionalEnv.GOOGLE_SEARCH_API_KEY && optionalEnv.GOOGLE_SEARCH_CX) {
            log.info(`[SearchClient] Falling back to ${provider}`);
            return await searchWithGoogle(query, domainFilter, maxResults, language);
          }
          break;
      }
    } catch (error) {
      log.error(`[SearchClient] Fallback ${provider} also failed:`, error);
    }
  }

  return [];
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
