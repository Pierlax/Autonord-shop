/**
 * Domain Navigator — Universal RAG v2, Layer 3
 *
 * Navigazione controllata dei sorgenti scoperti dal Source Discovery.
 * Opera con un navigation budget fisso (max URL, max depth, pattern di priorità)
 * e privilegia support/download/manuals/PDF.
 *
 * Depth 0  = URL scoperti direttamente da Source Discovery
 * Depth 1  = Espansione parallela via URL pattern queries
 *            (filetype:pdf, /specifications/, /downloads/, /accessories/)
 * Depth 2  = Cross-domain hop (link da forum/snippet verso domini whitelisted)
 *          + Compatibility expansion (accessori, batterie, attacchi)
 *
 * Rispetto alla versione precedente:
 * - expandDepthOne ora usa Promise.allSettled (parallelo, non sequenziale)
 * - buildPatternQueries genera query filetype:pdf e path-specifiche per
 *   i siti produttori (tabelle nascoste, centri download, specifiche tecniche)
 * - extractCrossHopUrls scansiona snippet alla ricerca di URL su domini
 *   whitelisted non ancora nel navigation set → hop controllato
 * - depth-2 reuses the same pattern-query logic su risorse profonde
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
  depth: number; // 0 = direct, 1 = pattern expansion, 2 = cross-hop / compat
}

export interface NavigationBudget {
  /** Max URLs to keep per domain (default: 5). */
  maxUrlsPerDomain: number;
  /** Max total resources across all domains (default: 20). */
  maxTotalUrls: number;
  /** Max navigation depth (0 = direct only, 1 = pattern queries, 2 = cross-hop, default: 2). */
  maxDepth: number;
  /** URL path patterns to prioritise (higher score = served first). */
  priorityPatterns: RegExp[];
  /**
   * Max concurrent search requests per expansion pass (default: 4).
   * Increase for faster navigation, decrease to stay under rate limits.
   */
  parallelism: number;
  /**
   * Follow links to other whitelisted domains found in snippets (default: false).
   * When true, snippets mentioning URLs on OFFICIAL_BRANDS or TECHNICAL_MANUALS
   * domains are added as depth-2 resources.
   */
  enableCrossDomainHop: boolean;
  /**
   * Additional domains allowed for cross-hop (merged with OFFICIAL_BRANDS +
   * TECHNICAL_MANUALS when enableCrossDomainHop = true).
   */
  crossDomainWhitelist: string[];
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
  parallelism: 4,
  enableCrossDomainHop: false,
  crossDomainWhitelist: [],
};

// ---------------------------------------------------------------------------
// URL pattern templates for manufacturer site navigation
//
// Per ogni intent e pattern, queste query generano ricerche mirate che
// approssimano "navigare dentro le tab nascoste" del sito produttore senza
// fare fetch HTTP diretto: il search engine ha già indicizzato quelle sezioni.
// ---------------------------------------------------------------------------

interface PatternQuery {
  query: string;
  /** Confidence to assign to results found via this query. */
  confidence: number;
  /** Intent to tag results with. */
  intent: DiscoveryIntent;
}

/**
 * Genera query URL-pattern per un dominio produttore.
 *
 * Strategia a 4 livelli:
 * 1. filetype:pdf → caccia PDF di manuali/schede tecniche
 * 2. site:domain/path/ → path noti dei siti produttori (specifiche, download, accessori)
 * 3. "specifiche tecniche" / "technical data" → pagine con tabelle spec spesso
 *    nascoste in tab o accordion
 * 4. Accessori/compatibilità → esplode l'ecosistema del prodotto
 */
