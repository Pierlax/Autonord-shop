/**
 * UniversalRAG Integration Module — v2
 *
 * Integrates all UniversalRAG paper improvements plus the v2 navigation/discovery
 * extension for dynamic corpus construction at query time.
 *
 * Seven-layer architecture:
 *   1. Intent Gate            — No-retrieval detection
 *   2. Source Discovery       — Multi-intent domain-filtered search (NEW v2)
 *   3. Domain Navigation      — Controlled URL navigation with budget (NEW v2)
 *   4. Corpus Builder         — Typed corpora per modality/granularity (NEW v2)
 *   5. Universal Router       — Source routing + extended V2 labels (EXTENDED v2)
 *   6. Retrieval + Rerank     — Hybrid search on enriched corpus (EXTENDED v2)
 *   7. Synthesis + Memory     — Evidence Graph + Evaluator-Optimizer (NEW v2)
 *
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora
 * of Diverse Modalities and Granularities" (KAIST, 2026) + v2 extensions.
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

import { 
  SourceType, 
  RoutingDecision, 
  ensembleRoute, 
  routeProductQuery,
  getOptimizedQueries 
} from './source-router';

import {
  GranularityLevel,
  GranularityDecision,
  determineGranularity,
  detectGranularityRules,
  adaptGranularity,
  chunkByGranularity,
  scoreChunks,
  selectChunksWithinBudget
} from './granularity-retrieval';

import { 
  RetrievalDecision, 
  decideRetrievalStrategy,
  detectRetrievalNeedRules,
  generateParametricResponse,
  canUseCachedKnowledge 
} from './no-retrieval-detector';

import { 
  FusionPlan, 
  FusionResult,
  createFusionPlan,
  executeFusionPlan,
  optimizeFusionPlan,
  generateFusionReport 
} from './proactive-fusion';

import {
  loadBenchmarks,
  getBenchmarkContext,
  generateComparisonContext,
  getMainCompetitor,
  isBenchmarkDataAvailable,
  BenchmarkData,
  ReferenceProduct,
  BrandProfile,
} from './benchmark-loader';

import {
  sourceTypeToSearchIntent,
  isWhitelistedDomain,
  getSourceConfidence,
  getDomainsForIntent,
  SearchIntent,
} from './rag-sources';

import { performWebSearch, SearchResult } from './search-client';
import { cachedSearch, CacheIntent } from './rag-cache';
import { getKnowledgeGraph, PowerToolKnowledgeGraph } from './knowledge-graph';

// v2 imports
import {
  discoverSources,
  discoveredSourceToSearchResult,
  DiscoveryResult,
  DiscoverySignal,
  DiscoveryIntent,
} from './source-discovery';
import {
  navigateDomains,
  NavigationResult,
  NavigationBudget,
} from './domain-navigator';
import {
  buildCorpus,
  corpusToContext,
  corpusToSearchResults,
  CorpusCollection,
} from './corpus-builder';
import {
  buildEvidenceGraph,
  EvidenceGraph,
  EvidenceGraphSummary,
} from './evidence-graph';
import {
  evaluateCorpus,
  generateGapQueries,
  EvaluationResult,
  OptimizerResult,
  OptimizationPass,
} from './evaluator-optimizer';

// ---------------------------------------------------------------------------
// V2: Extended routing labels (more operational than source types)
// ---------------------------------------------------------------------------

/**
 * Extended routing labels for Autonord v2.
 * More granular than the paper's modality/granularity split:
 * each label maps to a specific retrieval strategy + corpus type combination.
 */
export type V2RoutingLabel =
  | 'none'                // No retrieval needed
  | 'spec_short'          // Brief specs (fact-level granularity)
  | 'spec_full'           // Full technical spec sheet (document-level)
  | 'manual_pdf'          // PDF manual retrieval
  | 'compatibility_table' // Compatibility matrix (table corpus)
  | 'image_gallery'       // Image discovery (visual corpus)
  | 'support_page'        // Support / FAQ page
  | 'forum_discussion';   // Forum / community discussion

/** Maps V2RoutingLabel to the best DiscoveryIntents to activate. */
const V2_LABEL_TO_INTENTS: Record<V2RoutingLabel, DiscoveryIntent[]> = {
  none:                [],
  spec_short:          ['product'],
  spec_full:           ['product', 'manual'],
  manual_pdf:          ['manual', 'download'],
  compatibility_table: ['compatibility', 'manual'],
  image_gallery:       ['product'],
  support_page:        ['support', 'download'],
  forum_discussion:    ['support'],
};

// Pipeline configuration
export interface UniversalRAGConfig {
  enableSourceRouting: boolean;
  enableGranularityAware: boolean;
  enableNoRetrievalDetection: boolean;
  enableProactiveFusion: boolean;
  enableBenchmarkContext: boolean;  // Load competitor benchmarks

  // ── V2 extensions ────────────────────────────────────────────────────────
  /** Layer 2: Multi-intent source discovery before routing. */
  enableSourceDiscovery: boolean;
  /** Layer 3: Controlled domain navigation with budget. */
  enableDomainNavigation: boolean;
  /** Layer 4: Build typed corpora (pdf, table, spec_sheet, …). */
  enableCorpusBuilder: boolean;
  /** Layer 7 – memory: Session evidence graph. */
  enableEvidenceGraph: boolean;
  /** Layer 7 – loop: Evaluator-Optimizer iterative retrieval. */
  enableEvaluatorOptimizer: boolean;
  /** Max URLs to keep per domain during navigation (default: 5). */
  navigationBudgetPerDomain: number;
  /** Max navigation depth (0 = direct, 1-2 = follow-up, default: 2). */
  navigationDepth: number;
  /** Max evaluator-optimizer passes (default: 2). */
  maxRetrievalPasses: number;
  // ─────────────────────────────────────────────────────────────────────────

  maxSources: number;
  maxTokenBudget: number;
  timeoutMs: number;
  debugMode: boolean;
}

