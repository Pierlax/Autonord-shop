/**
 * RAG Sources - Whitelisted Sector-Specific Sources
 * 
 * Centralized configuration of trusted domains for product enrichment.
 * Each category serves a specific purpose in the RAG pipeline:
 * 
 * - OFFICIAL_BRANDS: Manufacturer sites for specs, datasheets, warranty info
 * - TRUSTED_RETAILERS: High-quality product photos and detailed descriptions
 * - EXPERT_REVIEWS: Real-world pro/con analysis from power tool experts
 * - TECHNICAL_MANUALS: Exploded views, part numbers, obscure specifications
 * 
 * Usage:
 *   import { buildSourceQuery, getDomainsForIntent, RAG_SOURCES } from './rag-sources';
 *   const query = buildSourceQuery('specs', 'Milwaukee M18 FUEL');
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// =============================================================================
// SOURCE DOMAIN LISTS (EXACT as specified - do NOT invent others)
// =============================================================================

/**
 * Official brand manufacturer websites.
 * Best for: technical specifications, datasheets, warranty info, official images.
 */
export const OFFICIAL_BRANDS: readonly string[] = [
  'milwaukeetool.eu',
  'milwaukeetool.it',
  'milwaukeetool.com',
  'makita.it',
  'makita.com',
  'makitauk.com',
  'dewalt.it',
  'dewalt.com',
  'dewalt.co.uk',
  'bosch-professional.com',
  'festool.it',
  'festool.com',
  'metabo.com',
  'hikoki-powertools.it',
] as const;

/**
 * Trusted retailers with excellent product photos and descriptions.
 * Best for: high-resolution images, detailed product descriptions, pricing.
 */
export const TRUSTED_RETAILERS: readonly string[] = [
  'acmetools.com',
  'toolstop.co.uk',
  'ffx.co.uk',
  'powertoolworld.co.uk',
  'lawson-his.co.uk',
  'ohiopowertool.com',
  'toolnut.com',
  'rotopino.it',
  'fixami.it',
  'manomano.it',
] as const;

/**
 * Expert review sites with real-world pro/con analysis.
 * Best for: honest reviews, field tests, comparison articles.
 */
export const EXPERT_REVIEWS: readonly string[] = [
  'protoolreviews.com',
  'toolguyd.com',
  'workshopaddict.com',
  'coptool.com',
  'toolsinaction.com',
] as const;

/**
 * Technical manual and parts databases.
 * Best for: exploded views, part numbers, obscure specifications, replacement parts.
 */
export const TECHNICAL_MANUALS: readonly string[] = [
  'ereplacementparts.com',
  'manualslib.com',
  'toolpartspro.com',
  'mmtoolparts.com',
] as const;

// =============================================================================
// COMBINED & CATEGORIZED EXPORTS
// =============================================================================

/**
 * All RAG sources organized by category.
 */
export const RAG_SOURCES = {
  officialBrands: OFFICIAL_BRANDS,
  trustedRetailers: TRUSTED_RETAILERS,
  expertReviews: EXPERT_REVIEWS,
  technicalManuals: TECHNICAL_MANUALS,
} as const;

/**
 * All whitelisted domains in a flat array.
 */
export const ALL_WHITELISTED_DOMAINS: readonly string[] = [
  ...OFFICIAL_BRANDS,
  ...TRUSTED_RETAILERS,
  ...EXPERT_REVIEWS,
  ...TECHNICAL_MANUALS,
] as const;

// =============================================================================
// SEARCH INTENT TYPES
// =============================================================================

/**
 * The intent of the search determines which source categories are prioritized.
 */
export type SearchIntent = 'specs' | 'reviews' | 'manuals' | 'images';

/**
 * Maps each intent to the domain categories that are most relevant.
 * Primary sources are searched first; secondary sources are used as fallback.
 */
