/**
 * Source Type Router - UniversalRAG Implementation
 * 
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora 
 * of Diverse Modalities and Granularities" (KAIST, 2026)
 * 
 * Instead of searching all sources equally, this module routes queries
 * to the most appropriate source types first, avoiding the "modality gap"
 * problem where irrelevant sources add noise to retrieval.
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// P2 fix: in-process cache for routing decisions keyed by normalized productType.
// Routing for "trapano a percussione" or "avvitatore" doesn't change between products —
// caching avoids an LLM call on every product in the same category.
const _routingCache = new Map<string, RoutingDecision>();

function _routingCacheKey(productType: string): string {
  return productType.toLowerCase().trim().replace(/\s+/g, '_').slice(0, 64);
}

// Source types available for all product categories (power tools, excavators, generators, construction, vehicle parts)
export type SourceType = 
  | 'official_specs'      // Manufacturer specifications, datasheets
  | 'official_manuals'    // User manuals, instruction PDFs
  | 'retailer_data'       // Amazon, eBay, distributor listings
  | 'user_reviews'        // Customer reviews, ratings
  | 'forum_discussions'   // Reddit, professional forums
  | 'comparison_sites'    // Pro Tool Reviews, Tool Box Buzz
  | 'video_content';      // YouTube reviews, tutorials

// Query intent classification
export type QueryIntent = 
  | 'technical_specs'     // Voltage, weight, dimensions, torque
  | 'pricing_value'       // Cost, worth, value proposition
  | 'user_experience'     // Real-world usage, durability, issues
  | 'comparison'          // vs other products, alternatives
  | 'how_to'              // Usage instructions, maintenance
  | 'compatibility'       // Batteries, accessories, parts
  | 'troubleshooting';    // Problems, fixes, common issues

export interface RoutingDecision {
  primarySources: SourceType[];
  secondarySources: SourceType[];
  intent: QueryIntent;
  confidence: number;
  reasoning: string;
  skipRetrieval: boolean;
}

export interface RouterConfig {
  maxPrimarySources: number;
  maxSecondarySources: number;
  confidenceThreshold: number;
  enableEnsemble: boolean;
}

const DEFAULT_CONFIG: RouterConfig = {
  maxPrimarySources: 2,
  maxSecondarySources: 2,
  confidenceThreshold: 0.7,
  enableEnsemble: true,
};

// Source priority mappings based on query intent
const INTENT_SOURCE_MAPPING: Record<QueryIntent, { primary: SourceType[], secondary: SourceType[] }> = {
  technical_specs: {
    primary: ['official_specs', 'official_manuals'],
    secondary: ['retailer_data', 'comparison_sites'],
  },
  pricing_value: {
    primary: ['retailer_data', 'comparison_sites'],
    secondary: ['user_reviews', 'forum_discussions'],
  },
  user_experience: {
    primary: ['user_reviews', 'forum_discussions'],
    secondary: ['comparison_sites', 'video_content'],
  },
  comparison: {
    primary: ['comparison_sites', 'official_specs'],
    secondary: ['user_reviews', 'forum_discussions'],
  },
  how_to: {
    primary: ['official_manuals', 'video_content'],
    secondary: ['forum_discussions', 'user_reviews'],
  },
  compatibility: {
    primary: ['official_specs', 'official_manuals'],
    secondary: ['retailer_data', 'forum_discussions'],
  },
  troubleshooting: {
    primary: ['forum_discussions', 'user_reviews'],
    secondary: ['official_manuals', 'video_content'],
  },
};

/**
 * Rule-based router - fast, deterministic routing based on keyword patterns
 */
