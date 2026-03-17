/**
 * UniversalRAG Integration Module
 * 
 * Integrates all UniversalRAG paper improvements into a unified pipeline:
 * 1. Source Type Router - Routes queries to appropriate sources
 * 2. Granularity-Aware Retrieval - Adjusts retrieval depth
 * 3. No-Retrieval Detection - Skips retrieval when unnecessary
 * 4. Proactive Cross-Source Fusion - Plans multi-source retrieval
 * 
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora 
 * of Diverse Modalities and Granularities" (KAIST, 2026)
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

// Pipeline configuration
export interface UniversalRAGConfig {
  enableSourceRouting: boolean;
  enableGranularityAware: boolean;
  enableNoRetrievalDetection: boolean;
  enableProactiveFusion: boolean;
  enableBenchmarkContext: boolean;  // NEW: Load competitor benchmarks
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
  enableBenchmarkContext: true,  // NEW: Always load benchmarks
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