const DEFAULT_CONFIG: UniversalRAGConfig = {
  enableSourceRouting: true,
  enableGranularityAware: true,
  enableNoRetrievalDetection: true,
  enableProactiveFusion: true,
  enableBenchmarkContext: true,
  // V2 defaults — all enabled
  enableSourceDiscovery: true,
  enableDomainNavigation: true,
  enableCorpusBuilder: true,
  enableEvidenceGraph: true,
  enableEvaluatorOptimizer: true,
  navigationBudgetPerDomain: 5,
  navigationDepth: 2,
  maxRetrievalPasses: 2,
  maxSources: 5,
  maxTokenBudget: 6000,
  timeoutMs: 30000,
  debugMode: false,
};

// Pipeline execution result
export interface UniversalRAGResult {
  success: boolean;
  data: any;
  knowledgeGraphContext?: {
    brandInfo: string | null;
    categoryInfo: string | null;
    batterySystem: string | null;
    suitableForTrades: string[];
    relatedUseCases: string[];
    crossSellSuggestions: string[];
  };
  /** V2 layer outputs — undefined when v2 is disabled. */
  v2?: {
    discoverySourceCount: number;
    navigationResourceCount: number;
    corpusTokens: number;
    corpusCoverage: number;
    hasPdf: boolean;
    hasTable: boolean;
    evidenceGraphSummary?: EvidenceGraphSummary;
    evaluationResult?: EvaluationResult;
    optimizerResult?: OptimizerResult;
    v2RoutingLabel?: V2RoutingLabel;
    corpusContext: string;  // Pre-built context string injected into enrichedData
  };
  metadata: {
    routingDecision?: RoutingDecision;
    granularityDecision?: GranularityDecision;
    retrievalDecision?: RetrievalDecision;
    fusionPlan?: FusionPlan;
    fusionResult?: FusionResult;
    benchmarkContext?: {
      brandProfile: BrandProfile | null;
      competitors: ReferenceProduct[];
      comparisonContextLength: number;
    };
    executionTimeMs: number;
    sourcesQueried: SourceType[];
    tokensUsed: number;
    costSavings: number;
  };
  debugLog: string[];
}

// Pipeline state for tracking
interface PipelineState {
  startTime: number;
  debugLog: string[];
  sourcesQueried: SourceType[];
  tokensUsed: number;
  costSavings: number;
}

/**
 * Main UniversalRAG Pipeline
 * 
 * Orchestrates all UniversalRAG improvements for product enrichment
 */
export class UniversalRAGPipeline {
  private config: UniversalRAGConfig;
  
