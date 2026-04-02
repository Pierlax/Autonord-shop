/**
 * Blog RAG Bridge — Universal RAG v2 in editorial intelligence mode
 *
 * Pipeline a 7 layer identica all'Universal RAG v2 product mode,
 * ma con intent, budget, router label, evidence graph e evaluator
 * orientati alla scoperta editoriale invece che all'arricchimento scheda prodotto.
 *
 *   Layer 1 — Intent Gate          Blog no-retrieval detection
 *   Layer 2 — Source Discovery     Multi-intent forum/blog/review search
 *   Layer 3 — Domain Navigator     Navigazione controllata con forum-budget
 *   Layer 4 — Corpus Builder       Corpora tipizzati per modality editoriale
 *   Layer 5 — Blog Router          Routing in bucket editoriali
 *   Layer 6 — Retrieval + Rerank   Trust × freshness × engagement
 *   Layer 7 — Evidence Graph       Grafo topic/claim/source + Evaluator-Optimizer
 *             + Evaluator-Optimizer con iterative retrieval se corpus insufficiente
 */

import { loggers } from '@/lib/logger';
import { performWebSearch, SearchResult } from '@/lib/shopify/search-client';
import { cachedSearch } from '@/lib/shopify/rag-cache';
import { generateTextSafe } from '@/lib/shopify/ai-client';
import { navigateDomains, NavigationBudget, NavigatedResource } from '@/lib/shopify/domain-navigator';
import { buildCorpus, corpusToContext, CorpusCollection } from '@/lib/shopify/corpus-builder';
import { buildEvidenceGraph, EvidenceGraph, EvidenceGraphSummary } from '@/lib/shopify/evidence-graph';
import { DiscoveredSource, DiscoveryIntent } from '@/lib/shopify/source-discovery';
import { FORUM_SOURCES, WHITELIST_SOURCES } from './sources';
import { OFFICIAL_BRAND_DOMAINS } from '@/lib/shopify/rag-sources';

const log = loggers.blog;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlogDiscoveryIntent =
  | 'discussion'      // Thread forum, discussioni Reddit
  | 'problem'         // Lamentele, guasti, difetti noti
  | 'comparison'      // Confronti brand / prodotto
  | 'trend'           // Novità, nuovi prodotti, temi emergenti
  | 'how_to'          // Guide, tutorial, best practice
  | 'buyer_question'; // Domande d'acquisto, raccomandazioni

export type BlogSourceType =
  | 'forum_thread'
  | 'editorial_article'
  | 'review'
  | 'official_note'
  | 'trend_cluster';

/** Layer 5 — Blog router labels (editorial buckets, not product categories) */
export type BlogRouterLabel =
  | 'forum_voices'      // Voci reali utenti / forum
  | 'expert_validation' // Review tecniche, benchmark
  | 'editorial_angle'   // Articoli blog, editoriali
  | 'official_claim';   // Fonti ufficiali brand per fact-check

export interface BlogTopicSignal {
  topic: string;
  painPoint?: string;
  brands?: string[];
  category?: string;
  tayaCategory?: 'pricing' | 'problems' | 'comparisons' | 'reviews' | 'best';
  language?: 'it' | 'en' | 'both';
}

export interface BlogDiscoveredSource {
  url: string;
  title: string;
  snippet: string;
  intent: BlogDiscoveryIntent;
  domain: string;
  confidence: number;
  sourceType: BlogSourceType;
  freshness: number;
  trustScore: number;
  language: 'it' | 'en' | 'unknown';
  provider: string;
}

export interface BlogEvaluationResult {
  qualityScore: number;
  coherenceScore: number;
  coverageScore: number;
  needsSecondPass: boolean;
  gaps: string[];
  strengths: string[];
  intentsCount: number;
  conflictsFound: number;
  reasoning: string;
}