export function ruleBasedRoute(query: string, productType?: string): RoutingDecision {
  const queryLower = query.toLowerCase();
  
  // Technical specs patterns (power tools + heavy equipment + generators)
  if (/volt|watt|amp|torque|rpm|peso|dimensioni|capacità|potenza|nm|ah|kva|kw|portata|benna|diesel|motore|cilindrata|bar|litri\/min/i.test(queryLower)) {
    return createRoutingDecision('technical_specs', 0.85, 'Detected technical specification keywords');
  }
  
  // Pricing patterns
  if (/prezzo|costo|vale|conviene|economico|costoso|budget|€|euro/i.test(queryLower)) {
    return createRoutingDecision('pricing_value', 0.85, 'Detected pricing/value keywords');
  }
  
  // User experience patterns
  if (/durata|affidabil|problema|difetto|qualità|robusto|resistente|esperienza/i.test(queryLower)) {
    return createRoutingDecision('user_experience', 0.80, 'Detected user experience keywords');
  }
  
  // Comparison patterns
  if (/vs|versus|confronto|meglio|differenza|alternativa|rispetto/i.test(queryLower)) {
    return createRoutingDecision('comparison', 0.85, 'Detected comparison keywords');
  }
  
  // How-to patterns
  if (/come|istruzioni|uso|utilizzo|manutenzione|cambiar|sostituir/i.test(queryLower)) {
    return createRoutingDecision('how_to', 0.80, 'Detected how-to/instruction keywords');
  }
  
  // Compatibility patterns
  if (/compatibil|batteria|accessori|adattatore|ricambio|funziona con/i.test(queryLower)) {
    return createRoutingDecision('compatibility', 0.85, 'Detected compatibility keywords');
  }
  
  // Troubleshooting patterns
  if (/non funziona|guasto|riparar|errore|problema|difetto|rotto/i.test(queryLower)) {
    return createRoutingDecision('troubleshooting', 0.80, 'Detected troubleshooting keywords');
  }
  
  // Default: technical specs for product enrichment
  return createRoutingDecision('technical_specs', 0.60, 'Default routing for product enrichment');
}

/**
 * LLM-based router - uses Gemini to classify query intent
 */
export async function llmBasedRoute(
  query: string,
  productContext?: { title: string; vendor: string; productType: string }
): Promise<RoutingDecision> {
  const systemPrompt = `Sei un router intelligente per un sistema RAG di e-commerce attrezzatura professionale.
Il catalogo copre: elettroutensili, escavatori/miniescavatori e benne, gruppi elettrogeni, attrezzatura edilizia (betoniere, tagliapiastrelle), aspirapolvere industriali, motoseghe, ricambi veicoli speciali.
Il tuo compito è classificare l'intento della query e determinare quali fonti consultare.

INTENTI POSSIBILI:
- technical_specs: Specifiche tecniche (voltaggio, peso, coppia, RPM, kW, portata, dimensioni)
- pricing_value: Prezzo, valore, convenienza economica
- user_experience: Esperienza d'uso reale, durabilità, affidabilità
- comparison: Confronti tra prodotti o marchi
- how_to: Istruzioni d'uso, manutenzione, tutorial
- compatibility: Compatibilità batterie, accessori, ricambi, attacchi idraulici
- troubleshooting: Problemi, guasti, riparazioni

FONTI DISPONIBILI:
- official_specs: Schede tecniche del produttore
- official_manuals: Manuali d'uso PDF
- retailer_data: Listini Amazon, eBay, distributori
- user_reviews: Recensioni clienti
- forum_discussions: Forum professionisti, Reddit
- comparison_sites: Pro Tool Reviews, siti comparativi, riviste settore edile/movimento terra
- video_content: Video YouTube, tutorial

Rispondi SOLO con JSON valido:
{
  "intent": "technical_specs|pricing_value|user_experience|comparison|how_to|compatibility|troubleshooting",
  "primarySources": ["source1", "source2"],
  "secondarySources": ["source3"],
  "confidence": 0.0-1.0,
  "reasoning": "Breve spiegazione",
  "skipRetrieval": false
}`;

  const userPrompt = productContext 
    ? `Query: "${query}"\nContesto prodotto: ${productContext.title} (${productContext.vendor}, ${productContext.productType})`
    : `Query: "${query}"`;

  try {
    const result = await generateTextSafe({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 500,
      temperature: 0.5,
    });
    const content = result.text;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // D4 fix: Validate LLM output against known intents and source types.
    // If the LLM hallucinates an unknown intent or source, fall back to rules
    // instead of routing to invalid sources.
    const VALID_INTENTS: Set<string> = new Set([
      'technical_specs', 'pricing_value', 'user_experience',
      'comparison', 'how_to', 'compatibility', 'troubleshooting',
    ]);
    const VALID_SOURCES: Set<string> = new Set([
      'official_specs', 'official_manuals', 'retailer_data',
      'user_reviews', 'forum_discussions', 'comparison_sites', 'video_content',
    ]);

    if (!VALID_INTENTS.has(parsed.intent)) {
      log.warn(`[SourceRouter] D4: LLM hallucinated unknown intent "${parsed.intent}" — falling back to rules`);
      return ruleBasedRoute(query);
    }

    const validatedPrimary = (parsed.primarySources as string[]).filter(s => VALID_SOURCES.has(s));
    const validatedSecondary = (parsed.secondarySources as string[]).filter(s => VALID_SOURCES.has(s));

    if (validatedPrimary.length === 0) {
      log.warn(`[SourceRouter] D4: LLM returned no valid primary sources — falling back to rules`);
      return ruleBasedRoute(query);
    }

    // D4 fix: Clamp confidence to [0, 1] — LLM sometimes returns values > 1
    const clampedConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));

    return {
      intent: parsed.intent as QueryIntent,
      primarySources: validatedPrimary as SourceType[],
      secondarySources: validatedSecondary as SourceType[],
      confidence: clampedConfidence,
      reasoning: parsed.reasoning,
      skipRetrieval: parsed.skipRetrieval || false,
    };
  } catch (error) {
    log.error('[SourceRouter] LLM routing failed, falling back to rules:', error);
    return ruleBasedRoute(query);
  }
}

