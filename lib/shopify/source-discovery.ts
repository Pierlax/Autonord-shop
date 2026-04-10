/**
 * Source Discovery — Universal RAG v2, Layer 2
 *
 * Costruisce il corpus giusto al volo dai domini whitelisted partendo dai
 * segnali del prodotto (brand, SKU, EAN, produttore, categoria).
 *
 * Invece di una singola query generica, genera query specializzate per
 * ogni DiscoveryIntent: product, manual, part, compatibility, download, support.
 *
 * Questo è il layer che manca nel paper UniversalRAG originale: il paper
 * assume corpora già costruiti; qui li costruiamo al volo.
 */

import { loggers } from '@/lib/logger';
import { cachedSearch, CacheIntent } from './rag-cache';
import { performWebSearch, SearchResult } from './search-client';
import {
  OFFICIAL_BRANDS,
  TRUSTED_RETAILERS,
  EXPERT_REVIEWS,
  TECHNICAL_MANUALS,
} from './rag-sources';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverySignal {
  brand: string;
  productTitle: string;
  sku?: string | null;
  ean?: string | null;
  manufacturer?: string | null;
  category?: string | null;
}

/** Six specialised discovery intents, each with different query templates. */
export type DiscoveryIntent =
  | 'product'        // Scheda prodotto, catalogo, listing
  | 'manual'         // PDF manuali, guide utente
  | 'part'           // Ricambi, esplosi, part number
  | 'compatibility'  // Accessori compatibili, batterie, attacchi
  | 'download'       // Centro download, firmware, software
  | 'support';       // Pagine supporto, FAQ, troubleshooting

export interface DiscoveredSource {
  url: string;
  title: string;
  snippet: string;
  intent: DiscoveryIntent;
  domain: string;
  confidence: number;
  provider: string;
  isPdf: boolean;
  isSupport: boolean;
}

export interface DiscoveryResult {
  sources: DiscoveredSource[];
  byIntent: Partial<Record<DiscoveryIntent, DiscoveredSource[]>>;
  totalFound: number;
  executionTimeMs: number;
  debugLog: string[];
}

// ---------------------------------------------------------------------------
// Query templates per intent
// ---------------------------------------------------------------------------

/**
 * Returns 2-4 search queries per DiscoveryIntent, ordered by expected yield.
 * Shorter queries go first (more results), longer ones as fallback.
 */
const INTENT_QUERIES: Record<DiscoveryIntent, (s: DiscoverySignal) => string[]> = {
  product: (s) => [
    `${s.brand} ${s.productTitle} scheda prodotto`,
    s.sku ? `${s.sku} ${s.brand} prodotto` : `${s.brand} ${s.productTitle} catalogo`,
    `${s.brand} ${s.productTitle} specifiche tecniche`,
  ],
  manual: (s) => [
    `${s.brand} ${s.productTitle} manuale PDF download`,
    s.sku ? `${s.sku} manuale PDF` : `${s.brand} ${s.productTitle} user manual PDF`,
    `${s.brand} ${s.productTitle} istruzioni uso`,
    `${s.brand} ${s.productTitle} instruction manual`,
  ],
  part: (s) => [
    `${s.brand} ${s.productTitle} ricambi esploso`,
    s.sku ? `${s.sku} spare parts exploded view` : `${s.brand} ${s.productTitle} spare parts`,
    `${s.brand} ${s.productTitle} pezzi di ricambio`,
  ],
  compatibility: (s) => [
    `${s.brand} ${s.productTitle} compatibilità accessori`,
    `${s.brand} ${s.productTitle} batterie compatibili`,
    s.sku ? `${s.sku} compatible accessories` : `${s.brand} ${s.productTitle} compatible with`,
    `${s.brand} ${s.productTitle} adattatori sistemi batteria`,
  ],
  download: (s) => [
    `${s.brand} ${s.productTitle} download center`,
    s.sku ? `${s.sku} download` : `${s.brand} ${s.productTitle} download`,
    `${s.brand} ${s.productTitle} software aggiornamento firmware`,
  ],
  support: (s) => [
    `${s.brand} ${s.productTitle} supporto assistenza`,
    `${s.brand} ${s.productTitle} FAQ domande frequenti`,
    `${s.brand} ${s.productTitle} troubleshooting problemi`,
    s.ean ? `${s.ean} supporto` : `${s.brand} ${s.productTitle} help center`,
  ],
};

/** Domain priority per discovery intent (first N used for targeted search). */
const INTENT_DOMAINS: Record<DiscoveryIntent, readonly string[]> = {
  product: [...OFFICIAL_BRANDS, ...TRUSTED_RETAILERS].slice(0, 15),
  manual: [...TECHNICAL_MANUALS, ...OFFICIAL_BRANDS].slice(0, 12),
  part: [...TECHNICAL_MANUALS, ...TRUSTED_RETAILERS].slice(0, 12),
  compatibility: [...OFFICIAL_BRANDS, ...TECHNICAL_MANUALS].slice(0, 12),
  download: [...OFFICIAL_BRANDS].slice(0, 10),
  support: [...OFFICIAL_BRANDS, ...EXPERT_REVIEWS].slice(0, 12),
};

/** CacheIntent mapping per discovery intent. */
const INTENT_CACHE: Record<DiscoveryIntent, CacheIntent> = {
  product: 'specs',
  manual: 'manuals',
  part: 'manuals',
  compatibility: 'specs',
  download: 'manuals',
  support: 'reviews',
};

