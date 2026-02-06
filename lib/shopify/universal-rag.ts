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
  buildSourceQuery,
  sourceTypeToSearchIntent,
  isWhitelistedDomain,
  getSourceConfidence,
  getDomainsForIntent,
  SearchIntent,
} from './rag-sources';

import { performWebSearch, SearchResult } from './search-client';
import { cachedSearch, CacheIntent } from './rag-cache';

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
        granularityDecision = await determineGranularity(productTitle, vendor, enrichmentType);
        this.log(state, `Granularity: ${granularityDecision.level} (max ${granularityDecision.maxTokens} tokens)`);
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
      
      // Step 6: Execute fusion
      let fusionResult: FusionResult | undefined;
      if (this.config.enableProactiveFusion && fusionPlan) {
        fusionResult = await executeFusionPlan(fusionPlan, retrievedData);
        this.log(state, `Fusion result: ${fusionResult.combinedEvidence.length} evidence items, ${fusionResult.conflictsDetected.length} conflicts resolved`);
        
        if (this.config.debugMode) {
          this.log(state, generateFusionReport(fusionPlan, fusionResult));
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
      
      return this.createResult(true, enrichedData, state, {
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
    return allResults.map(result => ({
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
  }
  
  /**
   * Prepare enriched data from retrieval and fusion results
   */
  private prepareEnrichedData(
    retrievedData: Map<SourceType, any[]>,
    fusionResult: FusionResult | undefined,
    granularityDecision: GranularityDecision | undefined
  ): any {
    if (fusionResult) {
      // Use fusion result
      return {
        evidence: fusionResult.combinedEvidence,
        coverage: fusionResult.coverageScore,
        confidence: fusionResult.confidenceScore,
        conflicts: fusionResult.conflictsDetected,
        granularity: granularityDecision?.level,
      };
    }
    
    // Fallback: return raw retrieved data
    const rawData: any = {};
    for (const [source, data] of Array.from(retrievedData.entries())) {
      rawData[source] = data;
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