export interface BlogDiscoveryResult {
  sources: BlogDiscoveredSource[];
  byIntent: Partial<Record<BlogDiscoveryIntent, BlogDiscoveredSource[]>>;
  /** Layer 5: editorial routing buckets */
  routed: Partial<Record<BlogRouterLabel, BlogDiscoveredSource[]>>;
  /** Typed corpus from Layer 4 */
  corpusCollection: CorpusCollection;
  /** Layer 7a: evidence graph */
  evidenceGraph: EvidenceGraph;
  evidenceGraphSummary: EvidenceGraphSummary;
  /** Layer 7b: evaluator-optimizer result */
  evaluation: BlogEvaluationResult;
  /** Second pass was triggered and ran */
  secondPassRan: boolean;
  /** Top snippets for AI synthesis (from corpusToContext) */
  topSnippets: string;
  executionTimeMs: number;
  debugLog: string[];
}

// ---------------------------------------------------------------------------
// Layer 1 — Intent Gate
// ---------------------------------------------------------------------------

/**
 * Decide se il topic richiede retrieval esterno o può essere risposto
 * con conoscenza parametrica. Per blog research quasi sempre serve retrieval.
 * Solo topic trivialmente generici vengono saltati.
 */
function needsBlogRetrieval(signal: BlogTopicSignal): boolean {
  const trivial = [
    /^(ciao|test|prova|hello)\b/i,
    /^\s*$/,
  ];
  return !trivial.some(p => p.test(signal.topic));
}

// ---------------------------------------------------------------------------
// Layer 2 — Source Discovery
// ---------------------------------------------------------------------------

const FORUM_DOMAINS = FORUM_SOURCES.map(f => f.domain.split('/')[0]);
const WHITELIST_DOMAINS = WHITELIST_SOURCES.map(s => s.domain);
const REVIEW_DOMAINS = WHITELIST_SOURCES.filter(s => s.type === 'review' || s.type === 'technical').map(s => s.domain);
const BLOG_DOMAINS   = WHITELIST_SOURCES.filter(s => s.type === 'blog').map(s => s.domain);

const INTENT_QUERIES: Record<BlogDiscoveryIntent, (s: BlogTopicSignal) => string[]> = {
  discussion: (s) => {
    const brand = s.brands?.[0] ?? '';
    return [
      `${brand} ${s.topic} forum discussione`.trim(),
      `${s.topic} reddit thread opinioni`,
      `${s.topic} forum professionisti`.trim(),
    ];
  },
  problem: (s) => {
    const brand = s.brands?.[0] ?? '';
    return [
      `${brand} ${s.topic} problemi difetti`.trim(),
      s.painPoint ? `${s.painPoint} forum` : `${s.topic} guasto lamentele`,
      `${brand} ${s.topic} issues problems`.trim(),
    ];
  },
  comparison: (s) => {
    if (s.brands && s.brands.length >= 2) {
      return [
        `${s.brands[0]} vs ${s.brands[1]} ${s.category ?? ''}`.trim(),
        `confronto ${s.brands[0]} ${s.brands[1]}`,
        `${s.brands[0]} or ${s.brands[1]} which better reddit`,
      ];
    }
    return [
      `${s.topic} confronto alternativa`,
      `${s.topic} vs comparison`,
      `quale scegliere ${s.topic}`,
    ];
  },
  trend: (s) => {
    const brand = s.brands?.[0] ?? '';
    return [
      `${brand} ${s.topic} novità 2025 2026`.trim(),
      `${s.topic} news latest release`,
      `${brand} nuovi prodotti ${s.category ?? ''}`.trim(),
    ];
  },
  how_to: (s) => [
    `come scegliere ${s.topic}`,
    `guida ${s.topic} consigli acquisto`,
    `${s.topic} buying guide how to choose`,
  ],
  buyer_question: (s) => [
    `vale la pena ${s.topic}`,
    `${s.topic} quale comprare consiglio forum`,
    `${s.topic} worth buying reddit`,
  ],
};

function getDomainsForIntent(intent: BlogDiscoveryIntent): string[] {
  switch (intent) {
    case 'discussion':     return [...FORUM_DOMAINS, 'reddit.com'];
    case 'problem':        return [...FORUM_DOMAINS, 'reddit.com'];
    case 'comparison':     return [...REVIEW_DOMAINS, ...FORUM_DOMAINS];
    case 'trend':          return [...BLOG_DOMAINS, ...WHITELIST_DOMAINS.slice(0, 8)];
    case 'how_to':         return [...REVIEW_DOMAINS, ...BLOG_DOMAINS];
    case 'buyer_question': return [...FORUM_DOMAINS, 'reddit.com', ...REVIEW_DOMAINS];
  }
}

