/**
 * Domain Navigator — Universal RAG v2, Layer 3
 *
 * Navigazione controllata dei sorgenti scoperti dal Source Discovery.
 * Non fa crawl infinito: opera con un navigation budget fisso (max URL,
 * max depth, pattern di priorità) e privilegia support/download/manuals/PDF.
 *
 * Questo è il layer agentico che il paper UniversalRAG non descrive perché
 * il paper assume corpora già costruiti. Qui costruiamo i corpora al volo.
 *
 * Depth 0 = URL scoperti direttamente da Source Discovery
 * Depth 1 = Follow-up searches mirate su PDF/support dello stesso dominio
 */

import { loggers } from '@/lib/logger';
import { DiscoveredSource, DiscoveryIntent } from './source-discovery';
import { cachedSearch } from './rag-cache';
import { performWebSearch } from './search-client';
import { OFFICIAL_BRANDS, TECHNICAL_MANUALS } from './rag-sources';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResourceType = 'page' | 'pdf' | 'image' | 'support' | 'download' | 'spec';

export interface NavigatedResource {
  url: string;
  title: string;
  snippet: string;
  resourceType: ResourceType;
  intent: DiscoveryIntent;
  domain: string;
  confidence: number;
  isPdf: boolean;
  depth: number; // 0 = direct, 1 = followed link
}

export interface NavigationBudget {
  /** Max URLs to keep per domain (default: 5). */
  maxUrlsPerDomain: number;
  /** Max total resources across all domains (default: 20). */
  maxTotalUrls: number;
  /** Max navigation depth (0 = direct only, 1 = one follow-up pass, default: 2). */
  maxDepth: number;
  /** URL path patterns to prioritise (higher score = served first). */
  priorityPatterns: RegExp[];
}