function buildPatternQueries(domain: string, titleOrSku: string): PatternQuery[] {
  const t = titleOrSku.trim();
  return [
    // ── PDF hunting ─────────────────────────────────────────────────────────
    {
      query: `site:${domain} "${t}" filetype:pdf`,
      confidence: 0.93,
      intent: 'manual',
    },
    {
      query: `site:${domain} ${t} manuale istruzioni filetype:pdf`,
      confidence: 0.90,
      intent: 'manual',
    },
    // ── Path-targeted spec / download pages ─────────────────────────────────
    {
      query: `site:${domain}/specifications/ ${t}`,
      confidence: 0.85,
      intent: 'product',
    },
    {
      query: `site:${domain}/downloads/ ${t}`,
      confidence: 0.85,
      intent: 'download',
    },
    {
      query: `site:${domain}/support/ ${t} specifiche tecniche`,
      confidence: 0.80,
      intent: 'support',
    },
    // ── Hidden spec tables (approssimato via keyword "specifiche tecniche") ──
    {
      query: `site:${domain} ${t} "specifiche tecniche" OR "technical data" OR "scheda tecnica"`,
      confidence: 0.80,
      intent: 'product',
    },
    // ── Compatibility / accessories expansion ────────────────────────────────
    {
      query: `site:${domain} ${t} accessori compatibili batterie`,
      confidence: 0.75,
      intent: 'compatibility',
    },
    {
      query: `site:${domain}/accessories/ ${t}`,
      confidence: 0.78,
      intent: 'compatibility',
    },
    // ── Support / FAQ / troubleshooting ─────────────────────────────────────
    {
      query: `site:${domain} ${t} FAQ assistenza support`,
      confidence: 0.72,
      intent: 'support',
    },
  ];
}

// ---------------------------------------------------------------------------
// Cross-domain hop — scansiona snippet per URL whitelisted non ancora visti
// ---------------------------------------------------------------------------