function selectIntents(signal: BlogTopicSignal): BlogDiscoveryIntent[] {
  switch (signal.tayaCategory) {
    case 'problems':    return ['problem', 'discussion', 'how_to'];
    case 'comparisons': return ['comparison', 'discussion', 'buyer_question'];
    case 'pricing':     return ['buyer_question', 'comparison', 'discussion'];
    case 'best':        return ['how_to', 'comparison', 'buyer_question'];
    case 'reviews':     return ['discussion', 'trend', 'how_to'];
    default:            return ['discussion', 'problem', 'buyer_question'];
  }
}

// ---------------------------------------------------------------------------
// Source classification helpers
// ---------------------------------------------------------------------------

const REDDIT_DOMAINS = new Set(['reddit.com', 'old.reddit.com', 'www.reddit.com']);
// R10 fix: imported from rag-sources.ts instead of duplicating the list here
// (OFFICIAL_BRAND_DOMAINS is re-exported from @/lib/shopify/rag-sources)

function classifySourceType(domain: string, intent: BlogDiscoveryIntent): BlogSourceType {
  const d = domain.replace(/^www\./, '');
  if (REDDIT_DOMAINS.has(d) || FORUM_DOMAINS.some(fd => d.includes(fd))) return 'forum_thread';
  if (OFFICIAL_BRAND_DOMAINS.has(d)) return 'official_note';
  if (intent === 'trend') return 'trend_cluster';
  const entry = WHITELIST_SOURCES.find(s => s.domain === d);
  if (entry?.type === 'review' || entry?.type === 'technical') return 'review';
  return 'editorial_article';
}

function detectLanguage(text: string): 'it' | 'en' | 'unknown' {
  const it = (text.match(/\b(il|la|le|gli|del|della|dei|degli|per|con|che|sono|come|anche|però|quindi|questo|questa)\b/gi) ?? []).length;
  const en = (text.match(/\b(the|and|for|with|that|this|from|have|been|they|their|which|would)\b/gi) ?? []).length;
  if (it === 0 && en === 0) return 'unknown';
  return it >= en ? 'it' : 'en';
}

function scoreFreshness(text: string): number {
  if (/202[56]/.test(text)) return 1.0;
  if (/2024/.test(text)) return 0.7;
  if (/2023/.test(text)) return 0.4;
  if (/202[012]/.test(text)) return 0.2;
  return 0.5;
}

function scoreTrust(domain: string): number {
  const d = domain.replace(/^www\./, '');
  const w = WHITELIST_SOURCES.find(s => s.domain === d);
  if (w) return w.priority / 10;
  const f = FORUM_SOURCES.find(f => f.domain.startsWith(d));
  if (f) return f.sentimentWeight;
  if (OFFICIAL_BRAND_DOMAINS.has(d)) return 0.85;
  return 0.3;
}