/**
 * Ensemble router - combines rule-based and LLM-based routing
 * Uses confidence-based selection as per UniversalRAG paper
 */
export async function ensembleRoute(
  query: string,
  productContext?: { title: string; vendor: string; productType: string },
  config: RouterConfig = DEFAULT_CONFIG
): Promise<RoutingDecision> {
  // Get rule-based routing (fast)
  const ruleDecision = ruleBasedRoute(query, productContext?.productType);
  
  // If rule-based is highly confident, use it directly
  if (ruleDecision.confidence >= config.confidenceThreshold && !config.enableEnsemble) {
    return ruleDecision;
  }
  
  // Get LLM-based routing
  const llmDecision = await llmBasedRoute(query, productContext);

  // D4 fix: When rule-based and LLM disagree on intent, require the LLM to have
  // significantly higher confidence to override. This prevents a single hallucinated
  // intent from sending the entire pipeline to the wrong sources.
  const intentsAgree = llmDecision.intent === ruleDecision.intent;
  const llmConfidenceMargin = intentsAgree ? 0 : 0.15;

  // Confidence-based selection (from UniversalRAG paper) with D4 guardrail
  if (llmDecision.confidence > ruleDecision.confidence + llmConfidenceMargin) {
    // D4 fix: Even when LLM wins, always include rule-based primary sources
    // as secondaries to hedge against hallucinated intent
    const hedgedSecondary = intentsAgree
      ? llmDecision.secondarySources
      : mergeSourceLists(llmDecision.secondarySources, ruleDecision.primarySources, config.maxSecondarySources);
    return {
      ...llmDecision,
      secondarySources: hedgedSecondary,
      reasoning: `[Ensemble:LLM${intentsAgree ? '' : '+hedge'}] ${llmDecision.reasoning}`,
    };
  } else if (ruleDecision.confidence > llmDecision.confidence + 0.1) {
    return {
      ...ruleDecision,
      reasoning: `[Ensemble:Rules] ${ruleDecision.reasoning}`,
    };
  }

  // If similar confidence, merge sources (majority voting concept)
  // D4 fix: When intents disagree, prefer rule-based intent (more predictable)
  const mergedPrimary = mergeSourceLists(
    ruleDecision.primarySources,
    llmDecision.primarySources,
    config.maxPrimarySources
  );

  const mergedSecondary = mergeSourceLists(
    ruleDecision.secondarySources,
    llmDecision.secondarySources,
    config.maxSecondarySources
  );

  return {
    intent: intentsAgree ? llmDecision.intent : ruleDecision.intent,
    primarySources: mergedPrimary,
    secondarySources: mergedSecondary,
    confidence: (ruleDecision.confidence + llmDecision.confidence) / 2,
    reasoning: `[Ensemble:Merged${intentsAgree ? '' : ',intent=rules'}] Rule: ${ruleDecision.reasoning} | LLM: ${llmDecision.reasoning}`,
    skipRetrieval: ruleDecision.skipRetrieval && llmDecision.skipRetrieval,
  };
}

/**
 * Main routing function for product enrichment.
 *
 * P2 fix: caches routing decisions by normalized productType. Products of the same
 * category (e.g. "trapano a percussione") always route to the same source types —
 * calling the LLM for every product is wasteful. The cache lives in-process for the
 * lifetime of the serverless function (warm starts reuse it; cold starts recompute).
 */