const URL_IN_SNIPPET_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(\/[^\s"<>]*)?/gi;

function buildCrossHopWhitelist(extra: string[]): Set<string> {
  const all = new Set<string>();
  OFFICIAL_BRANDS.forEach(d => all.add(d.replace(/^www\./, '')));
  TECHNICAL_MANUALS.forEach(d => all.add(d.replace(/^www\./, '')));
  extra.forEach(d => all.add(d.replace(/^www\./, '')));
  return all;
}

/**
 * Cerca URL a domini whitelisted negli snippet delle risorse già navigate.
 * Restituisce risorse depth-2 da aggiungere al navigation set.
 */
function extractCrossHopUrls(
  resources: NavigatedResource[],
  whitelist: Set<string>,
  seenUrls: Set<string>
): NavigatedResource[] {
  const hops: NavigatedResource[] = [];

  for (const r of resources) {
    const text = `${r.title} ${r.snippet}`;
    let match: RegExpExecArray | null;
    URL_IN_SNIPPET_RE.lastIndex = 0;

    while ((match = URL_IN_SNIPPET_RE.exec(text)) !== null) {
      const foundDomain = match[1].replace(/^www\./, '');
      const foundUrl = match[0];

      if (
        whitelist.has(foundDomain) &&
        !seenUrls.has(foundUrl) &&
        foundDomain !== r.domain  // non aggiungere lo stesso dominio
      ) {
        seenUrls.add(foundUrl);
        const isPdf = foundUrl.toLowerCase().endsWith('.pdf');
        hops.push({
          url: foundUrl,
          title: `[cross-hop] ${r.title}`,
          snippet: r.snippet,
          resourceType: isPdf ? 'pdf' : 'page',
          intent: isPdf ? 'manual' : 'support',
          domain: foundDomain,
          confidence: isPdf ? 0.88 : 0.70,
          isPdf,
          depth: 2,
        });
      }
    }
  }

  return hops;
}

// ---------------------------------------------------------------------------
// Core navigation function
// ---------------------------------------------------------------------------

/**
 * Navigate discovered sources within the given budget.
 *
 * Depth 0: rank and admit all discovered sources within budget.
 * Depth 1: parallel URL-pattern expansion on top domains
 *          (PDF hunting, spec tables, download paths, accessories).
 * Depth 2: cross-domain hop from snippets + compatibility expansion.
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
  const seenUrls = new Set<string>();

  debugLog.push(
    `[DomainNavigator] Budget: max ${effectiveBudget.maxUrlsPerDomain}/domain, ` +
      `${effectiveBudget.maxTotalUrls} total, depth=${effectiveBudget.maxDepth}, ` +
      `parallelism=${effectiveBudget.parallelism}, crossHop=${effectiveBudget.enableCrossDomainHop}`
  );
  debugLog.push(`[DomainNavigator] Input: ${discoveredSources.length} discovered sources`);

  // ── Depth 0: rank and admit ──────────────────────────────────────────────
  const ranked = rankSources(discoveredSources, effectiveBudget.priorityPatterns);

  for (const source of ranked) {
    if (resources.length >= effectiveBudget.maxTotalUrls) break;
    if (seenUrls.has(source.url)) continue;

    const domainCount = domainCounts.get(source.domain) ?? 0;
    if (domainCount >= effectiveBudget.maxUrlsPerDomain) continue;

    const resource = sourceToResource(source, 0);
    addResource(resource, resources, byDomain, domainCounts);
    seenUrls.add(source.url);
  }

  debugLog.push(`[DomainNavigator] After depth-0: ${resources.length} resources`);

  // ── Depth 1: parallel URL-pattern expansion ──────────────────────────────
  if (effectiveBudget.maxDepth >= 1 && resources.length < effectiveBudget.maxTotalUrls) {
    const remaining = effectiveBudget.maxTotalUrls - resources.length;
    const depth1 = await expandByPatternQueries(
      resources.slice(0, 4),    // top-4 risorse depth-0
      effectiveBudget,
      domainCounts,
      seenUrls,
      debugLog
    );

    let added = 0;
    for (const r of depth1) {
      if (added >= remaining) break;
      addResource(r, resources, byDomain, domainCounts);
      seenUrls.add(r.url);
      added++;
    }
    debugLog.push(`[DomainNavigator] After depth-1: ${resources.length} resources (+${added})`);
  }

  // ── Depth 2: cross-domain hop + compat expansion ─────────────────────────
  if (effectiveBudget.maxDepth >= 2 && resources.length < effectiveBudget.maxTotalUrls) {
    const remaining = effectiveBudget.maxTotalUrls - resources.length;
    let depth2Added = 0;

    // 2a: Cross-domain hop from snippets
    if (effectiveBudget.enableCrossDomainHop) {
      const whitelist = buildCrossHopWhitelist(effectiveBudget.crossDomainWhitelist);
      const hops = extractCrossHopUrls(resources, whitelist, seenUrls);
      debugLog.push(`[DomainNavigator] Cross-hop candidates: ${hops.length}`);

      for (const r of hops) {
        if (depth2Added >= remaining) break;
        const domainCount = domainCounts.get(r.domain) ?? 0;
        if (domainCount >= effectiveBudget.maxUrlsPerDomain) continue;
        addResource(r, resources, byDomain, domainCounts);
        depth2Added++;
      }
    }

    // 2b: Compatibility/accessories expansion on top depth-1 resources
    if (depth2Added < remaining) {
      const compatResources = resources
        .filter(r => r.depth === 1 && r.intent !== 'compatibility')
        .slice(0, 3);

      if (compatResources.length > 0) {
        const compatExpanded = await expandCompatibility(
          compatResources,
          effectiveBudget,
          domainCounts,
          seenUrls,
          debugLog
        );
        for (const r of compatExpanded) {
          if (depth2Added >= remaining) break;
          addResource(r, resources, byDomain, domainCounts);
          seenUrls.add(r.url);
          depth2Added++;
        }
      }
    }

    debugLog.push(`[DomainNavigator] After depth-2: ${resources.length} resources (+${depth2Added})`);
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
// Depth-1: parallel URL-pattern expansion
// ---------------------------------------------------------------------------

/**
 * Espansione parallela via URL-pattern queries.
 *
 * Per ogni resource top-0, genera fino a 3 query pattern-specifiche
 * (filetype:pdf, /specifications/, /downloads/, /accessories/) e le esegue
 * tutte in parallelo con Promise.allSettled limitato a `parallelism`.
 */
async function expandByPatternQueries(
  topResources: NavigatedResource[],
  budget: NavigationBudget,
  domainCounts: Map<string, number>,
  seenUrls: Set<string>,
  debugLog: string[]
): Promise<NavigatedResource[]> {
  // Costruisci tutte le query da eseguire in parallelo
  const tasks: Array<{ query: PatternQuery; domain: string }> = [];

  for (const resource of topResources) {
    const titleOrSku = resource.title.slice(0, 60);
    // Prendi solo le prime 3 pattern query per resource per non sforare il budget
    const queries = buildPatternQueries(resource.domain, titleOrSku).slice(0, 3);
    for (const pq of queries) {
      tasks.push({ query: pq, domain: resource.domain });
    }
  }

  debugLog.push(`[DomainNavigator] Depth-1: ${tasks.length} pattern queries (parallelism=${budget.parallelism})`);

  // Esegui in batch paralleli rispettando il budget di parallelismo
  const expansion: NavigatedResource[] = [];
  const CAP = 10; // max risorse depth-1

  for (let i = 0; i < tasks.length && expansion.length < CAP; i += budget.parallelism) {
    const batch = tasks.slice(i, i + budget.parallelism);

    const settled = await Promise.allSettled(
      batch.map(({ query, domain }) =>
        cachedSearch(
          query.query,
          [domain],
          query.intent === 'manual' ? 'manuals' : 'specs',
          (q, d) => performWebSearch(q, d, { maxResults: 3 })
        ).then(results =>
          results.map(r => ({
            r,
            queryMeta: query,
          }))
        )
      )
    );

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const { r, queryMeta } of result.value) {
        if (expansion.length >= CAP) break;
        if (seenUrls.has(r.link)) continue;

        const domainCount = domainCounts.get(r.domain) ?? 0;
        if (domainCount >= budget.maxUrlsPerDomain) continue;

        const isPdf = r.link.toLowerCase().endsWith('.pdf') || /filetype=pdf/i.test(r.link);
        const resourceType = classifyResourceType(r.link, isPdf);

        expansion.push({
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          resourceType,
          intent: queryMeta.intent,
          domain: r.domain,
          confidence: queryMeta.confidence,
          isPdf,
          depth: 1,
        });
        seenUrls.add(r.link);
      }
    }
  }

  debugLog.push(`[DomainNavigator] Depth-1 pattern expansion: +${expansion.length} resources`);
  return expansion;
}