  constructor(config: Partial<UniversalRAGConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Execute the full UniversalRAG pipeline for product enrichment
   */
  async enrichProduct(
    productTitle: string,
    vendor: string,
    productType: string,
    sku: string,
    enrichmentType: 'specs' | 'description' | 'pros_cons' | 'faqs' | 'full' = 'full'
  ): Promise<UniversalRAGResult> {
    const state: PipelineState = {
      startTime: Date.now(),
      debugLog: [],
      sourcesQueried: [],
      tokensUsed: 0,
      costSavings: 0,
    };
    
    this.log(state, `Starting UniversalRAG pipeline for: ${vendor} ${productTitle}`);
    this.log(state, `Enrichment type: ${enrichmentType}`);
    
    // NEW: Load benchmark context FIRST (Ancora di Verità)
    let benchmarkContext: {
      brandProfile: BrandProfile | null;
      competitors: ReferenceProduct[];
      comparisonContext: string;
    } | undefined;
    
    if (this.config.enableBenchmarkContext) {
      const { brandProfile, competitors } = getBenchmarkContext(vendor, productType);
      const comparisonContext = generateComparisonContext(vendor, productType);
      
      if (brandProfile || competitors.length > 0) {
        benchmarkContext = {
          brandProfile,
          competitors,
          comparisonContext,
        };
        this.log(state, `Benchmark context loaded: ${brandProfile ? 'Brand profile found' : 'No brand profile'}, ${competitors.length} competitors`);
      } else {
        this.log(state, 'WARNING: No benchmark data available - proceeding without Ancora di Verità');
      }
    }
    
    // ── V2 Layer 2-4: Source Discovery → Domain Navigation → Corpus Builder ──
    // Runs BEFORE the existing routing so discovered corpus items can be
    // injected into the retrieval data maps as additional search results.
    let v2DiscoveryResult: DiscoveryResult | undefined;
    let v2NavigationResult: NavigationResult | undefined;
    let v2Corpus: CorpusCollection | undefined;
    let v2EvidenceGraph: EvidenceGraph | undefined;
    let v2RoutingLabel: V2RoutingLabel | undefined;
    let v2OptimizerResult: OptimizerResult | undefined;

    if (this.config.enableSourceDiscovery) {
      const v2Data = await this.runV2Discovery(
        productTitle, vendor, sku, productType, state
      );
      v2DiscoveryResult = v2Data.discoveryResult;
      v2NavigationResult = v2Data.navigationResult;
      v2Corpus = v2Data.corpus;
      v2RoutingLabel = v2Data.routingLabel;
    }

    try {
      // Step 1: Check if retrieval is needed
      let retrievalDecision: RetrievalDecision | undefined;
      if (this.config.enableNoRetrievalDetection) {
        retrievalDecision = await decideRetrievalStrategy(productTitle, vendor, enrichmentType);
        this.log(state, `Retrieval decision: ${retrievalDecision.need} (${retrievalDecision.reasoning})`);
        
        if (retrievalDecision.need === 'unnecessary') {
          // Can use parametric knowledge
          state.costSavings = retrievalDecision.estimatedCostSavings;
          const parametricResult = await generateParametricResponse(
            `Genera contenuto ${enrichmentType} per ${vendor} ${productTitle}`,
            retrievalDecision.knowledgeType
          );
          
          return this.createResult(true, parametricResult, state, {
            retrievalDecision,
          });
        }
      }
      
      // Step 2: Route to appropriate sources
      let routingDecision: RoutingDecision | undefined;
      if (this.config.enableSourceRouting) {
        routingDecision = await routeProductQuery(productTitle, vendor, productType);
        this.log(state, `Routing decision: ${routingDecision.primarySources.join(', ')} (${routingDecision.reasoning})`);
      }
      
      // Step 3: Determine granularity
      let granularityDecision: GranularityDecision | undefined;
      if (this.config.enableGranularityAware) {
        // Base decision from enrichment type mapping
        granularityDecision = await determineGranularity(productTitle, vendor, enrichmentType);

        // Refine with rule-based detection on the actual product context
        // e.g. if the title contains comparison words → use 'section' instead of 'paragraph'
        const contextQuery = `${productTitle} ${vendor}`;
        const rulesDecision = detectGranularityRules(contextQuery);
        const levels: GranularityLevel[] = ['fact', 'sentence', 'paragraph', 'section', 'document'];
        const baseIdx = levels.indexOf(granularityDecision.level);
        const rulesIdx = levels.indexOf(rulesDecision.level);

        if (rulesDecision.confidence >= 0.8 && rulesIdx < baseIdx) {
          // Rules detected a finer, high-confidence granularity — prefer it
          granularityDecision = rulesDecision;
          this.log(state, `Granularity refined by rules: ${rulesDecision.level} (${rulesDecision.reasoning})`);
        }

        this.log(state, `Granularity: ${granularityDecision.level} (max ${granularityDecision.maxTokens} tokens, confidence: ${granularityDecision.confidence})`);
      }
      
      // Step 4: Create fusion plan
      let fusionPlan: FusionPlan | undefined;
      if (this.config.enableProactiveFusion) {
        fusionPlan = await createFusionPlan(productTitle, vendor, productType, enrichmentType);
        
        // Optimize based on constraints
        fusionPlan = optimizeFusionPlan(fusionPlan, {
          maxSources: this.config.maxSources,
          maxTokenBudget: this.config.maxTokenBudget,
          timeoutMs: this.config.timeoutMs,
        });
        
        this.log(state, `Fusion plan: ${fusionPlan.strategy} strategy, ${fusionPlan.sourceGroups.length} source groups`);
      }
      
      // Step 5: Execute retrieval with optimized parameters
      const retrievedData = await this.executeRetrieval(
        productTitle,
        vendor,
        sku,
        routingDecision,
        granularityDecision,
        fusionPlan,
        state
      );

      // V2: Inject corpus items into retrieval data so the existing fusion/
      // granularity pipeline processes them together with web search results.
      if (v2Corpus && v2Corpus.totalItems > 0) {
        this.injectCorpusIntoRetrieval(v2Corpus, retrievedData, state);
      }
      
      // Step 5.5: Adapt granularity based on actual retrieved content density
      // If content is sparse (low density) → increase granularity (fetch more context)
      // If content is very dense (high density) → decrease granularity (trim to essentials)
      if (granularityDecision && this.config.enableGranularityAware) {
        const density = this.computeInformationDensity(retrievedData, productTitle, vendor);
        const adapted = adaptGranularity(granularityDecision, 0, density);
        if (adapted.level !== granularityDecision.level) {
          this.log(state, `Granularity adapted: ${granularityDecision.level} → ${adapted.level} (density: ${density.toFixed(2)})`);
          granularityDecision = adapted;
        } else {
          this.log(state, `Granularity stable: ${granularityDecision.level} (density: ${density.toFixed(2)})`);
        }
      }

      // Step 6: Execute fusion
      let fusionResult: FusionResult | undefined;
      if (this.config.enableProactiveFusion && fusionPlan) {
        fusionResult = await executeFusionPlan(fusionPlan, retrievedData);
        this.log(state, `Fusion result: ${fusionResult.combinedEvidence.length} evidence items, ${fusionResult.conflictsDetected.length} conflicts resolved`);
        
        if (this.config.debugMode) {
          this.log(state, generateFusionReport(fusionPlan, fusionResult));
        }
      }
      
      // Step 6.5: Knowledge Graph — Enrich context & update graph with RAG findings
      const kgContext = this.enrichWithKnowledgeGraph(
        productTitle,
        vendor,
        productType,
        retrievedData,
        state
      );
      
      // V2: Build Evidence Graph from corpus (session memory)
      if (this.config.enableEvidenceGraph && v2Corpus && v2Corpus.totalItems > 0) {
        v2EvidenceGraph = buildEvidenceGraph(
          `${vendor} ${productTitle}`,
          '',
          v2Corpus.items
        );
        this.log(
          state,
          `EvidenceGraph: ${v2EvidenceGraph.nodeCount} nodes, ` +
            `${v2EvidenceGraph.edgeCount} edges, ` +
            `${v2EvidenceGraph.detectConflicts().length} conflicts`
        );

        // V2: Evaluator-Optimizer loop
        if (this.config.enableEvaluatorOptimizer) {
          v2OptimizerResult = await this.runEvaluatorOptimizer(
            v2Corpus,
            v2EvidenceGraph,
            productTitle,
            vendor,
            sku,
            retrievedData,
            granularityDecision,
            state
          );
        }
      }

      // Step 7: Prepare final result
      const enrichedData = this.prepareEnrichedData(
        retrievedData,
        fusionResult,
        granularityDecision
      );
      
      // Inject benchmark context into enriched data
      if (benchmarkContext) {
        enrichedData.benchmarkContext = benchmarkContext.comparisonContext;
        enrichedData.brandProfile = benchmarkContext.brandProfile;
        enrichedData.competitors = benchmarkContext.competitors;
      }

      // V2: Inject corpus context and evidence graph context into enrichedData.
      // rag-adapter reads enrichedData and builds sourceData from it —
      // adding v2CorpusContext here gives it rich, pre-structured content.
      if (v2Corpus && v2Corpus.totalItems > 0) {
        enrichedData.v2CorpusContext = corpusToContext(v2Corpus, 3000);
        enrichedData.v2HasPdf = v2Corpus.hasPdf;
        enrichedData.v2HasTable = v2Corpus.hasTable;
      }
      if (v2EvidenceGraph) {
        enrichedData.v2EvidenceGraphContext = v2EvidenceGraph.buildContext();
      }

      const result = this.createResult(true, enrichedData, state, {
        routingDecision,
        granularityDecision,
        retrievalDecision,
        fusionPlan,
        fusionResult,
        benchmarkContext: benchmarkContext ? {
          brandProfile: benchmarkContext.brandProfile,
          competitors: benchmarkContext.competitors,
          comparisonContextLength: benchmarkContext.comparisonContext.length,
        } : undefined,
      });

      // Attach KG context to result for downstream consumers (ai-enrichment-v3)
      result.knowledgeGraphContext = kgContext;

      // Attach v2 layer outputs
      if (v2Corpus) {
        const evalResult = v2OptimizerResult?.evaluation;
        result.v2 = {
          discoverySourceCount: v2DiscoveryResult?.totalFound ?? 0,
          navigationResourceCount: v2NavigationResult?.totalResources ?? 0,
          corpusTokens: v2Corpus.totalTokens,
          corpusCoverage: v2Corpus.coverageScore,
          hasPdf: v2Corpus.hasPdf,
          hasTable: v2Corpus.hasTable,
          evidenceGraphSummary: v2EvidenceGraph?.getSummary(),
          evaluationResult: evalResult,
          optimizerResult: v2OptimizerResult,
          v2RoutingLabel,
          corpusContext: enrichedData.v2CorpusContext ?? '',
        };
        this.log(
          state,
          `V2 summary: discovery=${result.v2.discoverySourceCount}, ` +
            `nav=${result.v2.navigationResourceCount}, ` +
            `corpus=${result.v2.corpusTokens}tok, ` +
            `coverage=${result.v2.corpusCoverage.toFixed(2)}, ` +
            `pdf=${result.v2.hasPdf}, table=${result.v2.hasTable}, ` +
            `quality=${evalResult?.qualityScore?.toFixed(2) ?? 'n/a'}`
        );
      }

      return result;
      
    } catch (error) {
      this.log(state, `Pipeline error: ${error}`);
      return this.createResult(false, { error: String(error) }, state, {});
    }
  }
  
  /**
   * Execute retrieval based on pipeline decisions
   */
  private async executeRetrieval(
    productTitle: string,
    vendor: string,
    sku: string,
    routingDecision: RoutingDecision | undefined,
    granularityDecision: GranularityDecision | undefined,
    fusionPlan: FusionPlan | undefined,
    state: PipelineState
  ): Promise<Map<SourceType, any[]>> {
    const retrievedData = new Map<SourceType, any[]>();
    
    // Determine which sources to query
    let sourcesToQuery: SourceType[] = [];
    
    if (fusionPlan) {
      // Use fusion plan's source groups
      for (const group of fusionPlan.sourceGroups) {
        sourcesToQuery.push(...group.sources);
      }
    } else if (routingDecision) {
      // Use routing decision
      sourcesToQuery = [...routingDecision.primarySources, ...routingDecision.secondarySources];
    } else {
      // Default sources
      sourcesToQuery = ['official_specs', 'retailer_data', 'user_reviews'];
    }
    
    // Deduplicate
    sourcesToQuery = Array.from(new Set(sourcesToQuery));
    
    // Limit to max sources
    sourcesToQuery = sourcesToQuery.slice(0, this.config.maxSources);
    
    this.log(state, `Querying sources: ${sourcesToQuery.join(', ')}`);
    
    // Execute retrieval for each source (in parallel)
    const retrievalPromises = sourcesToQuery.map(async (source) => {
      try {
        const queries = getOptimizedQueries(productTitle, vendor, sku, source);
        
        // Execute retrieval using whitelisted RAG sources
        const results = await this.executeSourceAwareRetrieval(
          source, queries, productTitle, vendor, granularityDecision
        );
        
        state.sourcesQueried.push(source);
        state.tokensUsed += this.estimateTokens(results);
        
        return { source, results };
      } catch (error) {
        this.log(state, `Retrieval failed for ${source}: ${error}`);
        return { source, results: [] };
      }
    });
    
    const retrievalResults = await Promise.all(retrievalPromises);
    
    for (const { source, results } of retrievalResults) {
      retrievedData.set(source, results);
    }
    
    return retrievedData;
  }
  
  /**
   * Execute retrieval using whitelisted RAG sources.
   * 
   * Performs REAL web searches via search-client.ts, with results
   * cached by rag-cache.ts to avoid redundant API calls.
   * 
   * Flow:
   * 1. Map SourceType → SearchIntent (determines which domains to query)
   * 2. Get whitelisted domains for the intent
   * 3. For each query: check cache → if miss, call performWebSearch()
   * 4. Aggregate all results into structured retrieval data
   */
  private async executeSourceAwareRetrieval(
    source: SourceType,
    queries: string[],
    productTitle: string,
    vendor: string,
    granularityDecision?: GranularityDecision
  ): Promise<any[]> {
    // Map the SourceType to a SearchIntent for domain selection
    const intent: SearchIntent = sourceTypeToSearchIntent(source);
    const cacheIntent: CacheIntent = intent as CacheIntent;
    
    // Get whitelisted domains for this intent (primary only for focused search)
    const domains = getDomainsForIntent(intent, false);
    
    log.info(`[UniversalRAG] Source: ${source} → Intent: ${intent}, Domains: ${domains.length}`);
    
    // Execute searches for each query (with caching)
    const allResults: SearchResult[] = [];
    
    for (const query of queries) {
      try {
        // cachedSearch checks cache first, then calls performWebSearch on miss
        const results = await cachedSearch(
          query,
          domains,
          cacheIntent,
          performWebSearch
        );
        allResults.push(...results);
      } catch (error) {
        log.error(`[UniversalRAG] Search failed for query "${query.substring(0, 60)}...": ${error}`);
      }
    }
    
    log.info(`[UniversalRAG] Retrieved ${allResults.length} total results for source ${source}`);
    
    // Transform SearchResult[] into structured retrieval data for the pipeline
    const mappedResults = allResults.map(result => ({
      source,
      sourceType: source,
      intent,
      // Content fields (used by rag-adapter.ts to build sourceData)
      content: result.snippet,
      text: result.snippet,
      title: result.title,
      url: result.link,
      domain: result.domain,
      // Confidence based on domain whitelist status
      confidence: isWhitelistedDomain(result.link)
        ? getSourceConfidence(result.link)
        : 0.5,
      // Metadata
      granularity: granularityDecision?.level || 'paragraph',
      provider: result.provider,
      queryMetadata: {
        isWhitelisted: isWhitelistedDomain(result.link),
        intent,
        timestamp: new Date().toISOString(),
      },
    }));

    // Apply granularity-aware chunking + scoring to filter content within token budget
    if (granularityDecision && mappedResults.length > 0) {
      return this.applyGranularityFilter(mappedResults, queries, granularityDecision);
    }
    return mappedResults;
  }
  
  /**
   * Prepare enriched data from retrieval and fusion results
   */
  private prepareEnrichedData(
    retrievedData: Map<SourceType, any[]>,
    fusionResult: FusionResult | undefined,
    granularityDecision: GranularityDecision | undefined
  ): any {
    if (fusionResult && fusionResult.combinedEvidence.length > 0) {
      return {
        evidence: fusionResult.combinedEvidence,
        coverage: fusionResult.coverageScore,
        confidence: fusionResult.confidenceScore,
        conflicts: fusionResult.conflictsDetected,
        granularity: granularityDecision?.level,
      };
    }

    // Fallback: return raw retrieved data keyed by source type.
    // rag-adapter.ts handles this format in its second evidence-extraction path.
    const rawData: any = {};
    for (const [source, data] of Array.from(retrievedData.entries())) {
      rawData[source] = data;
    }
    // Preserve fusion metadata even when using raw data
    if (fusionResult) {
      rawData._fusionCoverage = fusionResult.coverageScore;
      rawData._fusionConflicts = fusionResult.conflictsDetected;
    }
    return rawData;
  }
  
  /**
   * Create pipeline result
   */
  private createResult(
    success: boolean,
    data: any,
    state: PipelineState,
    metadata: Partial<UniversalRAGResult['metadata']>
  ): UniversalRAGResult {
    return {
      success,
      data,
      metadata: {
        ...metadata,
        executionTimeMs: Date.now() - state.startTime,
        sourcesQueried: state.sourcesQueried,
        tokensUsed: state.tokensUsed,
        costSavings: state.costSavings,
      },
      debugLog: state.debugLog,
    };
  }
  
  /**
   * Log message to debug log
   */
  private log(state: PipelineState, message: string): void {
    const timestamp = new Date().toISOString();
    state.debugLog.push(`[${timestamp}] ${message}`);
    
    if (this.config.debugMode) {
      log.info(`[UniversalRAG] ${message}`);
    }
  }
  
  /**
   * Enrich product context with Knowledge Graph and update graph with RAG findings.
   * 
   * This step:
   * 1. Queries the KG for existing knowledge about the product's brand/category
   * 2. Extracts compatibility relationships from RAG results and updates the KG
   * 3. Returns structured context for downstream content generation
   */
  private enrichWithKnowledgeGraph(
    productTitle: string,
    vendor: string,
    productType: string,
    retrievedData: Map<SourceType, any[]>,
    state: PipelineState
  ): UniversalRAGResult['knowledgeGraphContext'] {
    // Known battery systems to detect in RAG compatibility text
    const BATTERY_SYSTEM_PATTERNS: { pattern: RegExp; systemId: string; name: string }[] = [
      { pattern: /\bm18\b/i, systemId: 'battery_m18', name: 'Milwaukee M18' },
      { pattern: /\bm12\b/i, systemId: 'battery_m12', name: 'Milwaukee M12' },
      { pattern: /\blxt\b/i, systemId: 'battery_lxt', name: 'Makita LXT' },
      { pattern: /\bflexvolt\b/i, systemId: 'battery_flexvolt', name: 'DeWalt FlexVolt' },
      { pattern: /\b(xr|dcb)\b/i, systemId: 'battery_xr', name: 'DeWalt XR' },
      { pattern: /\bprocore\b/i, systemId: 'battery_procore', name: 'Bosch ProCORE' },
      { pattern: /\bnuron\b/i, systemId: 'battery_nuron', name: 'Hilti Nuron' },
      { pattern: /\blihd\b/i, systemId: 'battery_lihd', name: 'Metabo LiHD' },
      { pattern: /\bmulti[- ]?volt\b/i, systemId: 'battery_multivolt', name: 'HiKOKI Multi Volt' },
    ];

    try {
      const kg = getKnowledgeGraph();

      // Query existing KG knowledge
      const context = kg.enrichProductContext(productTitle, vendor, productType);

      // Register this product in the KG so we can attach discovered relations to it
      const brandId = vendor.toLowerCase().replace(/\s+/g, '_');
      const categoryId = context.categoryInfo?.id.replace('category_', '');
      const productNodeId = kg.registerDiscoveredProduct(
        productTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60),
        productTitle,
        brandId,
        categoryId
      );

      // Extract compatibility relationships from RAG text and persist them to the KG
      const compatibilityPatterns = [
        /compatibil[ei]\s+con\s+([\w\s]{2,40})/gi,
        /compatible\s+with\s+([\w\s]{2,40})/gi,
        /funziona\s+con\s+([\w\s]{2,40})/gi,
        /works\s+with\s+([\w\s]{2,40})/gi,
        /batteria?\s+([\w\d]{2,20})\s+compatibil/gi,
      ];

      let relationsFound = 0;
      let discoveredBatterySystem: string | null = null;

      for (const [source, items] of Array.from(retrievedData.entries())) {
        for (const item of items) {
          const text = item.content || item.text || '';
          for (const pattern of compatibilityPatterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
              const compatText = match[1]?.trim();
              if (!compatText || compatText.length < 2) continue;

              relationsFound++;
              this.log(state, `KG: Found compatibility: "${compatText}" from ${source}`);

              // Identify and persist battery system — write actual edge to the KG
              if (!discoveredBatterySystem) {
                for (const { pattern: bp, systemId, name } of BATTERY_SYSTEM_PATTERNS) {
                  if (bp.test(compatText)) {
                    discoveredBatterySystem = name;
                    kg.addRelation(productNodeId, systemId, 'uses_battery');
                    this.log(state, `KG: Persisted uses_battery edge → ${systemId}`);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // Build cross-sell suggestions from KG
      const crossSellSuggestions: string[] = [];
      if (context.suitableForTrades.length > 0) {
        for (const trade of context.suitableForTrades.slice(0, 2)) {
          const tradeId = trade.id.replace('trade_', '');
          const tradeProducts = kg.findProductsForTrade(tradeId);
          for (const p of tradeProducts.slice(0, 3)) {
            if (!p.name.toLowerCase().includes(productTitle.toLowerCase().slice(0, 10))) {
              crossSellSuggestions.push(p.name);
            }
          }
        }
      }

      this.log(state, `KG: Brand=${context.brandInfo?.name || 'unknown'}, Category=${context.categoryInfo?.name || 'unknown'}, Trades=${context.suitableForTrades.length}, Relations found=${relationsFound}, CrossSell=${crossSellSuggestions.length}, BatteryDiscovered=${discoveredBatterySystem || 'none'}`);

      return {
        brandInfo: context.brandInfo ? JSON.stringify(context.brandInfo.properties) : null,
        categoryInfo: context.categoryInfo ? context.categoryInfo.name : null,
        // Prefer RAG-discovered battery system if KG didn't resolve one from brand info
        batterySystem: context.batterySystem ? context.batterySystem.name : discoveredBatterySystem,
        suitableForTrades: context.suitableForTrades.map(t => t.name),
        relatedUseCases: context.relatedUseCases.map(u => u.name),
        crossSellSuggestions: Array.from(new Set(crossSellSuggestions)).slice(0, 5),
      };
    } catch (error) {
      this.log(state, `KG enrichment failed (non-blocking): ${error}`);
      return {
        brandInfo: null,
        categoryInfo: null,
        batterySystem: null,
        suitableForTrades: [],
        relatedUseCases: [],
        crossSellSuggestions: [],
      };
    }
  }
  
  /**
   * Apply granularity-aware chunking and scoring to filter retrieval results
   * within the token and chunk budget determined by the granularity decision.
   *
   * Each result's content is split into sub-chunks at the target granularity,
   * scored for relevance, and only the top-scoring chunks within budget are kept.
   * Falls back to original results if filtering is too aggressive.
   */
  private applyGranularityFilter(
    results: any[],
    queries: string[],
    decision: GranularityDecision
  ): any[] {
    // Extract sub-chunks from each result's content, preserving result metadata
    const chunksWithMeta: Array<{ chunk: string; meta: any }> = [];

    for (const result of results) {
      const content = result.content || result.text || '';
      if (!content) {
        chunksWithMeta.push({ chunk: content, meta: result });
        continue;
      }
      const subChunks = chunkByGranularity(content, decision.level);
      if (subChunks.length === 0) {
        chunksWithMeta.push({ chunk: content, meta: result });
      } else {
        for (const chunk of subChunks) {
          chunksWithMeta.push({ chunk, meta: result });
        }
      }
    }

    if (chunksWithMeta.length === 0) return results;

    // Score all chunks by relevance to the queries
    const primaryQuery = queries[0] || '';
    const keywords = queries
      .flatMap(q => q.split(/\s+/))
      .filter(w => w.length > 3);

    const chunkTexts = chunksWithMeta.map(c => c.chunk);
    const scored = scoreChunks(chunkTexts, primaryQuery, keywords);

    // Select within token and chunk budget
    const selected = selectChunksWithinBudget(scored, decision.maxTokens, decision.maxChunks);

    // Fallback: if selection eliminated everything, return original results
    if (selected.length === 0) return results;

    // Map selected chunks back to result objects (preserving URL, domain, confidence, etc.)
    const selectedSet = new Set(selected);
    const seen = new Set<string>();
    const filtered: any[] = [];

    for (const { chunk, meta } of chunksWithMeta) {
      if (selectedSet.has(chunk) && !seen.has(chunk)) {
        seen.add(chunk);
        filtered.push({ ...meta, content: chunk, text: chunk, _granularityFiltered: true });
      }
    }

    log.info(`[UniversalRAG] Granularity filter (${decision.level}): ${chunksWithMeta.length} chunks → ${filtered.length} selected (budget: ${decision.maxTokens} tokens)`);
    return filtered.length > 0 ? filtered : results;
  }

  /**
   * Compute information density of retrieved content relative to the product.
   * Returns a 0–1 score: 1.0 = all items mention keywords, 0.0 = none do.
   * Used by adaptGranularity() to decide whether to expand or contract context.
   */
  private computeInformationDensity(
    retrievedData: Map<SourceType, any[]>,
    productTitle: string,
    vendor: string
  ): number {
    const keywords = `${productTitle} ${vendor}`
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);

    if (keywords.length === 0) return 0.5;

    let totalItems = 0;
    let relevantItems = 0;

    for (const items of Array.from(retrievedData.values())) {
      for (const item of items) {
        const text = (item.content || item.text || '').toLowerCase();
        if (!text) continue;
        totalItems++;
        if (keywords.some(kw => text.includes(kw))) relevantItems++;
      }
    }

    return totalItems > 0 ? relevantItems / totalItems : 0.5;
  }

  /**
   * Estimate tokens from content
   */
  private estimateTokens(content: any): number {
    const str = JSON.stringify(content);
    return Math.ceil(str.length / 4);
  }

  // ── V2 private methods ────────────────────────────────────────────────────

  /**
   * V2 Layer 2-4: Source Discovery → Domain Navigation → Corpus Builder.
   *
   * Determines the V2RoutingLabel from the product signals, selects the
   * appropriate DiscoveryIntents, runs source discovery, navigates discovered
   * URLs within budget, and builds a typed CorpusCollection.
   *
   * Returns the three layer outputs for injection into the main pipeline.
   */
  private async runV2Discovery(
    productTitle: string,
    vendor: string,
    sku: string,
    productType: string,
    state: PipelineState
  ): Promise<{
    discoveryResult: DiscoveryResult;
    navigationResult: NavigationResult;
    corpus: CorpusCollection;
    routingLabel: V2RoutingLabel;
  }> {
    this.log(state, `V2 Discovery starting for: ${vendor} ${productTitle}`);

    // Determine V2RoutingLabel from enrichment type and product signals
    const routingLabel = this.selectV2RoutingLabel(productTitle, vendor, productType);
    this.log(state, `V2 RoutingLabel: ${routingLabel}`);

    // Select discovery intents for this label
    const intents: DiscoveryIntent[] = V2_LABEL_TO_INTENTS[routingLabel].length > 0
      ? V2_LABEL_TO_INTENTS[routingLabel]
      : ['product', 'manual', 'compatibility'];

    const signal: DiscoverySignal = {
      brand: vendor,
      productTitle,
      sku: sku || null,
      category: productType || null,
    };

    // Layer 2: Source Discovery
    const discoveryResult = await discoverSources(
      signal,
      intents,
      this.config.navigationBudgetPerDomain
    );
    this.log(state, `V2 Discovery: ${discoveryResult.totalFound} sources in ${discoveryResult.executionTimeMs}ms`);

    // Layer 3: Domain Navigation
    let navigationResult: NavigationResult;
    if (this.config.enableDomainNavigation) {
      const navBudget: Partial<NavigationBudget> = {
        maxUrlsPerDomain: this.config.navigationBudgetPerDomain,
        maxTotalUrls: this.config.navigationBudgetPerDomain * 4,
        maxDepth: this.config.navigationDepth,
      };
      navigationResult = await navigateDomains(discoveryResult.sources, navBudget);
      this.log(state, `V2 Navigation: ${navigationResult.totalResources} resources (${navigationResult.pdfUrls.length} PDFs)`);
    } else {
      // Skip navigation: convert discovered sources directly to navigation resources
      navigationResult = {
        resources: discoveryResult.sources.map((s) => ({
          url: s.url,
          title: s.title,
          snippet: s.snippet,
          resourceType: s.isPdf ? ('pdf' as const) : ('page' as const),
          intent: s.intent,
          domain: s.domain,
          confidence: s.confidence,
          isPdf: s.isPdf,
          depth: 0,
        })),
        pdfUrls: discoveryResult.sources.filter((s) => s.isPdf).map((s) => s.url),
        supportUrls: discoveryResult.sources.filter((s) => s.isSupport).map((s) => s.url),
        downloadUrls: [],
        byDomain: new Map(),
        totalResources: discoveryResult.sources.length,
        executionTimeMs: 0,
        debugLog: [],
      };
    }

    // Layer 4: Corpus Builder
    let corpus: CorpusCollection;
    if (this.config.enableCorpusBuilder) {
      corpus = buildCorpus(
        navigationResult.resources,
        discoveryResult.sources,
        this.config.maxTokenBudget
      );
      this.log(state, `V2 Corpus: ${corpus.totalItems} items, ${corpus.totalTokens} tokens, coverage=${corpus.coverageScore.toFixed(2)}`);
    } else {
      corpus = {
        items: [],
        byType: {},
        totalItems: 0,
        totalTokens: 0,
        hasPdf: false,
        hasTable: false,
        hasImage: false,
        coverageScore: 0,
      };
    }

    return { discoveryResult, navigationResult, corpus, routingLabel };
  }

  /**
   * Determine the V2RoutingLabel from product title, vendor and type.
   * Uses fast keyword heuristics — no LLM call needed.
   */
  private selectV2RoutingLabel(
    productTitle: string,
    vendor: string,
    productType: string
  ): V2RoutingLabel {
    const text = `${productTitle} ${productType}`.toLowerCase();

    if (/manuale|pdf|istruzioni|manual/i.test(text)) return 'manual_pdf';
    if (/compatibil|batteria|battery|accessori/i.test(text)) return 'compatibility_table';
    if (/immagin|foto|image|gallery/i.test(text)) return 'image_gallery';
    if (/support|faq|assist|troubleshoot/i.test(text)) return 'support_page';
    if (/forum|reddit|opinioni|discussioni/i.test(text)) return 'forum_discussion';

    // Infer from product type
    if (/generatore|compressore|saldatrice|escavatore|miniescavatore/i.test(text)) return 'spec_full';
    if (/ricambio|pezzo|spare|part/i.test(text)) return 'compatibility_table';

    return 'spec_full'; // Default for general product enrichment
  }

  /**
   * Inject v2 corpus items into the existing retrieval data map so the
   * fusion/granularity pipeline processes them alongside web search results.
   *
   * Maps corpus type → closest SourceType:
   *   pdf, spec_sheet → official_manuals
   *   table           → official_specs
   *   review items    → user_reviews
   *   others          → official_specs (safest default)
   */
  private injectCorpusIntoRetrieval(
    corpus: CorpusCollection,
    retrievedData: Map<SourceType, any[]>,
    state: PipelineState
  ): void {
    const typeToSource: Record<string, SourceType> = {
      pdf:        'official_manuals',
      spec_sheet: 'official_specs',
      table:      'official_specs',
      document:   'official_specs',
      paragraph:  'retailer_data',
      image:      'retailer_data',
    };

    let injected = 0;
    for (const item of corpus.items) {
      const targetSource = typeToSource[item.type] ?? 'official_specs';
      const bucket = retrievedData.get(targetSource) ?? [];
      bucket.push({
        source: targetSource,
        sourceType: targetSource,
        intent: item.metadata.intent ?? 'specs',
        content: item.content,
        text: item.content,
        title: item.title,
        url: item.url,
        domain: item.domain,
        confidence: item.confidence,
        granularity: item.type === 'pdf' ? 'document' :
                     item.type === 'table' ? 'section' : 'paragraph',
        provider: `corpus_${item.type}`,
        queryMetadata: { isWhitelisted: true, intent: 'specs', timestamp: new Date().toISOString() },
        _fromV2Corpus: true,
      });
      retrievedData.set(targetSource, bucket);
      injected++;
    }

    this.log(state, `V2 Corpus injection: ${injected} items injected into retrieval data`);
  }

  /**
   * V2 Layer 7 – loop: Evaluator-Optimizer.
   *
   * Evaluates the current corpus quality. If below threshold, generates
   * targeted gap queries, runs a second retrieval pass, and updates the
   * retrieval data map. Repeats up to maxRetrievalPasses times.
   */
  private async runEvaluatorOptimizer(
    corpus: CorpusCollection,
    evidenceGraph: EvidenceGraph,
    productTitle: string,
    vendor: string,
    sku: string,
    retrievedData: Map<SourceType, any[]>,
    granularityDecision: GranularityDecision | undefined,
    state: PipelineState
  ): Promise<OptimizerResult> {
    const startEval = await evaluateCorpus(corpus, evidenceGraph, productTitle, vendor);
    this.log(
      state,
      `Evaluator: quality=${startEval.qualityScore.toFixed(2)}, ` +
        `coherence=${startEval.coherenceScore.toFixed(2)}, ` +
        `needsSecondPass=${startEval.needsSecondPass}, ` +
        `gaps=[${startEval.gaps.join('; ')}]`
    );

    const passes: OptimizationPass[] = [];
    let currentEval = startEval;
    let currentCorpus = corpus;

    for (let pass = 1; pass <= this.config.maxRetrievalPasses; pass++) {
      if (!currentEval.needsSecondPass) break;

      const gapQueries = generateGapQueries(currentEval.gaps, productTitle, vendor, sku);
      if (gapQueries.length === 0) break;

      this.log(state, `Optimizer pass ${pass}: running ${gapQueries.length} gap queries`);

      const passStartItems = currentCorpus.totalItems;
      const gapFilledList: string[] = [];

      // Run gap queries as additional retrieval
      for (const query of gapQueries) {
        try {
          const results = await this.executeSourceAwareRetrieval(
            'official_specs',
            [query],
            productTitle,
            vendor,
            granularityDecision
          );
          if (results.length > 0) {
            const bucket = retrievedData.get('official_specs') ?? [];
            bucket.push(...results);
            retrievedData.set('official_specs', bucket);
            gapFilledList.push(query.slice(0, 50));
            this.log(state, `Optimizer: gap query returned ${results.length} results`);
          }
        } catch (err) {
          this.log(state, `Optimizer: gap query failed — ${err}`);
        }
      }

      // Re-evaluate with updated retrieval data
      // (corpus is already injected into retrievedData; we re-evaluate based on
      //  the evidence graph which captures the original corpus — this is intentional:
      //  the second pass improves upstream data, and the evaluator reflects pre-pass state)
      const newEval = await evaluateCorpus(currentCorpus, evidenceGraph, productTitle, vendor);
      const newItems = retrievedData.get('official_specs')?.length ?? 0;

      passes.push({
        passNumber: pass,
        gapsFilled: gapFilledList,
        gapQueries,
        qualityBefore: currentEval.qualityScore,
        qualityAfter: newEval.qualityScore,
      });

      this.log(
        state,
        `Optimizer pass ${pass} done: quality ${currentEval.qualityScore.toFixed(2)} → ${newEval.qualityScore.toFixed(2)}, +${newItems - passStartItems} items`
      );

      currentEval = newEval;
    }

    return {
      evaluation: currentEval,
      passes,
      originalQuality: startEval.qualityScore,
      finalQuality: currentEval.qualityScore,
      passesUsed: passes.length,
    };
  }
}

/**
 * Quick access function for product enrichment
 */
export async function enrichWithUniversalRAG(
  productTitle: string,
  vendor: string,
  productType: string,
  sku: string,
  enrichmentType: 'specs' | 'description' | 'pros_cons' | 'faqs' | 'full' = 'full',
  config?: Partial<UniversalRAGConfig>
): Promise<UniversalRAGResult> {
  const pipeline = new UniversalRAGPipeline(config);
  return pipeline.enrichProduct(productTitle, vendor, productType, sku, enrichmentType);
}

/**
 * Get pipeline statistics for monitoring
 */
export function getPipelineStats(results: UniversalRAGResult[]): {
  avgExecutionTime: number;
  avgTokensUsed: number;
  totalCostSavings: number;
  successRate: number;
  sourceDistribution: Record<SourceType, number>;
} {
  if (results.length === 0) {
    return {
      avgExecutionTime: 0,
      avgTokensUsed: 0,
      totalCostSavings: 0,
      successRate: 0,
      sourceDistribution: {} as Record<SourceType, number>,
    };
  }
  
  const successful = results.filter(r => r.success);
  const sourceDistribution: Record<string, number> = {};
  
  let totalTime = 0;
  let totalTokens = 0;
  let totalSavings = 0;
  
  for (const result of results) {
    totalTime += result.metadata.executionTimeMs;
    totalTokens += result.metadata.tokensUsed;
    totalSavings += result.metadata.costSavings;
    
    for (const source of result.metadata.sourcesQueried) {
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    }
  }
  
  return {
    avgExecutionTime: totalTime / results.length,
    avgTokensUsed: totalTokens / results.length,
    totalCostSavings: totalSavings,
    successRate: successful.length / results.length,
    sourceDistribution: sourceDistribution as Record<SourceType, number>,
  };
}

// Export configuration
export { DEFAULT_CONFIG as UNIVERSAL_RAG_DEFAULT_CONFIG };