export async function routeProductQuery(
  productTitle: string,
  vendor: string,
  productType: string,
  specificQuery?: string
): Promise<RoutingDecision> {
  // Check routing cache for this product type (ignores product-specific title/vendor)
  if (!specificQuery && productType) {
    const cacheKey = _routingCacheKey(productType);
    const cached = _routingCache.get(cacheKey);
    if (cached) {
      log.info(`[SourceRouter] Cache hit for productType="${productType}" — skipping LLM routing call`);
      return cached;
    }
  }

  // For product enrichment, we need comprehensive data
  // Build a composite query that covers all aspects
  const enrichmentQuery = specificQuery ||
    `Specifiche tecniche, caratteristiche, pro e contro, accessori compatibili per ${productTitle}`;

  const productContext = { title: productTitle, vendor, productType };

  // Use ensemble routing for best results
  const decision = await ensembleRoute(enrichmentQuery, productContext);

  // For product enrichment, always include official specs
  if (!decision.primarySources.includes('official_specs')) {
    decision.primarySources.unshift('official_specs');
    if (decision.primarySources.length > 3) {
      decision.primarySources.pop();
    }
  }

  // Store in cache for future calls with the same product type
  if (!specificQuery && productType) {
    _routingCache.set(_routingCacheKey(productType), decision);
  }

  return decision;
}

/**
 * Get search queries optimized for each source type
 * R5 fix: accepts optional barcode/EAN for more precise searches
 */
export function getOptimizedQueries(
  productTitle: string,
  vendor: string,
  sku: string,
  sourceType: SourceType,
  barcode?: string
): string[] {
  const baseQueries: Record<SourceType, string[]> = {
    official_specs: [
      `${vendor} ${productTitle} scheda tecnica`,
      `${vendor} ${productTitle} specifications datasheet`,
      barcode ? `${barcode} ${vendor} specs` : `${productTitle} ${sku} specs`,
    ],
    official_manuals: [
      `${vendor} ${productTitle} manuale PDF`,
      `${vendor} ${productTitle} user manual`,
      `${productTitle} istruzioni uso`,
    ],
    retailer_data: [
      `${productTitle} ${vendor} Amazon`,
      `${productTitle} prezzo Italia`,
      barcode ? `${barcode} ${vendor}` : `${sku} ${vendor}`,
    ],
    user_reviews: [
      `${productTitle} recensioni`,
      `${vendor} ${productTitle} review`,
      `${productTitle} opinioni professionisti`,
    ],
    forum_discussions: [
      `${productTitle} forum professionisti`,
      `${vendor} ${productTitle} reddit`,
      `${productTitle} esperienza cantiere`,
      `${productTitle} forum edilizia`,
      `${vendor} ${productTitle} macchineescavatori`,
    ],
    comparison_sites: [
      `${productTitle} vs`,
      `${vendor} ${productTitle} Pro Tool Reviews`,
      `${productTitle} test comparativo`,
    ],
    video_content: [
      `${productTitle} YouTube review`,
      `${vendor} ${productTitle} test video`,
      `${productTitle} unboxing italiano`,
    ],
  };
  
  return baseQueries[sourceType] || [`${productTitle} ${vendor}`];
}

// Helper functions

function createRoutingDecision(
  intent: QueryIntent,
  confidence: number,
  reasoning: string
): RoutingDecision {
  const mapping = INTENT_SOURCE_MAPPING[intent];
  return {
    intent,
    primarySources: mapping.primary,
    secondarySources: mapping.secondary,
    confidence,
    reasoning,
    skipRetrieval: false,
  };
}

function mergeSourceLists(
  list1: SourceType[],
  list2: SourceType[],
  maxItems: number
): SourceType[] {
  const merged = new Set<SourceType>();
  
  // Interleave sources from both lists
  const maxLen = Math.max(list1.length, list2.length);
  for (let i = 0; i < maxLen && merged.size < maxItems; i++) {
    if (i < list1.length) merged.add(list1[i]);
    if (i < list2.length && merged.size < maxItems) merged.add(list2[i]);
  }
  
  return Array.from(merged);
}

// Export types and utilities
export { DEFAULT_CONFIG as ROUTER_DEFAULT_CONFIG };