// ---------------------------------------------------------------------------
// Depth-2: compatibility/accessories expansion
// ---------------------------------------------------------------------------

async function expandCompatibility(
  resources: NavigatedResource[],
  budget: NavigationBudget,
  domainCounts: Map<string, number>,
  seenUrls: Set<string>,
  debugLog: string[]
): Promise<NavigatedResource[]> {
  const tasks = resources.flatMap(r => {
    const titleOrSku = r.title.slice(0, 60);
    return buildPatternQueries(r.domain, titleOrSku)
      .filter(q => q.intent === 'compatibility')
      .slice(0, 2)
      .map(q => ({ query: q, domain: r.domain }));
  });

  if (tasks.length === 0) return [];

  debugLog.push(`[DomainNavigator] Depth-2 compat: ${tasks.length} queries`);

  const settled = await Promise.allSettled(
    tasks.map(({ query, domain }) =>
      cachedSearch(
        query.query,
        [domain],
        'specs',
        (q, d) => performWebSearch(q, d, { maxResults: 3 })
      ).then(results => results.map(r => ({ r, queryMeta: query })))
    )
  );

  const expansion: NavigatedResource[] = [];
  const CAP = 5;

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const { r, queryMeta } of result.value) {
      if (expansion.length >= CAP) break;
      if (seenUrls.has(r.link)) continue;

      const domainCount = domainCounts.get(r.domain) ?? 0;
      if (domainCount >= budget.maxUrlsPerDomain) continue;

      const isPdf = r.link.toLowerCase().endsWith('.pdf');
      expansion.push({
        url: r.link,
        title: r.title,
        snippet: r.snippet,
        resourceType: classifyResourceType(r.link, isPdf),
        intent: queryMeta.intent,
        domain: r.domain,
        confidence: queryMeta.confidence,
        isPdf,
        depth: 2,
      });
      seenUrls.add(r.link);
    }
  }

  debugLog.push(`[DomainNavigator] Depth-2 compat expansion: +${expansion.length} resources`);
  return expansion;
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

  if (source.isPdf) score += 0.35;

  for (const pattern of patterns) {
    if (pattern.test(urlLower)) {
      score += 0.15;
      break;
    }
  }

  if (source.intent === 'manual' || source.intent === 'download') score += 0.20;
  if (source.intent === 'support') score += 0.15;
  if (source.intent === 'compatibility') score += 0.10;

  if (OFFICIAL_BRANDS.some((d) => source.domain.includes(d))) score += 0.10;
  if (TECHNICAL_MANUALS.some((d) => source.domain.includes(d))) score += 0.15;

  return score;
}

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------

function classifyResourceType(url: string, isPdf: boolean): ResourceType {
  if (isPdf) return 'pdf';
  const u = url.toLowerCase();
  if (/\/download/i.test(u)) return 'download';
  if (/\/(scheda|datasheet|spec)/i.test(u)) return 'spec';
  if (/\/(support|faq|assist)\b/i.test(u)) return 'support';
  if (/\.(jpg|jpeg|png|webp)$/i.test(u)) return 'image';
  return 'page';
}

function sourceToResource(source: DiscoveredSource, depth: number): NavigatedResource {
  return {
    url: source.url,
    title: source.title,
    snippet: source.snippet,
    resourceType: classifyResourceType(source.url, source.isPdf),
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