// ---------------------------------------------------------------------------
// Core discovery function
// ---------------------------------------------------------------------------

/**
 * Discover candidate source URLs for a product.
 *
 * @param signal      - Product identification signals (brand, SKU, EAN, …)
 * @param intents     - Which discovery intents to run (default: product, manual, compatibility)
 * @param maxPerIntent - Max sources to keep per intent (default: 5)
 */
export async function discoverSources(
  signal: DiscoverySignal,
  intents: DiscoveryIntent[] = ['product', 'manual', 'compatibility'],
  maxPerIntent = 5
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const debugLog: string[] = [];
  const allSources: DiscoveredSource[] = [];

  debugLog.push(
    `[SourceDiscovery] Start: ${signal.brand} "${signal.productTitle}" — intents: ${intents.join(', ')}`
  );
  if (signal.sku) debugLog.push(`[SourceDiscovery] SKU=${signal.sku}`);
  if (signal.ean) debugLog.push(`[SourceDiscovery] EAN=${signal.ean}`);
  if (signal.category) debugLog.push(`[SourceDiscovery] Category=${signal.category}`);

  for (const intent of intents) {
    const queries = INTENT_QUERIES[intent](signal);
    const domains = INTENT_DOMAINS[intent];
    const cacheIntent = INTENT_CACHE[intent];
    const intentSources: DiscoveredSource[] = [];

    // Max 2 queries per intent to stay within search quotas
    for (const query of queries.slice(0, 2)) {
      if (intentSources.length >= maxPerIntent) break;

      try {
        const results: SearchResult[] = await cachedSearch(
          query,
          [...domains],
          cacheIntent,
          performWebSearch
        );

        for (const r of results) {
          if (intentSources.length >= maxPerIntent) break;
          intentSources.push(buildDiscoveredSource(r, intent));
        }
      } catch (err) {
        debugLog.push(`[SourceDiscovery] Query failed (intent=${intent}): ${err}`);
      }
    }

    allSources.push(...intentSources);
    debugLog.push(`[SourceDiscovery] intent=${intent}: ${intentSources.length} sources found`);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allSources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  // Group by intent
  const byIntent: Partial<Record<DiscoveryIntent, DiscoveredSource[]>> = {};
  for (const source of deduped) {
    if (!byIntent[source.intent]) byIntent[source.intent] = [];
    byIntent[source.intent]!.push(source);
  }

  const executionTimeMs = Date.now() - startTime;
  debugLog.push(
    `[SourceDiscovery] Complete: ${deduped.length} unique sources in ${executionTimeMs}ms`
  );
  log.info(`[SourceDiscovery] ${deduped.length} sources in ${executionTimeMs}ms`);

  return { sources: deduped, byIntent, totalFound: deduped.length, executionTimeMs, debugLog };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDiscoveredSource(r: SearchResult, intent: DiscoveryIntent): DiscoveredSource {
  const urlLower = r.link.toLowerCase();
  const titleLower = r.title.toLowerCase();
  const snippetLower = r.snippet.toLowerCase();

  const isPdf =
    urlLower.endsWith('.pdf') ||
    titleLower.includes('pdf') ||
    snippetLower.includes('filetype:pdf') ||
    /\bpdf\b/.test(snippetLower);

  const isSupport = /\/(support|assist|faq|help|aiuto|troubleshoot)\b/i.test(urlLower);

  return {
    url: r.link,
    title: r.title,
    snippet: r.snippet,
    intent,
    domain: r.domain,
    confidence: scoreSourceConfidence(r.link, intent, isPdf),
    provider: r.provider,
    isPdf,
    isSupport,
  };
}

function scoreSourceConfidence(url: string, intent: DiscoveryIntent, isPdf: boolean): number {
  const urlLower = url.toLowerCase();
  let score = 0.60;

  // PDF gets a big boost for manual/part intents
  if (isPdf && (intent === 'manual' || intent === 'part')) score = 0.95;
  else if (isPdf) score = 0.88;

  // Official brand domains
  if (OFFICIAL_BRANDS.some((d) => urlLower.includes(d))) score = Math.max(score, 0.90);

  // Technical manual sites
  if (TECHNICAL_MANUALS.some((d) => urlLower.includes(d))) score = Math.max(score, 0.88);

  // Support/download path patterns (URL signal)
  if (/\/(support|download|manuals?|istruzioni|docs?)\//i.test(urlLower))
    score = Math.max(score, 0.85);

  // Trusted retailers
  if (TRUSTED_RETAILERS.some((d) => urlLower.includes(d))) score = Math.max(score, 0.78);

  // Expert review sites
  if (EXPERT_REVIEWS.some((d) => urlLower.includes(d))) score = Math.max(score, 0.80);

  return Math.min(1.0, score);
}

/**
 * Convert a DiscoveredSource to a SearchResult-compatible object so it can be
 * injected directly into the existing UniversalRAG retrieval data maps.
 */
export function discoveredSourceToSearchResult(src: DiscoveredSource): SearchResult {
  return {
    title: src.title,
    link: src.url,
    snippet: src.snippet,
    domain: src.domain,
    // Map back to the closest valid provider value
    provider: src.provider === 'google' || src.provider === 'bing' ? src.provider : 'mock',
  };
}
