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

// Source types available for power tool products
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
  
  // Technical specs patterns
  if (/volt|watt|amp|torque|rpm|peso|dimensioni|capacità|potenza|nm|ah/i.test(queryLower)) {
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
 * LLM-based router - uses Claude to classify query intent
 */
export async function llmBasedRoute(
  query: string,
  productContext?: { title: string; vendor: string; productType: string }
): Promise<RoutingDecision> {
  const systemPrompt = `Sei un router intelligente per un sistema RAG di e-commerce elettroutensili.
Il tuo compito è classificare l'intento della query e determinare quali fonti consultare.

INTENTI POSSIBILI:
- technical_specs: Specifiche tecniche (voltaggio, peso, coppia, RPM, dimensioni)
- pricing_value: Prezzo, valore, convenienza economica
- user_experience: Esperienza d'uso reale, durabilità, affidabilità
- comparison: Confronti tra prodotti o marchi
- how_to: Istruzioni d'uso, manutenzione, tutorial
- compatibility: Compatibilità batterie, accessori, ricambi
- troubleshooting: Problemi, guasti, riparazioni

FONTI DISPONIBILI:
- official_specs: Schede tecniche del produttore
- official_manuals: Manuali d'uso PDF
- retailer_data: Listini Amazon, eBay, distributori
- user_reviews: Recensioni clienti
- forum_discussions: Forum professionisti, Reddit
- comparison_sites: Pro Tool Reviews, siti comparativi
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
    
    return {
      intent: parsed.intent as QueryIntent,
      primarySources: parsed.primarySources as SourceType[],
      secondarySources: parsed.secondarySources as SourceType[],
      confidence: parsed.confidence,
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
  
  // Confidence-based selection (from UniversalRAG paper)
  if (llmDecision.confidence > ruleDecision.confidence) {
    return {
      ...llmDecision,
      reasoning: `[Ensemble:LLM] ${llmDecision.reasoning}`,
    };
  } else if (ruleDecision.confidence > llmDecision.confidence + 0.1) {
    return {
      ...ruleDecision,
      reasoning: `[Ensemble:Rules] ${ruleDecision.reasoning}`,
    };
  }
  
  // If similar confidence, merge sources (majority voting concept)
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
    intent: llmDecision.intent, // Trust LLM for intent classification
    primarySources: mergedPrimary,
    secondarySources: mergedSecondary,
    confidence: (ruleDecision.confidence + llmDecision.confidence) / 2,
    reasoning: `[Ensemble:Merged] Rule: ${ruleDecision.reasoning} | LLM: ${llmDecision.reasoning}`,
    skipRetrieval: ruleDecision.skipRetrieval && llmDecision.skipRetrieval,
  };
}

/**
 * Main routing function for product enrichment
 */
export async function routeProductQuery(
  productTitle: string,
  vendor: string,
  productType: string,
  specificQuery?: string
): Promise<RoutingDecision> {
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
  
  return decision;
}

/**
 * Get search queries optimized for each source type
 */
export function getOptimizedQueries(
  productTitle: string,
  vendor: string,
  sku: string,
  sourceType: SourceType
): string[] {
  const baseQueries: Record<SourceType, string[]> = {
    official_specs: [
      `${vendor} ${productTitle} scheda tecnica`,
      `${vendor} ${productTitle} specifications datasheet`,
      `${productTitle} ${sku} specs`,
    ],
    official_manuals: [
      `${vendor} ${productTitle} manuale PDF`,
      `${vendor} ${productTitle} user manual`,
      `${productTitle} istruzioni uso`,
    ],
    retailer_data: [
      `${productTitle} ${vendor} Amazon`,
      `${productTitle} prezzo Italia`,
      `${sku} ${vendor}`,
    ],
    user_reviews: [
      `${productTitle} recensioni`,
      `${vendor} ${productTitle} review`,
      `${productTitle} opinioni professionisti`,
    ],
    forum_discussions: [
      `${productTitle} forum elettricisti`,
      `${vendor} ${productTitle} reddit`,
      `${productTitle} esperienza cantiere`,
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