const INTENT_DOMAIN_MAPPING: Record<SearchIntent, {
  primary: readonly string[];
  secondary: readonly string[];
  description: string;
}> = {
  specs: {
    primary: OFFICIAL_BRANDS,
    secondary: TRUSTED_RETAILERS,
    description: 'Technical specifications, datasheets, voltage, torque, weight',
  },
  reviews: {
    primary: EXPERT_REVIEWS,
    secondary: TRUSTED_RETAILERS,
    description: 'Real-world reviews, pro/con analysis, field tests',
  },
  manuals: {
    primary: TECHNICAL_MANUALS,
    secondary: OFFICIAL_BRANDS,
    description: 'User manuals, exploded views, part numbers, replacement parts',
  },
  images: {
    primary: TRUSTED_RETAILERS,
    secondary: OFFICIAL_BRANDS,
    description: 'High-quality product images, catalog photos',
  },
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Returns the list of domains relevant for a given search intent.
 * 
 * @param intent - The purpose of the search ('specs', 'reviews', 'manuals', 'images')
 * @param includeSecondary - Whether to include secondary/fallback domains (default: true)
 * @returns Array of domain strings
 * 
 * @example
 *   getDomainsForIntent('specs')
 *   // → ['milwaukeetool.eu', 'milwaukeetool.it', ..., 'acmetools.com', ...]
 */
export function getDomainsForIntent(
  intent: SearchIntent,
  includeSecondary: boolean = true
): string[] {
  const mapping = INTENT_DOMAIN_MAPPING[intent];
  if (!mapping) {
    log.error(`[RAG Sources] Unknown intent: ${intent}, falling back to all domains`);
    return [...ALL_WHITELISTED_DOMAINS];
  }

  if (includeSecondary) {
    // Deduplicate in case of overlap
    return Array.from(new Set([...mapping.primary, ...mapping.secondary]));
  }

  return [...mapping.primary];
}

/**
 * Builds an optimized search query string with site: operators for the given intent.
 * 
 * This generates a Google-style search query that restricts results to trusted domains.
 * The query format is: `<product_query> (site:domain1 OR site:domain2 OR ...)`
 * 
 * @param intent - The purpose of the search ('specs', 'reviews', 'manuals', 'images')
 * @param productQuery - The product search terms (e.g., "Milwaukee M18 FUEL 2767-20")
 * @param maxDomains - Maximum number of domains to include (default: 10, to avoid query length limits)
 * @returns Optimized search query string
 * 
 * @example
 *   buildSourceQuery('specs', 'Milwaukee M18 FUEL 2767-20')
 *   // → 'Milwaukee M18 FUEL 2767-20 (site:milwaukeetool.eu OR site:milwaukeetool.it OR ...)'
 * 
 *   buildSourceQuery('images', 'Makita DHP486Z')
 *   // → 'Makita DHP486Z (site:acmetools.com OR site:toolstop.co.uk OR ...)'
 */
export function buildSourceQuery(
  intent: SearchIntent,
  productQuery: string,
  maxDomains: number = 10
): string {
  const domains = getDomainsForIntent(intent, true);
  
  // Limit domains to avoid excessively long queries
  const selectedDomains = domains.slice(0, maxDomains);
  
  // Build site: restriction clause
  const siteClause = selectedDomains
    .map(domain => `site:${domain}`)
    .join(' OR ');

  const query = `${productQuery} (${siteClause})`;
  
  log.info(`[RAG Sources] Built query for intent="${intent}": ${query.substring(0, 120)}...`);
  
  return query;
}

/**
 * Builds multiple search queries for comprehensive coverage.
 * Returns one query per intent category, allowing parallel search.
 * 
 * @param productTitle - Product title
 * @param vendor - Brand/vendor name
 * @param sku - Product SKU (optional)
 * @returns Object with a query string for each intent
 * 
 * @example
 *   buildAllSourceQueries('Milwaukee M18 FUEL', 'Milwaukee', '2767-20')
 *   // → { specs: '...', reviews: '...', manuals: '...', images: '...' }
 */
export function buildAllSourceQueries(
  productTitle: string,
  vendor: string,
  sku?: string | null
): Record<SearchIntent, string> {
  const baseQuery = sku 
    ? `${vendor} ${productTitle} ${sku}` 
    : `${vendor} ${productTitle}`;

  return {
    specs: buildSourceQuery('specs', `${baseQuery} specifications datasheet scheda tecnica`),
    reviews: buildSourceQuery('reviews', `${baseQuery} review test pro con`),
    manuals: buildSourceQuery('manuals', `${baseQuery} manual PDF parts exploded view`),
    images: buildSourceQuery('images', `${baseQuery} product image photo`),
  };
}

/**
 * Checks if a given URL belongs to a whitelisted domain.
 * Useful for filtering search results to only trusted sources.
 * 
 * @param url - The URL to check
 * @returns true if the URL's domain is in the whitelist
 */
export function isWhitelistedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ALL_WHITELISTED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Categorizes a URL into its source type.
 * Returns null if the domain is not whitelisted.
 * 
 * @param url - The URL to categorize
 * @returns The category name or null
 */
export function categorizeUrl(url: string): 'officialBrand' | 'trustedRetailer' | 'expertReview' | 'technicalManual' | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    
    if (OFFICIAL_BRANDS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
      return 'officialBrand';
    }
    if (TRUSTED_RETAILERS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
      return 'trustedRetailer';
    }
    if (EXPERT_REVIEWS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
      return 'expertReview';
    }
    if (TECHNICAL_MANUALS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
      return 'technicalManual';
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Returns a confidence score based on the source category.
 * Official brands have the highest confidence, followed by expert reviews.
 */
export function getSourceConfidence(url: string): number {
  const category = categorizeUrl(url);
  switch (category) {
    case 'officialBrand': return 0.95;
    case 'expertReview': return 0.85;
    case 'trustedRetailer': return 0.80;
    case 'technicalManual': return 0.90;
    default: return 0.50;
  }
}

/**
 * Maps a SourceType from source-router.ts to the appropriate SearchIntent.
 * This bridges the gap between the UniversalRAG routing system and the
 * domain-based source configuration.
 */
export function sourceTypeToSearchIntent(
  sourceType: string
): SearchIntent {
  switch (sourceType) {
    case 'official_specs':
    case 'official_manuals':
      return 'specs';
    case 'retailer_data':
      return 'images'; // Retailers are best for images
    case 'user_reviews':
    case 'forum_discussions':
    case 'comparison_sites':
      return 'reviews';
    case 'video_content':
      return 'reviews'; // Video reviews map to review intent
    default:
      return 'specs'; // Default to specs
  }
}