async function runIntentSearch(
  intent: BlogDiscoveryIntent,
  signal: BlogTopicSignal,
  debug: string[]
): Promise<BlogDiscoveredSource[]> {
  const queries = INTENT_QUERIES[intent](signal).slice(0, 3);
  const domains = getDomainsForIntent(intent);
  const results: BlogDiscoveredSource[] = [];

  for (const query of queries) {
    debug.push(`[L2:${intent}] "${query}"`);
    let raw: SearchResult[] = [];
    try {
      raw = await cachedSearch(query, domains, 'reviews', (q, d) => performWebSearch(q, d, { maxResults: 8 }));
    } catch (err) {
      debug.push(`[L2:${intent}] failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const r of raw) {
      const text = `${r.title} ${r.snippet}`;
      results.push({
        url: r.link, title: r.title, snippet: r.snippet,
        intent, domain: r.domain,
        confidence: 0.7,
        sourceType: classifySourceType(r.domain, intent),
        freshness: scoreFreshness(text),
        trustScore: scoreTrust(r.domain),
        language: detectLanguage(text),
        provider: r.provider,
      });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const seen = new Set<string>();
  return results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
}

// ---------------------------------------------------------------------------
// Layer 3 — Domain Navigator adapter
// ---------------------------------------------------------------------------

/** Budget ottimizzato per forum/blog: meno depth, più spread tra domini */
const BLOG_NAVIGATION_BUDGET: Partial<NavigationBudget> = {
  maxUrlsPerDomain: 3,
  maxTotalUrls: 18,
  maxDepth: 1,
  priorityPatterns: [
    /\/comments?\//i,     // Thread con commenti (Reddit, forum)
    /\/discussion\//i,    // Sezioni discussione
    /\/forum\//i,         // Forum root
    /\/review\//i,        // Review page
    /\/blog\//i,          // Blog post
    /\/article\//i,       // Articolo
    /\/thread\//i,        // Thread generico
    /\/post\//i,          // Post
  ],
};

/**
 * Converte BlogDiscoveredSource in DiscoveredSource (richiesto da domain-navigator).
 * Mapping blog intent → product intent per compatibilità layer esistente.
 */
function toDiscoveredSource(b: BlogDiscoveredSource): DiscoveredSource {
  const intentMap: Record<BlogDiscoveryIntent, DiscoveryIntent> = {
    discussion:     'support',
    problem:        'support',
    comparison:     'compatibility',
    trend:          'product',
    how_to:         'support',
    buyer_question: 'support',
  };
  return {
    url: b.url, title: b.title, snippet: b.snippet,
    intent: intentMap[b.intent],
    domain: b.domain,
    confidence: b.confidence,
    provider: b.provider,
    isPdf: false,
    isSupport: b.sourceType === 'forum_thread',
  };
}

// ---------------------------------------------------------------------------
// Layer 5 — Blog Router
// ---------------------------------------------------------------------------

function routeBlogCorpus(
  sources: BlogDiscoveredSource[]
): Partial<Record<BlogRouterLabel, BlogDiscoveredSource[]>> {
  const routed: Partial<Record<BlogRouterLabel, BlogDiscoveredSource[]>> = {};

  const add = (label: BlogRouterLabel, s: BlogDiscoveredSource) => {
    if (!routed[label]) routed[label] = [];
    routed[label]!.push(s);
  };

  for (const s of sources) {
    switch (s.sourceType) {
      case 'forum_thread':      add('forum_voices', s); break;
      case 'review':            add('expert_validation', s); break;
      case 'editorial_article': add('editorial_angle', s); break;
      case 'trend_cluster':     add('editorial_angle', s); break;
      case 'official_note':     add('official_claim', s); break;
    }
  }

  return routed;
}

// ---------------------------------------------------------------------------
// Layer 6 — Ranking (trust × freshness × source-type bonus)
// ---------------------------------------------------------------------------

const SOURCE_TYPE_BONUS: Record<BlogSourceType, number> = {
  forum_thread:      0.90,
  review:            0.85,
  editorial_article: 0.75,
  official_note:     0.70,
  trend_cluster:     0.65,
};

function rankSources(sources: BlogDiscoveredSource[]): BlogDiscoveredSource[] {
  return sources
    .map(s => ({
      ...s,
      confidence: s.trustScore * 0.40 + s.freshness * 0.35 + SOURCE_TYPE_BONUS[s.sourceType] * 0.25,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// Layer 7a — Blog Evidence Graph
// ---------------------------------------------------------------------------

/**
 * Adatta il CorpusCollection per buildEvidenceGraph.
 * Mappa i CorpusItem del blog sui node type dell'EvidenceGraph esistente:
 *   forum_thread / discussion → 'forum'
 *   review / editorial        → 'review'
 *   official_note             → 'spec_sheet' (claim ufficiale verificato)
 *   topic root                → 'product'
 */
function buildBlogEvidenceGraph(
  topicTitle: string,
  corpus: CorpusCollection
): EvidenceGraph {
  // Mappa intent prodotto → node type blog tramite i metadata.intent del corpus
  // buildEvidenceGraph usa il corpus così com'è, con 'product' come root
  return buildEvidenceGraph(topicTitle, '', corpus.items);
}

// ---------------------------------------------------------------------------
// Layer 7b — Blog Evaluator-Optimizer
// ---------------------------------------------------------------------------

const BLOG_QUALITY_THRESHOLD = 0.48;

function computeBlogRuleScore(
  corpus: CorpusCollection,
  summary: EvidenceGraphSummary,
  intentsCount: number
): number {
  let score = 0;

  // Forum voices — cuore del blog research
  const forumItems = corpus.items.filter(i => i.metadata.intent === 'support').length;
  if (forumItems >= 4) score += 0.28;
  else if (forumItems >= 2) score += 0.16;
  else if (forumItems >= 1) score += 0.08;

  // Review / editorial coverage
  const editorialItems = corpus.items.filter(i =>
    i.metadata.intent === 'compatibility' || i.metadata.intent === 'product'
  ).length;
  if (editorialItems >= 3) score += 0.22;
  else if (editorialItems >= 1) score += 0.12;

  // Official validation presente
  if (summary.manualCount > 0 || corpus.byType.spec_sheet?.length) score += 0.18;

  // Diversità domini
  const uniqueDomains = new Set(corpus.items.map(i => i.domain)).size;
  if (uniqueDomains >= 4) score += 0.18;
  else if (uniqueDomains >= 2) score += 0.10;

  // Copertura intenti
  if (intentsCount >= 3) score += 0.10;
  else if (intentsCount >= 2) score += 0.05;

  // Quantità minima
  if (corpus.totalItems >= 8) score += 0.04;

  // Conflitti penalizzano coerenza
  score -= summary.conflictCount * 0.03;

  return Math.max(0, Math.min(1, score));
}

function identifyBlogGaps(corpus: CorpusCollection, summary: EvidenceGraphSummary): string[] {
  const gaps: string[] = [];
  const forumItems = corpus.items.filter(i => i.metadata.intent === 'support').length;
  if (forumItems < 2)  gaps.push('voci forum insufficienti');
  if (!corpus.byType.document?.length && !corpus.byType.paragraph?.length)
    gaps.push('analisi editoriale mancante');
  if (summary.manualCount === 0 && !corpus.byType.spec_sheet?.length)
    gaps.push('validazione fonti ufficiali mancante');
  if (new Set(corpus.items.map(i => i.domain)).size < 3)
    gaps.push('diversità fonti insufficiente');
  if (corpus.totalItems < 4) gaps.push('corpus insufficiente');
  return gaps;
}

function identifyBlogStrengths(corpus: CorpusCollection, summary: EvidenceGraphSummary): string[] {
  const strengths: string[] = [];
  const forumItems = corpus.items.filter(i => i.metadata.intent === 'support').length;
  if (forumItems >= 4) strengths.push('ricca copertura forum con voci autentiche');
  if (corpus.byType.document?.length || corpus.byType.paragraph?.length)
    strengths.push('contenuto editoriale disponibile');
  if (summary.manualCount > 0) strengths.push('validazione ufficiale presente');
  if (new Set(corpus.items.map(i => i.domain)).size >= 4)
    strengths.push('buona diversità di fonti');
  return strengths;
}

async function evaluateBlogCorpus(
  corpus: CorpusCollection,
  graph: EvidenceGraph,
  topicTitle: string,
  intentsCount: number
): Promise<BlogEvaluationResult> {
  const summary = graph.getSummary();
  const ruleScore = computeBlogRuleScore(corpus, summary, intentsCount);

  const isAmbiguous = ruleScore >= 0.30 && ruleScore <= 0.65 && corpus.totalItems > 0;

  if (!isAmbiguous || corpus.totalItems === 0) {
    return {
      qualityScore: ruleScore,
      coherenceScore: summary.conflictCount === 0 ? 0.90 : Math.max(0.5, 0.90 - summary.conflictCount * 0.07),
      coverageScore: corpus.coverageScore,
      needsSecondPass: ruleScore < BLOG_QUALITY_THRESHOLD,
      gaps: identifyBlogGaps(corpus, summary),
      strengths: identifyBlogStrengths(corpus, summary),
      intentsCount,
      conflictsFound: summary.conflictCount,
      reasoning: `rule-based: score=${ruleScore.toFixed(2)}, items=${corpus.totalItems}`,
    };
  }

  // LLM path per casi ambigui
  try {
    const preview = corpus.items.slice(0, 6)
      .map(i => `[${i.metadata.intent ?? i.type}] ${i.title}: ${i.content.slice(0, 120)}`)
      .join('\n');

    const result = await generateTextSafe({
      prompt: `Valuta la qualità del corpus RAG per il blog research sul tema: "${topicTitle}"

CORPUS (${corpus.totalItems} item, ~${corpus.totalTokens} token):
${preview}

STATISTICHE:
- Voci forum/community: ${corpus.items.filter(i => i.metadata.intent === 'support').length}
- Articoli editoriali: ${(corpus.byType.document?.length ?? 0) + (corpus.byType.paragraph?.length ?? 0)}
- Fonti ufficiali: ${summary.manualCount}
- Copertura stimata: ${(corpus.coverageScore * 100).toFixed(0)}%
- Domini unici: ${new Set(corpus.items.map(i => i.domain)).size}

Rispondi SOLO con JSON valido:
{
  "qualityScore": 0.0-1.0,
  "coherenceScore": 0.0-1.0,
  "gaps": ["gap1", "gap2"],
  "strengths": ["strength1"],
  "reasoning": "breve (max 80 caratteri)"
}`,
      maxTokens: 350,
      temperature: 0.2,
      useLiteModel: true,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    const llmScore = typeof parsed.qualityScore === 'number' ? parsed.qualityScore : ruleScore;

    return {
      qualityScore: llmScore,
      coherenceScore: typeof parsed.coherenceScore === 'number' ? parsed.coherenceScore : 0.7,
      coverageScore: corpus.coverageScore,
      needsSecondPass: llmScore < BLOG_QUALITY_THRESHOLD,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : identifyBlogGaps(corpus, summary),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : identifyBlogStrengths(corpus, summary),
      intentsCount,
      conflictsFound: summary.conflictCount,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : `llm=${llmScore.toFixed(2)}`,
    };
  } catch {
    return {
      qualityScore: ruleScore,
      coherenceScore: 0.7,
      coverageScore: corpus.coverageScore,
      needsSecondPass: ruleScore < BLOG_QUALITY_THRESHOLD,
      gaps: identifyBlogGaps(corpus, summary),
      strengths: identifyBlogStrengths(corpus, summary),
      intentsCount,
      conflictsFound: summary.conflictCount,
      reasoning: `rule-based fallback: score=${ruleScore.toFixed(2)}`,
    };
  }
}

/**
 * Genera query mirate per colmare i gap identificati dall'evaluator.
 */
function generateBlogGapQueries(gaps: string[], signal: BlogTopicSignal): string[] {
  const topic = signal.topic;
  const brand = signal.brands?.[0] ?? '';
  const queries: string[] = [];

  for (const gap of gaps) {
    const g = gap.toLowerCase();
    if (g.includes('forum') || g.includes('voci')) {
      queries.push(`${topic} forum opinioni professionisti`);
      queries.push(`${brand} ${topic} reddit`.trim());
    }
    if (g.includes('editoriale') || g.includes('analisi')) {
      queries.push(`${topic} review test hands-on`);
      queries.push(`${topic} guida completa`.trim());
    }
    if (g.includes('ufficiali') || g.includes('validazione')) {
      queries.push(`${brand} ${topic} ufficiale specifiche`.trim());
    }
    if (g.includes('diversità') || g.includes('fonti')) {
      queries.push(`${topic} confronto fonti multiple`);
    }
    if (g.includes('insufficiente')) {
      queries.push(`${topic} discussione problemi consigli`);
    }
  }

  return Array.from(new Set(queries)).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Main orchestrator — 7 layer pipeline
// ---------------------------------------------------------------------------

/**
 * Scopre fonti editoriali per un topic con la stessa pipeline a 7 layer
 * dell'Universal RAG v2, adattata per editorial intelligence.
 *
 * Supporta un secondo pass iterativo se il corpus è insufficiente.
 */
export async function discoverBlogSources(
  signal: BlogTopicSignal
): Promise<BlogDiscoveryResult> {
  const startTime = Date.now();
  const debug: string[] = [];

  // ── Layer 1: Intent Gate ─────────────────────────────────────────────────
  if (!needsBlogRetrieval(signal)) {
    debug.push('[L1] Intent Gate: no retrieval needed');
    log.info('[RagBridge] Intent Gate: skipping retrieval');
    return buildEmptyResult(debug, startTime);
  }
  debug.push('[L1] Intent Gate: retrieval required');

  const intents = selectIntents(signal);
  log.info(`[RagBridge] Topic: "${signal.topic}" | L2 intents: ${intents.join(', ')}`);

  // ── Layer 2: Source Discovery ────────────────────────────────────────────
  const intentResults = await Promise.allSettled(
    intents.map(intent => runIntentSearch(intent, signal, debug))
  );

  const byIntent: Partial<Record<BlogDiscoveryIntent, BlogDiscoveredSource[]>> = {};
  let allSources: BlogDiscoveredSource[] = [];

  for (let i = 0; i < intents.length; i++) {
    const r = intentResults[i];
    if (r.status === 'fulfilled') {
      byIntent[intents[i]] = r.value;
      allSources.push(...r.value);
      debug.push(`[L2:${intents[i]}] ${r.value.length} sources`);
    }
  }

  // Global dedup
  const seen = new Set<string>();
  allSources = allSources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

  debug.push(`[L2] Total unique: ${allSources.length}`);
  log.info(`[RagBridge] L2 complete: ${allSources.length} sources`);

  // ── Layer 3: Domain Navigator ────────────────────────────────────────────
  const discoveredForNav = allSources.map(toDiscoveredSource);
  let navigationResult;
  try {
    navigationResult = await navigateDomains(discoveredForNav, BLOG_NAVIGATION_BUDGET);
    debug.push(`[L3] navigated: ${navigationResult.totalResources} resources in ${navigationResult.executionTimeMs}ms`);
    log.info(`[RagBridge] L3 complete: ${navigationResult.totalResources} navigated resources`);
  } catch (err) {
    debug.push(`[L3] Domain Navigator failed: ${err} — using L2 sources only`);
    log.warn('[RagBridge] L3 Domain Navigator failed, skipping');
    navigationResult = { resources: [] as NavigatedResource[], totalResources: 0, executionTimeMs: 0 };
  }

  // ── Layer 4: Corpus Builder ──────────────────────────────────────────────
  const corpusCollection = buildCorpus(
    navigationResult.resources,
    discoveredForNav,
    7000
  );
  debug.push(`[L4] corpus: ${corpusCollection.totalItems} items, ${corpusCollection.totalTokens} tokens, coverage=${corpusCollection.coverageScore.toFixed(2)}`);
  log.info(`[RagBridge] L4 complete: ${corpusCollection.totalItems} corpus items`);

  // ── Layer 5: Blog Router ─────────────────────────────────────────────────
  const ranked = rankSources(allSources);
  const routed = routeBlogCorpus(ranked);
  debug.push(`[L5] routed: forum=${routed.forum_voices?.length ?? 0} expert=${routed.expert_validation?.length ?? 0} editorial=${routed.editorial_angle?.length ?? 0} official=${routed.official_claim?.length ?? 0}`);

  // ── Layer 7a: Blog Evidence Graph ────────────────────────────────────────
  const evidenceGraph = buildBlogEvidenceGraph(signal.topic, corpusCollection);
  const evidenceGraphSummary = evidenceGraph.getSummary();
  debug.push(`[L7a] evidence graph: ${evidenceGraphSummary.nodeCount} nodes, ${evidenceGraphSummary.edgeCount} edges, ${evidenceGraphSummary.conflictCount} conflicts`);
  log.info(`[RagBridge] L7a complete: ${evidenceGraphSummary.nodeCount} nodes`);

  // ── Layer 7b: Evaluator-Optimizer ────────────────────────────────────────
  let evaluation = await evaluateBlogCorpus(corpusCollection, evidenceGraph, signal.topic, intents.length);
  debug.push(`[L7b] quality=${evaluation.qualityScore.toFixed(2)} needsSecondPass=${evaluation.needsSecondPass}`);
  log.info(`[RagBridge] L7b: quality=${evaluation.qualityScore.toFixed(2)}, gaps=${evaluation.gaps.join(', ')}`);

  let secondPassRan = false;

  // Iterative retrieval se corpus insufficiente (max 1 pass aggiuntivo)
  if (evaluation.needsSecondPass && evaluation.gaps.length > 0) {
    debug.push('[L7b] Triggering second retrieval pass...');
    log.info('[RagBridge] Second pass triggered');
    secondPassRan = true;

    const gapQueries = generateBlogGapQueries(evaluation.gaps, signal);
    const gapSources: BlogDiscoveredSource[] = [];

    for (const query of gapQueries) {
      debug.push(`[L7b:pass2] "${query}"`);
      try {
        const raw = await cachedSearch(
          query, [...FORUM_DOMAINS, ...REVIEW_DOMAINS], 'reviews',
          (q, d) => performWebSearch(q, d, { maxResults: 6 })
        );
        for (const r of raw) {
          const text = `${r.title} ${r.snippet}`;
          gapSources.push({
            url: r.link, title: r.title, snippet: r.snippet,
            intent: 'discussion',
            domain: r.domain,
            confidence: 0.6,
            sourceType: classifySourceType(r.domain, 'discussion'),
            freshness: scoreFreshness(text),
            trustScore: scoreTrust(r.domain),
            language: detectLanguage(text),
            provider: r.provider,
          });
        }
      } catch (err) {
        debug.push(`[L7b:pass2] query failed: ${err}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // Merge new sources (dedup)
    const seenPass2 = new Set(allSources.map(s => s.url));
    const newUnique = gapSources.filter(s => { if (seenPass2.has(s.url)) return false; seenPass2.add(s.url); return true; });
    allSources.push(...newUnique);
    debug.push(`[L7b:pass2] +${newUnique.length} new sources`);

    // Rebuild corpus with enriched sources
    const enrichedCorpus = buildCorpus(
      navigationResult.resources,
      allSources.map(toDiscoveredSource),
      7000
    );
    const enrichedGraph = buildBlogEvidenceGraph(signal.topic, enrichedCorpus);
    evaluation = await evaluateBlogCorpus(enrichedCorpus, enrichedGraph, signal.topic, intents.length + 1);
    debug.push(`[L7b:pass2] quality after=${evaluation.qualityScore.toFixed(2)}`);
    log.info(`[RagBridge] After second pass: quality=${evaluation.qualityScore.toFixed(2)}`);
  }

  // Final context for AI synthesis
  const topSnippets = corpusToContext(corpusCollection, 3500);

  const executionTimeMs = Date.now() - startTime;
  log.info(`[RagBridge] Complete: ${allSources.length} sources, quality=${evaluation.qualityScore.toFixed(2)}, ${executionTimeMs}ms`);

  return {
    sources: ranked,
    byIntent,
    routed,
    corpusCollection,
    evidenceGraph,
    evidenceGraphSummary,
    evaluation,
    secondPassRan,
    topSnippets,
    executionTimeMs,
    debugLog: debug,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyResult(debug: string[], startTime: number): BlogDiscoveryResult {
  const emptyCorpus: CorpusCollection = {
    items: [], byType: {}, totalItems: 0, totalTokens: 0,
    hasPdf: false, hasTable: false, hasImage: false, coverageScore: 0,
  };
  const emptyGraph = buildEvidenceGraph('', '', []);
  return {
    sources: [], byIntent: {}, routed: {},
    corpusCollection: emptyCorpus,
    evidenceGraph: emptyGraph,
    evidenceGraphSummary: emptyGraph.getSummary(),
    evaluation: {
      qualityScore: 0, coherenceScore: 0, coverageScore: 0,
      needsSecondPass: false, gaps: [], strengths: [],
      intentsCount: 0, conflictsFound: 0, reasoning: 'skipped by intent gate',
    },
    secondPassRan: false,
    topSnippets: '',
    executionTimeMs: Date.now() - startTime,
    debugLog: debug,
  };
}