export interface NavigationResult {
  resources: NavigatedResource[];
  pdfUrls: string[];
  supportUrls: string[];
  downloadUrls: string[];
  byDomain: Map<string, NavigatedResource[]>;
  totalResources: number;
  executionTimeMs: number;
  debugLog: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_NAVIGATION_BUDGET: NavigationBudget = {
  maxUrlsPerDomain: 5,
  maxTotalUrls: 20,
  maxDepth: 2,
  priorityPatterns: [
    /\/(support|assistenza)\//i,
    /\/(download|scarica)\//i,
    /\/(manuals?|istruzioni|guide)\//i,
    /\.pdf$/i,
    /\/(product|prodotto|scheda-tecnica)\//i,
    /\/(faq|help|aiuto)\//i,
    /\/(datasheet|scheda|specifiche)\//i,
  ],
};

// ---------------------------------------------------------------------------
// Core navigation function
// ---------------------------------------------------------------------------

/**
 * Navigate discovered sources within the given budget.
 *
 * Steps:
 * 1. Score and rank all discovered sources
 * 2. Admit sources within per-domain and total budgets
 * 3. Depth-1 expansion: for top 3 resources, search for PDFs/support on same domain
 */
export async function navigateDomains(
  discoveredSources: DiscoveredSource[],
  budget: Partial<NavigationBudget> = {}
): Promise<NavigationResult> {
  const startTime = Date.now();
  const effectiveBudget: NavigationBudget = { ...DEFAULT_NAVIGATION_BUDGET, ...budget };
  const debugLog: string[] = [];
  const resources: NavigatedResource[] = [];
  const byDomain = new Map<string, NavigatedResource[]>();
  const domainCounts = new Map<string, number>();

  debugLog.push(
    `[DomainNavigator] Budget: max ${effectiveBudget.maxUrlsPerDomain}/domain, ` +
      `${effectiveBudget.maxTotalUrls} total, depth=${effectiveBudget.maxDepth}`
  );
  debugLog.push(`[DomainNavigator] Input: ${discoveredSources.length} discovered sources`);

  // Step 1: Rank by navigation score
  const ranked = rankSources(discoveredSources, effectiveBudget.priorityPatterns);

  // Step 2: Admit within budget
  for (const source of ranked) {
    if (resources.length >= effectiveBudget.maxTotalUrls) break;

    const domainCount = domainCounts.get(source.domain) ?? 0;
    if (domainCount >= effectiveBudget.maxUrlsPerDomain) continue;

    const resource = sourceToResource(source, 0);
    addResource(resource, resources, byDomain, domainCounts);
  }

  debugLog.push(`[DomainNavigator] After depth-0: ${resources.length} resources`);

  // Step 3: Depth-1 expansion (search for PDFs and support on top domains)
  if (effectiveBudget.maxDepth >= 1 && resources.length < effectiveBudget.maxTotalUrls) {
    const topResources = resources.slice(0, 3);
    const expanded = await expandDepthOne(
      topResources,
      effectiveBudget,
      domainCounts,
      debugLog
    );

    for (const r of expanded) {
      if (resources.length >= effectiveBudget.maxTotalUrls) break;
      addResource(r, resources, byDomain, domainCounts);
    }
  }

  const pdfUrls = resources.filter((r) => r.isPdf).map((r) => r.url);
  const supportUrls = resources.filter((r) => r.resourceType === 'support').map((r) => r.url);
  const downloadUrls = resources.filter((r) => r.resourceType === 'download').map((r) => r.url);
  const executionTimeMs = Date.now() - startTime;

  debugLog.push(
    `[DomainNavigator] Complete: ${resources.length} resources ` +
      `(${pdfUrls.length} PDFs, ${supportUrls.length} support, ${downloadUrls.length} download) ` +
      `in ${executionTimeMs}ms`
  );
  log.info(
    `[DomainNavigator] ${resources.length} resources in ${executionTimeMs}ms ` +
      `(PDFs: ${pdfUrls.length})`
  );

  return {
    resources,
    pdfUrls,
    supportUrls,
    downloadUrls,
    byDomain,
    totalResources: resources.length,
    executionTimeMs,
    debugLog,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function rankSources(sources: DiscoveredSource[], patterns: RegExp[]): DiscoveredSource[] {
  return [...sources].sort(
    (a, b) => computeNavScore(b, patterns) - computeNavScore(a, patterns)
  );
}

function computeNavScore(source: DiscoveredSource, patterns: RegExp[]): number {
  let score = source.confidence;
  const urlLower = source.url.toLowerCase();

  // PDFs are extremely valuable — boost them significantly
  if (source.isPdf) score += 0.35;

  // Priority URL path patterns
  for (const pattern of patterns) {
    if (pattern.test(urlLower)) {
      score += 0.15;
      break;
    }
  }

  // Intent-based boost
  if (source.intent === 'manual' || source.intent === 'download') score += 0.20;
  if (source.intent === 'support') score += 0.15;
  if (source.intent === 'compatibility') score += 0.10;

  // Official domains trusted more
  if (OFFICIAL_BRANDS.some((d) => source.domain.includes(d))) score += 0.10;
  if (TECHNICAL_MANUALS.some((d) => source.domain.includes(d))) score += 0.15;

  return score;
}

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------

function sourceToResource(source: DiscoveredSource, depth: number): NavigatedResource {
  const urlLower = source.url.toLowerCase();

  let resourceType: ResourceType = 'page';
  if (source.isPdf) resourceType = 'pdf';
  else if (source.isSupport) resourceType = 'support';
  else if (/\/download/i.test(urlLower)) resourceType = 'download';
  else if (/\/(scheda|datasheet|spec)/i.test(urlLower)) resourceType = 'spec';
  else if (/\.(jpg|jpeg|png|webp)$/i.test(urlLower)) resourceType = 'image';

  return {
    url: source.url,
    title: source.title,
    snippet: source.snippet,
    resourceType,
    intent: source.intent,
    domain: source.domain,
    confidence: source.confidence,
    isPdf: source.isPdf,
    depth,
  };
}

function addResource(
  resource: NavigatedResource,
  resources: NavigatedResource[],
  byDomain: Map<string, NavigatedResource[]>,
  domainCounts: Map<string, number>
): void {
  resources.push(resource);
  domainCounts.set(resource.domain, (domainCounts.get(resource.domain) ?? 0) + 1);
  if (!byDomain.has(resource.domain)) byDomain.set(resource.domain, []);
  byDomain.get(resource.domain)!.push(resource);
}

// ---------------------------------------------------------------------------
// Depth-1 expansion
// ---------------------------------------------------------------------------

async function expandDepthOne(
  topResources: NavigatedResource[],
  budget: NavigationBudget,
  domainCounts: Map<string, number>,
  debugLog: string[]
): Promise<NavigatedResource[]> {
  const expansion: NavigatedResource[] = [];

  for (const resource of topResources) {
    if (expansion.length >= 6) break; // cap depth-1 at 6 extra resources

    // Two targeted follow-up searches per resource
    const expansionQueries = [
      `site:${resource.domain} ${resource.title} manuale PDF`,
      `site:${resource.domain} ${resource.title} support download`,
    ];

    for (const query of expansionQueries) {
      if (expansion.length >= 6) break;

      try {
        const results = await cachedSearch(
          query,
          [resource.domain],
          'manuals',
          performWebSearch
        );

        for (const r of results.slice(0, 2)) {
          const domainCount = domainCounts.get(r.domain) ?? 0;
          if (domainCount >= budget.maxUrlsPerDomain) continue;

          const isPdf = r.link.toLowerCase().endsWith('.pdf');
          const isSupport = /\/(support|faq|assist)\b/i.test(r.link);

          expansion.push({
            url: r.link,
            title: r.title,
            snippet: r.snippet,
            resourceType: isPdf ? 'pdf' : isSupport ? 'support' : 'page',
            intent: (isPdf ? 'manual' : 'support') as DiscoveryIntent,
            domain: r.domain,
            confidence: isPdf ? 0.90 : 0.72,
            isPdf,
            depth: 1,
          });
        }
      } catch (err) {
        debugLog.push(`[DomainNavigator] Depth-1 expansion failed: ${err}`);
      }
    }
  }

  debugLog.push(`[DomainNavigator] Depth-1 expansion: +${expansion.length} resources`);
  return expansion;
}
