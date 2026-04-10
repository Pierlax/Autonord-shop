/**
 * AI Content Generation for Product Enrichment V3
 * 
 * === FIX ARCHITETTURALE V3 (Feb 2026) ===
 * 
 * PRIMA: Questo modulo ignorava i dati RAG/QA e lanciava una ricerca
 *        autonoma tramite product-research.ts, che chiedeva a Gemini
 *        di "cercare sul web" senza avere accesso web → ALLUCINAZIONI.
 * 
 * ORA:   Riceve i dati REALI da UniversalRAG + TwoPhaseQA come input
 *        obbligatori e li usa per costruire il prompt. Nessuna ricerca
 *        autonoma. Il flusso è: RAG → QA → V3 (generazione) → Output.
 * 
 * Integra:
 * - Knowledge Graph for hybrid retrieval
 * - Provenance tracking for hallucination control
 * - Business impact metrics
 * - Enhanced source attribution
 * - JTBD + Krug + TAYA philosophy
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;
import { EnrichedProductData, ShopifyProductWebhookPayload } from './webhook-types';
// FIX: Rimosso import di researchProduct e product-research (ricerca autonoma eliminata)
// import { researchProduct, generateSafetyLog, ProductResearchResult } from './product-research';
import { getBrandConfig } from './product-sources';
// FIX: Rimosso import di source-fusion (non più necessario, i dati arrivano da RAG)
// import { fuseSources, FusionResult, SourceType } from './source-fusion';
import {
  FactProvenanceTracker,
  generateContentProvenance,
  ContentProvenance,
  SourceAttribution,
} from './provenance-tracking';
import {
  getKnowledgeGraph,
  PowerToolKnowledgeGraph,
} from './knowledge-graph';
import {
  getMetricsStore,
  createGenerationMetrics,
  ContentGenerationMetrics,
} from './business-metrics';
import {
  AGENT_1_PRODUCT_DIRECTIVE,
  containsBannedPhrases,
  checkKrugCompliance,
  transformSpecToJobBenefit,
  JTBD_TRANSFORMATIONS,
} from '../core-philosophy';

// FIX: Import dei tipi RAG e QA (ora input obbligatori)
import { UniversalRAGResult } from './universal-rag';
import { TwoPhaseQAResult, AtomicFact } from './two-phase-qa';
// D20 fix: Import TAYA Police feedback loop
import { getViolationFeedback } from '@/lib/agents/taya-police';
import { getProductMemoryContext, recordMemoryUsage } from '@/lib/agent-memory';
import { readCacheJson } from '@/lib/shopify/rag-cache';
import type { ForumResearchResult } from '@/lib/blog-researcher/sentiment';
import { extractRAGEvidence as extractRAGEvidenceShared, type RAGEvidence, trustToStars } from './rag-evidence-extractor';

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

// AI client is now centralized in lib/shopify/ai-client.ts (Gemini)
// No per-module initialization needed

// =============================================================================
// ENHANCED SYSTEM PROMPT V3
// =============================================================================

/**
 * W14 fix: Compact system prompt.
 *
 * The original SYSTEM_PROMPT_V3 embedded the full AGENT_1_PRODUCT_DIRECTIVE
 * (~2000 tokens of TAYA/Krug/JTBD philosophy) plus another ~800 tokens of
 * PERSONA/VOICE/RULES. This consumed ~2800 tokens of context on every call,
 * leaving less room for actual evidence.
 *
 * The compact version keeps the essential operational rules (~800 tokens)
 * while removing the verbose philosophical framework (which the model already
 * follows via the specific instructions in each section).
 *
 * The full AGENT_1_PRODUCT_DIRECTIVE is retained as a reference but only used
 * for the containsBannedPhrases() and checkKrugCompliance() checks, not injected
 * into the prompt.
 */
/**
 * D13 fix: System prompt with chain-of-thought enforcement.
 *
 * Previously the rules were declarative ("MAI inventare dati") but the model
 * followed them "best effort". Now each pro/con requires an inline source
 * citation, and the model must mentally verify each claim before writing it.
 * This makes hallucination structurally harder — the model can't write a fact
 * without also fabricating a source, which is a stronger deterrent.
 */
const SYSTEM_PROMPT_V3_COMPACT = `## PERSONA: TEAM AUTONORD SERVICE
Siete il Team Tecnico di Autonord Service (Genova), esperti in attrezzature professionali. Scrivete come parlate ai clienti in negozio: diretti, competenti, mai arroganti. Usate "noi"/"consigliamo".

## REGOLE FONDAMENTALI
1. ONESTÀ: Se un prodotto ha un difetto, segnalalo per primo. Se non è adatto a un lavoro, dillo.
2. CHIAREZZA (Krug): Prima riga = problema che risolve. Bullet points > paragrafi. Max 200 parole.
3. JTBD: Collega OGNI specifica a un beneficio lavorativo concreto ("5Ah" → "mezza giornata senza ricaricare", "1.5kg" → "gestibile sopra la testa").
4. MAI inventare dati. Se un'informazione non è nei dati forniti, non includerla.
5. MAI usare: "leader di settore", "eccellenza", "qualità superiore", "il migliore", "straordinario", "eccezionale", "perfetto", "alta qualità", "questo prodotto", "questo articolo".

## VERIFICA PRIMA DI SCRIVERE (D13)
Per ogni affermazione numerica o tecnica nella descrizione e nei pro/contro:
- PRIMA: cerca il dato nelle SPECIFICHE VERIFICATE o nei DATI RAG forniti
- SE trovato: scrivi il dato e menziona implicitamente la fonte (es. "135 Nm di coppia secondo scheda tecnica")
- SE NON trovato: NON scrivere quel dato. Scrivi meno, ma solo cose verificate.

## FORMATO OUTPUT
- **Descrizione** (150-200 parole): Problema → Soluzione → Per chi / NON per chi
- **3 PRO**: Spec verificata + beneficio lavorativo (ogni pro deve basarsi su un dato presente nelle specifiche)
- **2 CONTRO**: Problemi REALI (non minimizzati)
- **3 FAQ**: Domande reali, risposte in 1-2 frasi
- **Specs**: Solo specifiche verificate da TwoPhaseQA (chiave = nome, valore = dato + unità)
- CRITICO: Non usare MAI " (virgolette doppie) nei valori JSON — usa ″ per pollici, « » per citazioni.
- LINGUA: Tutte le chiavi JSON sono in inglese (contratto di codice). Tutti i valori stringa devono essere scritti in italiano. Non mescolare le lingue all'interno di uno stesso valore.`;

// Keep the full directive reference for banned-phrases and Krug compliance checks
const _FULL_DIRECTIVE_REF = AGENT_1_PRODUCT_DIRECTIVE;

// =============================================================================
// BRAND MAPPING
// =============================================================================

const BRAND_MAPPING: Record<string, string> = {
  'TECHTRONIC INDUSTRIES ITALIA SRL': 'Milwaukee',
  'TECHTRONIC INDUSTRIES': 'Milwaukee',
  'TTI': 'Milwaukee',
  'MAKITA SPA': 'Makita',
  'MAKITA': 'Makita',
  'ROBERT BOSCH SPA': 'Bosch Professional',
  'BOSCH': 'Bosch Professional',
  'STANLEY BLACK & DECKER ITALIA SRL': 'DeWalt',
  'STANLEY BLACK & DECKER': 'DeWalt',
  'DEWALT': 'DeWalt',
  'HILTI ITALIA SPA': 'Hilti',
  'HILTI': 'Hilti',
  'METABO SRL': 'Metabo',
  'METABO': 'Metabo',
  'FESTOOL GMBH': 'Festool',
  'FESTOOL': 'Festool',
  'HIKOKI': 'HiKOKI',
  'HITACHI': 'HiKOKI',
  'FEIN': 'Fein',
  'FLEX': 'Flex',
};

function normalizeBrand(vendor: string): string {
  const upperVendor = vendor.toUpperCase().trim();
  
  for (const [key, value] of Object.entries(BRAND_MAPPING)) {
    if (upperVendor.includes(key.toUpperCase())) {
      return value;
    }
  }
  
  return vendor
    .replace(/\s*(SRL|SPA|GMBH|INC|LLC|LTD|ITALIA|ITALY)\s*/gi, '')
    .trim() || vendor;
}

// =============================================================================
// ENHANCED DATA TYPES V3
// =============================================================================

export interface EnrichedProductDataV3 extends EnrichedProductData {
  accessories: { name: string; reason: string }[];
  safetyLog: string;
  sourcesUsed: string[];
  dataQuality: {
    specsVerified: boolean;
    conflictsFound: number;
    manualCheckRequired: string[];
  };
  // V3 additions
  provenance: ContentProvenance;
  knowledgeGraphContext: {
    brandInfo: string | null;
    categoryInfo: string | null;
    batterySystem: string | null;
    suitableForTrades: string[];
    relatedUseCases: string[];
    crossSellSuggestions: string[];  // From RAG-enriched KG (pipeline Step 6.5)
    suggestedFeatures: string[];     // From static KG feature nodes
  };
  metrics: ContentGenerationMetrics;
  /**
   * D16 fix: Intrinsic quality score of the generated content.
   * Enables A/B testing between prompt versions and trend analysis.
   */
  qualityScore?: ContentQualityScore;
}

/**
 * D16 fix: Structured quality score for generated content.
 * Each dimension is 0–1, overall is a weighted average.
 */
export interface ContentQualityScore {
  /** Overall quality 0–1 (weighted average of dimensions) */
  overall: number;
  /** Ratio of verified facts mentioned in description vs total available */
  factualDensity: number;
  /** Whether pros/cons reference specific numbers from specs */
  specificityScore: number;
  /** JTBD coverage: fraction of specs connected to a work benefit */
  jtbdCoverage: number;
  /** Content completeness: are all required sections non-empty? */
  completeness: number;
  /** Absence of banned phrases and generic marketing language */
  honestyScore: number;
}

// =============================================================================
// KNOWLEDGE GRAPH ENRICHMENT
// =============================================================================

function enrichWithKnowledgeGraph(
  productName: string,
  brand: string,
  ragKgContext?: UniversalRAGResult['knowledgeGraphContext']
): EnrichedProductDataV3['knowledgeGraphContext'] {
  const kg = getKnowledgeGraph();
  const context = kg.enrichProductContext(productName, brand);

  // Merge cross-sell suggestions from the RAG-enriched KG context (Step 6.5)
  // The RAG pipeline discovered these by scanning web text for compatibility patterns
  const crossSell = Array.from(new Set(ragKgContext?.crossSellSuggestions || [])).slice(0, 5);

  return {
    brandInfo: context.brandInfo ? JSON.stringify(context.brandInfo.properties) : null,
    // R3 fix: serialize full category properties (description + powerRange/discSizes) instead of just name
    categoryInfo: context.categoryInfo ? JSON.stringify({
      name: context.categoryInfo.name,
      description: context.categoryInfo.properties.description ?? null,
      powerRange: context.categoryInfo.properties.powerRange ?? context.categoryInfo.properties.discSizes ?? null,
    }) : null,
    // R3 fix: serialize full battery properties (voltage + capacities) instead of just name
    batterySystem: ragKgContext?.batterySystem ?? (context.batterySystem
      ? JSON.stringify({
          name: context.batterySystem.name,
          voltage: context.batterySystem.properties.voltage ?? null,
          capacities: context.batterySystem.properties.capacities ?? null,
        })
      : null),
    // R3 fix: include workEnvironment in trade names
    suitableForTrades: context.suitableForTrades.map(t => {
      const env = t.properties.workEnvironment;
      return env ? `${t.name} (${env})` : t.name;
    }),
    relatedUseCases: context.relatedUseCases.map(u => {
      const accessories = u.properties.accessories as string[] | undefined;
      return accessories?.length ? `${u.name} [accessori: ${accessories.join(', ')}]` : u.name;
    }),
    crossSellSuggestions: crossSell,
    // R3 fix: include feature benefits instead of just name
    suggestedFeatures: context.suggestedFeatures.map(f => {
      const benefits = f.properties.benefits as string[] | undefined;
      return benefits?.length ? `${f.name} (${benefits.join(', ')})` : f.name;
    }),
  };
}

// =============================================================================
// PROVENANCE TRACKING (Refactored to use RAG + QA data)
// =============================================================================

interface ProvenanceTrackingResult {
  tracker: FactProvenanceTracker;
  qaFactIds: string[];
  contentProvenance: ContentProvenance;
}

/**
 * Builds provenance from RAG evidence and QA verified facts.
 * Returns the tracker instance so callers can append generation steps later.
 */
function trackProvenanceFromRAGandQA(
  productId: string,
  productName: string,
  ragResult: UniversalRAGResult,
  qaResult: TwoPhaseQAResult | null,
): ProvenanceTrackingResult {
  const tracker = new FactProvenanceTracker();
  const qaFactIds: string[] = [];

  // Register facts from QA verified facts (highest quality)
  if (qaResult) {
    for (const fact of qaResult.simpleQA.rawFacts) {
      if (fact.answer !== 'NON TROVATO') {
        const sourceType: SourceAttribution['type'] = fact.confidence === 'high'
          ? 'official'
          : fact.confidence === 'medium'
            ? 'retailer'
            : 'generated';

        const factId = tracker.registerFact(
          fact.question,
          fact.answer,
          {
            name: fact.source || 'TwoPhaseQA',
            type: sourceType,
            reliability: fact.confidence === 'high' ? 0.95 : fact.confidence === 'medium' ? 0.7 : 0.4,
            extractedAt: new Date(),
          }
        );

        if (fact.verified) {
          tracker.verifyFact(factId, 'qa_verified');
        }
        qaFactIds.push(factId);
      }
    }
  }

  // Register facts from RAG evidence (already fused by UniversalRAG)
  if (ragResult.success && ragResult.data?.evidence && Array.isArray(ragResult.data.evidence)) {
    for (const item of ragResult.data.evidence) {
      const sourceLabel = item.source || item.sourceType || 'UniversalRAG';
      const content = item.content || item.text || item.snippet || '';

      if (content && typeof content === 'string' && content.length > 10) {
        const primarySource: SourceAttribution = {
          name: sourceLabel,
          type: mapRagSourceToAttribution(sourceLabel),
          reliability: item.confidence ? parseFloat(String(item.confidence)) / 100 : 0.7,
          extractedAt: new Date(),
        };
        const ragFactId = tracker.registerFact(
          `RAG Evidence (${sourceLabel})`,
          content.substring(0, 200),
          primarySource
        );
        // Evidence items that carry a confidence score came through fusion — record it
        if (item.confidence) {
          const conf = parseFloat(String(item.confidence));
          tracker.updateAfterFusion(
            ragFactId,
            content.substring(0, 200),
            isNaN(conf) ? 70 : conf,
            [primarySource]
          );
        }
      }
    }
  }

  // Register RAG metadata sources
  if (ragResult.metadata?.sourcesQueried) {
    for (const source of ragResult.metadata.sourcesQueried) {
      tracker.registerFact(
        `Source queried: ${source}`,
        'RAG pipeline source',
        {
          name: String(source),
          type: 'official',
          reliability: 0.8,
          extractedAt: new Date(),
        }
      );
    }
  }

  return {
    tracker,
    qaFactIds,
    contentProvenance: generateContentProvenance(productId, productName, tracker.getAllFacts()),
  };
}

function mapRagSourceToAttribution(source: string): SourceAttribution['type'] {
  const sourceLower = source.toLowerCase();
  if (sourceLower.includes('official') || sourceLower.includes('manufacturer')) {
    return 'official';
  }
  if (sourceLower.includes('manual') || sourceLower.includes('datasheet')) {
    return 'manual';
  }
  if (sourceLower.includes('amazon') || sourceLower.includes('retailer') || sourceLower.includes('fixami') || sourceLower.includes('rotopino')) {
    return 'retailer';
  }
  if (sourceLower.includes('review') || sourceLower.includes('recensione')) {
    return 'review';
  }
  if (sourceLower.includes('forum') || sourceLower.includes('reddit')) {
    return 'forum';
  }
  return 'generated';
}

// =============================================================================
// SAFETY LOG (from RAG + QA data)
// =============================================================================

/**
 * Generates a safety log from RAG and QA data.
 * Replaces the old generateSafetyLog that depended on product-research.
 */
function generateSafetyLogFromRAGandQA(
  productName: string,
  ragResult: UniversalRAGResult,
  qaResult: TwoPhaseQAResult | null,
): string {
  const lines: string[] = [
    `=== SAFETY LOG: ${productName} ===`,
    `Data: ${new Date().toISOString()}`,
    `Pipeline: UniversalRAG → TwoPhaseQA → V3 Generation`,
    '',
  ];

  // RAG quality
  lines.push('## RAG PIPELINE');
  lines.push(`- Success: ${ragResult.success}`);
  lines.push(`- Sources queried: ${ragResult.metadata.sourcesQueried.length}`);
  lines.push(`- Tokens used: ${ragResult.metadata.tokensUsed}`);
  if (ragResult.data?.conflicts && Array.isArray(ragResult.data.conflicts)) {
    lines.push(`- Conflicts detected: ${ragResult.data.conflicts.length}`);
    for (const conflict of ragResult.data.conflicts) {
      const desc = typeof conflict === 'string' ? conflict : (conflict.description || JSON.stringify(conflict));
      lines.push(`  ⚠️ ${desc}`);
    }
  }
  lines.push('');

  // QA quality
  if (qaResult) {
    const verifiedFacts = qaResult.simpleQA.rawFacts.filter(f => f.verified);
    const unverifiedFacts = qaResult.simpleQA.rawFacts.filter(f => !f.verified && f.answer !== 'NON TROVATO');
    
    lines.push('## TWO-PHASE QA');
    lines.push(`- Verified facts: ${verifiedFacts.length}`);
    lines.push(`- Unverified facts: ${unverifiedFacts.length}`);
    lines.push(`- QA Confidence: ${qaResult.complexQA.recommendation.confidence}`);
    
    if (unverifiedFacts.length > 0) {
      lines.push('');
      lines.push('### DATI DA VERIFICARE MANUALMENTE');
      for (const fact of unverifiedFacts) {
        lines.push(`  - ${fact.question}: ${fact.answer} (confidence: ${fact.confidence})`);
      }
    }
    
    if (qaResult.complexQA.recommendation.caveats.length > 0) {
      lines.push('');
      lines.push('### AVVERTENZE QA');
      for (const caveat of qaResult.complexQA.recommendation.caveats) {
        lines.push(`  - ${caveat}`);
      }
    }
  } else {
    lines.push('## TWO-PHASE QA');
    lines.push('- ⚠️ QA non disponibile (fallito o non eseguito)');
  }

  return lines.join('\n');
}

// =============================================================================
// =============================================================================
// W-V3-3: JSON repair utility (exported for testability)
// =============================================================================

/**
 * Repairs JSON strings that contain unescaped double-quote characters inside
 * string values. Gemini sometimes emits bare " for inch specs or Italian
 * quotation marks (e.g. 'attacco 1/2"') which breaks JSON.parse().
 *
 * Strategy: scan character by character. Inside a string value, any " NOT
 * followed by a JSON structural token (:, ,, ], }, whitespace+structural) is
 * treated as an inline/measurement quote and replaced with ″ (U+2033).
 *
 * Exported at module level so the logic can be tested independently.
 */
export function repairUnescapedQuotes(s: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      result += c;
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      result += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      if (!inString) {
        inString = true;
        result += c;
      } else {
        // Inside a string: look ahead to decide if this is the closing quote.
        // Skip whitespace, then check next structural char.
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        const nextCh = j < s.length ? s[j] : '';
        if (nextCh === ':' || nextCh === ',' || nextCh === ']' || nextCh === '}' || nextCh === '"' || nextCh === '') {
          // Structural token follows — this is the closing quote
          inString = false;
          result += c;
        } else {
          // Non-structural character follows — inline quote, replace with ″
          result += '″';
        }
      }
    } else {
      result += c;
    }
  }
  return result;
}

// =============================================================================
// MAIN GENERATION FUNCTION V3 (REFACTORED)
// =============================================================================

/**
 * Generates enriched product content using REAL data from RAG and QA pipelines.
 * 
 * FIX ARCHITETTURALE: Questa funzione ora RICHIEDE i dati da UniversalRAG e
 * TwoPhaseQA come input. Non esegue più alcuna ricerca autonoma.
 * 
 * @param product - Basic product data from Shopify webhook
 * @param ragResult - REAL data from UniversalRAG pipeline (web search results)
 * @param qaResult - Verified facts from TwoPhaseQA (can be null if QA failed)
 */
export async function generateProductContentV3(
  product: ShopifyProductWebhookPayload,
  ragResult: UniversalRAGResult,
  qaResult: TwoPhaseQAResult | null,
): Promise<EnrichedProductDataV3> {
  const startTime = Date.now();
  const timings = {
    total: 0,
    research: 0, // Now tracks RAG data processing time, not autonomous research
    fusion: 0,
    llm: 0,
    verification: 0,
  };

  const brand = normalizeBrand(product.vendor || 'Sconosciuto');
  const sku = product.variants[0]?.sku || 'N/A';
  const productId = product.id?.toString() || 'unknown';
  
  log.info(`[AI-V3] Starting enrichment for: ${product.title} (using RAG+QA data)`);
  
  // Step 1: Process RAG + QA data (NO autonomous research!)
  log.info('[AI-V3] Step 1: Processing RAG + QA data (no autonomous research)...');
  const researchStart = Date.now();
  
  // Extract structured data from RAG and QA results
  const ragEvidence = extractRAGEvidence(ragResult);
  const qaFacts = qaResult ? extractQAFacts(qaResult) : null;
  
  timings.research = Date.now() - researchStart;
  log.info(`[AI-V3] RAG evidence items: ${ragEvidence.snippets.length}, QA verified facts: ${qaFacts?.verifiedSpecs.length || 0}`);
  
  // Step 2: Enrich with Knowledge Graph, merging the RAG-enriched context from Step 6.5
  // ragResult.knowledgeGraphContext contains cross-sell suggestions and battery systems
  // discovered by scanning actual web text — richer than the static KG lookup alone
  log.info('[AI-V3] Step 2: Enriching with Knowledge Graph (merging RAG discoveries)...');
  const kgContext = enrichWithKnowledgeGraph(product.title, brand, ragResult.knowledgeGraphContext);
  
  // Step 3: Track provenance from RAG + QA data
  log.info('[AI-V3] Step 3: Tracking provenance from RAG + QA...');
  const fusionStart = Date.now();
  const provenanceResult = trackProvenanceFromRAGandQA(productId, product.title, ragResult, qaResult);
  timings.fusion = Date.now() - fusionStart;

  // Step 4: Generate safety log
  const safetyLog = generateSafetyLogFromRAGandQA(product.title, ragResult, qaResult);
  log.info('[AI-V3] Safety log generated');

  // Step 4.5: Load agent memory context (business rules, cross-agent notes, verified facts)
  // W16 fix: Skip agent memory when QA already has enough verified facts (≥3).
  // Agent memory risks injecting stale info that contradicts fresh RAG/QA data.
  // Only load memory when QA data is thin (< 3 verified facts), where historical
  // context might fill gaps that RAG/QA couldn't cover.
  const qaVerifiedCount = qaResult?.simpleQA.rawFacts.filter(f => f.verified).length ?? 0;
  const shouldLoadMemory = qaVerifiedCount < 3;

  const memoryContext = shouldLoadMemory
    ? await getProductMemoryContext({
        title: product.title,
        vendor: brand,
        productType: product.product_type || undefined,
      })
    : { promptSection: '', summary: 'skipped (W16: QA has enough verified facts)', businessRules: [], crossAgentNotes: [], verifiedFacts: [] };

  if (memoryContext.promptSection) {
    log.info(`[AI-V3] AgeMem context loaded: ${memoryContext.summary}`);
  } else if (!shouldLoadMemory) {
    log.info(`[AI-V3] W16: Agent memory skipped — QA has ${qaVerifiedCount} verified facts (threshold: 3)`);
  }

  // Step 4.7: R6 Phase B — read blog sentiment cache (populated by blog-researcher pipeline)
  // Key must match what sentiment.ts writes: cachedGenericDynamic uses 'gen:v1:' prefix internally
  const sentimentCacheKey = `sentiment:v1:${product.title.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
  let sentimentData: ForumResearchResult | null = null;
  try {
    sentimentData = await readCacheJson<ForumResearchResult>(sentimentCacheKey);
    if (sentimentData) {
      log.info(`[AI-V3] Forum sentiment cache hit: ${sentimentData.postsAnalyzed} posts analyzed`);
    }
  } catch {
    // Sentiment cache not available — not critical
  }

  // Step 5: Build enhanced prompt with REAL data from RAG + QA + KG + AgeMem + Sentiment
  const userPrompt = buildEnhancedPromptV3(product, brand, ragEvidence, qaFacts, kgContext, memoryContext.promptSection, sentimentData);

  // Step 6: Generate content with LLM
  log.info('[AI-V3] Step 6: Generating content with LLM (using RAG+QA context)...');
  const llmStart = Date.now();
  const content = await generateWithLLMV3(userPrompt, ragEvidence, qaFacts, product.title, brand);
  timings.llm = Date.now() - llmStart;

  // Step 6.1: Feedback loop — segnala alle memorie usate che la generazione è riuscita
  const usedMemoryIds = [
    ...memoryContext.businessRules,
    ...memoryContext.crossAgentNotes,
    ...memoryContext.verifiedFacts,
  ].map(e => e.id);
  if (usedMemoryIds.length > 0) {
    await recordMemoryUsage({ memoryIds: usedMemoryIds, wasSuccessful: true, agentSource: 'product_agent' });
    log.info(`[AI-V3] AgeMem feedback recorded for ${usedMemoryIds.length} memories`);
  }

  // Step 6.5: Extend provenance chain with generation step
  // Each QA fact that fed the prompt now has a record of what the LLM produced from it
  for (const factId of provenanceResult.qaFactIds) {
    provenanceResult.tracker.updateAfterGeneration(factId, content.description, 'gemini-2.0-flash');
  }
  const provenance = generateContentProvenance(productId, product.title, provenanceResult.tracker.getAllFacts());

  // Step 7: Fact Verification — cross-check generated numbers against verified QA data
  const verificationStart = Date.now();
  if (qaFacts && qaFacts.verifiedSpecs.length > 0) {
    // Extract all numbers that appear in verified QA facts
    const verifiedNumbers = new Set(
      qaFacts.verifiedSpecs.flatMap(s => (s.answer.match(/\d+(?:[.,]\d+)?/g) || []))
    );
    // Also include unverified spec numbers (medium confidence — still from real RAG data)
    for (const s of qaFacts.unverifiedSpecs) {
      for (const n of (s.answer.match(/\d+(?:[.,]\d+)?/g) || [])) {
        verifiedNumbers.add(n);
      }
    }

    // Find numeric values in the generated description that don't appear in any source
    const generatedNumbers = content.description.match(/\d+(?:[.,]\d+)?/g) || [];
    const unverifiedNumbers = generatedNumbers.filter(n => {
      const num = n.replace(',', '.');
      // Accept the number if it (or a close form) appears in verified data
      return !verifiedNumbers.has(n) && !verifiedNumbers.has(num);
    });

    if (unverifiedNumbers.length > 0) {
      log.warn(
        `[AI-V3] Step 7 Verification: ${unverifiedNumbers.length} number(s) in description not found in QA-verified data: ${unverifiedNumbers.join(', ')} — review for hallucination`
      );
    } else {
      log.info('[AI-V3] Step 7 Verification: all numbers in description are grounded in QA data ✓');
    }
  }
  timings.verification = Date.now() - verificationStart;
  
  // Step 8: Extract accessories from RAG data
  const accessories = ragEvidence.accessories.map(acc => ({
    name: acc.name,
    reason: acc.reason,
  }));
  
  // Step 9: Calculate total time and record metrics
  timings.total = Date.now() - startTime;
  
  // Compute sources used from RAG metadata
  const sourcesUsed = ragResult.metadata.sourcesQueried.map(s => String(s));
  
  // Compute data quality from QA results
  const manualCheckRequired: string[] = [];
  if (qaResult) {
    for (const fact of qaResult.simpleQA.rawFacts) {
      if (fact.answer !== 'NON TROVATO' && !fact.verified) {
        manualCheckRequired.push(`${fact.question}: ${fact.answer} (${fact.confidence})`);
      }
    }
  }
  
  // Compute conflicts from RAG data
  const conflictsCount = ragResult.data?.conflicts 
    ? (Array.isArray(ragResult.data.conflicts) ? ragResult.data.conflicts.length : 0) 
    : 0;
  
  const metrics = createGenerationMetrics(
    productId,
    product.title,
    timings,
    {
      confidence: provenance.overallConfidence,
      sources: sourcesUsed.length,
      conflicts: conflictsCount,
      resolved: 0, // RAG handles conflict resolution internally
      manualChecks: manualCheckRequired.length,
    },
    {
      descriptionWords: content.description.split(/\s+/).length,
      pros: content.pros.length,
      cons: content.cons.length,
      faqs: content.faqs.length,
      accessories: accessories.length,
    },
    {
      officialPercent: (provenance.sourceBreakdown.official / 
        Math.max(1, Object.values(provenance.sourceBreakdown).reduce((a, b) => a + b, 0))) * 100,
      verifiedPercent: (provenance.facts.filter(f => f.verificationStatus === 'verified').length /
        Math.max(1, provenance.facts.length)) * 100,
    }
  );
  
  // Record metrics
  getMetricsStore().recordGeneration(metrics);
  
  // D16 fix: Compute intrinsic quality score for A/B testing and trend analysis
  const qualityScore = scoreContentQuality(content, qaFacts);
  log.info(`[AI-V3] D16 Quality: overall=${qualityScore.overall}, factual=${qualityScore.factualDensity}, specificity=${qualityScore.specificityScore}, jtbd=${qualityScore.jtbdCoverage}, completeness=${qualityScore.completeness}, honesty=${qualityScore.honestyScore}`);

  log.info(`[AI-V3] Generation complete in ${timings.total}ms`);
  log.info(`[AI-V3] Provenance: ${provenance.overallConfidence}% confidence, ${provenance.warnings.length} warnings`);

  return {
    ...content,
    accessories,
    safetyLog,
    sourcesUsed,
    dataQuality: {
      specsVerified: manualCheckRequired.length === 0,
      conflictsFound: conflictsCount,
      manualCheckRequired,
    },
    provenance,
    knowledgeGraphContext: kgContext,
    metrics,
    qualityScore,
  };
}

// =============================================================================
// RAG + QA DATA EXTRACTION HELPERS
// =============================================================================

// RAGEvidence type is imported from rag-evidence-extractor.ts (R8)

export interface QAFacts {
  verifiedSpecs: { question: string; answer: string; source: string }[];
  unverifiedSpecs: { question: string; answer: string; source: string; confidence: string }[];
  strengths: string[];
  weaknesses: string[];
  idealFor: string[];
  notIdealFor: string[];
  verdict: string;
  verdictConfidence: string;
  caveats: string[];
}

// R8: extractRAGEvidence is now imported from rag-evidence-extractor.ts
// Thin wrapper to keep internal callers on the same name
function extractRAGEvidence(ragResult: UniversalRAGResult): RAGEvidence {
  return extractRAGEvidenceShared(ragResult);
}

/**
 * Extracts structured facts from the TwoPhaseQA result.
 */
function extractQAFacts(qaResult: TwoPhaseQAResult): QAFacts {
  const verifiedSpecs: QAFacts['verifiedSpecs'] = [];
  const unverifiedSpecs: QAFacts['unverifiedSpecs'] = [];

  for (const fact of qaResult.simpleQA.rawFacts) {
    if (fact.answer === 'NON TROVATO') continue;
    
    if (fact.verified) {
      verifiedSpecs.push({
        question: fact.question,
        answer: fact.answer,
        source: fact.source,
      });
    } else {
      unverifiedSpecs.push({
        question: fact.question,
        answer: fact.answer,
        source: fact.source,
        confidence: fact.confidence,
      });
    }
  }

  // Sanitize QA verdict: if TwoPhaseQA couldn't form a verdict (no real data),
  // replace with empty string so V3 doesn't copy the negative phrase into the description.
  const rawVerdict = qaResult.complexQA.recommendation.verdict || '';
  const NEGATIVE_VERDICT_MARKERS = [
    'Non è possibile', 'Impossibile formulare', 'Dati insufficienti',
    'non ho dati', 'senza dati', 'non disponibile', 'Valutazione in corso',
  ];
  const verdict = NEGATIVE_VERDICT_MARKERS.some(m => rawVerdict.toLowerCase().includes(m.toLowerCase()))
    ? ''
    : rawVerdict;

  return {
    verifiedSpecs,
    unverifiedSpecs,
    strengths: qaResult.complexQA.comparison.strengths,
    weaknesses: qaResult.complexQA.comparison.weaknesses,
    idealFor: qaResult.complexQA.suitability.idealFor,
    notIdealFor: qaResult.complexQA.suitability.notIdealFor,
    verdict,
    verdictConfidence: qaResult.complexQA.recommendation.confidence,
    caveats: qaResult.complexQA.recommendation.caveats,
  };
}

// =============================================================================
// PROMPT BUILDING V3 (REFACTORED - Uses RAG + QA data)
// =============================================================================

function buildEnhancedPromptV3(
  product: ShopifyProductWebhookPayload,
  brand: string,
  ragEvidence: RAGEvidence,
  qaFacts: QAFacts | null,
  kgContext: EnrichedProductDataV3['knowledgeGraphContext'],
  memoryPromptSection: string = '',
  sentimentData: ForumResearchResult | null = null
): string {
  const sku = product.variants[0]?.sku || 'N/A';
  
  // Helper: replace ASCII double-quote with double-prime to prevent JSON injection
  // when Gemini copies spec values (e.g. 1/2") verbatim into the JSON output.
  const sanitizeForPrompt = (str: string) => str.replace(/"/g, '″');

  // === SECTION 1: Verified specs from TwoPhaseQA ===
  let specsSection: string;
  if (qaFacts && qaFacts.verifiedSpecs.length > 0) {
    specsSection = `## SPECIFICHE TECNICHE VERIFICATE (da TwoPhaseQA - fatti atomici verificati)
${qaFacts.verifiedSpecs.map(s => `- ${s.question}: **${sanitizeForPrompt(s.answer)}** (fonte: ${s.source})`).join('\n')}`;
  } else {
    specsSection = '## SPECIFICHE TECNICHE\nNessuna specifica verificata disponibile da TwoPhaseQA.';
  }

  // === SECTION 2: Unverified specs (use with caution) ===
  let unverifiedSection = '';
  if (qaFacts && qaFacts.unverifiedSpecs.length > 0) {
    unverifiedSection = `\n## ⚠️ DATI PARZIALMENTE VERIFICATI (usa, ma con qualifica)
${qaFacts.unverifiedSpecs.map(s => `- ${s.question}: ${sanitizeForPrompt(s.answer)} (confidence: ${s.confidence}, fonte: ${s.source})`).join('\n')}

NOTA: Puoi usare questi dati nella descrizione, ma qualificali con "circa" o "tipicamente" invece di presentarli come valori esatti.`;
  }

  // === SECTION 3: RAG evidence (real web search snippets) ===
  // Snippets are now trust-scored: ★★★ = scheda tecnica / manuale ufficiale,
  // ★★ = brand site / retailer / review, ★ = forum / unknown.
  // The LLM must weight ★★★ facts over ★ opinions when they conflict.
  let ragSection = '';
  if (ragEvidence.snippets.length > 0) {
    // Sort by trust descending — best sources first, same as renderStructuredSources in TwoPhaseQA
    const topSnippets = [...ragEvidence.snippets]
      .sort((a, b) => b.trust - a.trust)
      .slice(0, 10);
    ragSection = `\n## DATI DA RICERCA WEB REALE (UniversalRAG)
Legenda affidabilità: ★★★ = scheda tecnica ufficiale/manuale | ★★ = sito brand/retailer/recensione | ★ = forum/community
In caso di conflitto tra fonti, i dati ★★★ prevalgono sempre sui dati ★.

${topSnippets.map(s => {
  const stars = trustToStars(s.trust);
  const confTag = s.confidence ? ` | confidence: ${s.confidence}` : '';
  return `[${stars} FONTE: ${s.source}${confTag}]\n${s.text.substring(0, 500)}`;
}).join('\n\n---\n\n')}`;
  }

  // === SECTION 4: QA reasoning (strengths, weaknesses, verdict) ===
  let qaReasoningSection = '';
  if (qaFacts) {
    qaReasoningSection = `\n## ANALISI RAGIONATA (da TwoPhaseQA)

### Punti di forza (basati su fatti verificati):
${qaFacts.strengths.length > 0
  ? qaFacts.strengths.map(s => `- ${sanitizeForPrompt(s)}`).join('\n')
  : '- Nessun punto di forza specifico identificato'}

### Punti deboli (basati su fatti verificati):
${qaFacts.weaknesses.length > 0
  ? qaFacts.weaknesses.map(w => `- ${sanitizeForPrompt(w)}`).join('\n')
  : '- Nessun punto debole specifico identificato'}

### Ideale per:
${qaFacts.idealFor.length > 0 ? qaFacts.idealFor.map(i => `- ${sanitizeForPrompt(i)}`).join('\n') : '- Non specificato'}

### NON ideale per:
${qaFacts.notIdealFor.length > 0 ? qaFacts.notIdealFor.map(n => `- ${sanitizeForPrompt(n)}`).join('\n') : '- Non specificato'}

### Verdetto esperto: ${sanitizeForPrompt(qaFacts.verdict)} (confidence: ${qaFacts.verdictConfidence})
${qaFacts.caveats.length > 0 ? `Avvertenze: ${qaFacts.caveats.map(c => sanitizeForPrompt(c)).join('; ')}` : ''}`;
  }

  // === SECTION 5: Benchmark context ===
  let benchmarkSection = '';
  if (ragEvidence.benchmarkContext) {
    benchmarkSection = `\n## CONTESTO BENCHMARK (Ancora di Verità)
${ragEvidence.benchmarkContext}`;
  }

  // === SECTION 6: Knowledge Graph context ===
  let kgSection = `\n## CONTESTO KNOWLEDGE GRAPH

### Brand:
${kgContext.brandInfo || 'Informazioni brand non disponibili'}

### Categoria prodotto:
${kgContext.categoryInfo || 'Categoria non identificata'}

### Sistema batteria:
${kgContext.batterySystem || 'Non specificato'}

### Adatto per mestieri:
${kgContext.suitableForTrades.length > 0
  ? kgContext.suitableForTrades.join(', ')
  : 'Non specificato'}

### Casi d'uso correlati:
${kgContext.relatedUseCases.length > 0
  ? kgContext.relatedUseCases.join(', ')
  : 'Non specificato'}

### Feature tecniche raccomandate per la categoria:
${kgContext.suggestedFeatures.length > 0
  ? kgContext.suggestedFeatures.join(', ')
  : 'Non specificato'}

### Prodotti complementari (cross-sell da RAG):
${kgContext.crossSellSuggestions.length > 0
  ? kgContext.crossSellSuggestions.join(', ')
  : 'Non disponibili'}`;

  // === SECTION 7: Conflicts warning ===
  let conflictsWarning = '';
  if (ragEvidence.conflicts.length > 0) {
    conflictsWarning = `\n## ⚠️ CONFLITTI NEI DATI - ATTENZIONE
${ragEvidence.conflicts.map(c => `- ${c}`).join('\n')}

IMPORTANTE: Per questi dati in conflitto, usa la qualifica "circa" o "tipicamente" invece di presentarli come valori esatti.`;
  }

  // Sanitize title: replace bare double-quotes (e.g. 1/2") with double-prime (″)
  // to prevent Gemini from embedding unescaped quotes inside JSON string values
  const safeTitle = product.title.replace(/"/g, '″');

  // === SECTION 0: AgeMem — business rules and cross-agent notes ===
  const memorySection = memoryPromptSection
    ? `\n${memoryPromptSection}\n---\n`
    : '';

  // === SECTION 8: Blog Sentiment Bridge — real forum opinions (R6 Phase B) ===
  let sentimentSection = '';
  if (sentimentData && sentimentData.postsAnalyzed > 0) {
    const problems = sentimentData.topProblems.slice(0, 3).map(p => `- ${p.issue} (${p.severity})`).join('\n');
    const praises = sentimentData.topPraises.slice(0, 3).map(p => `- ${p}`).join('\n');
    const quotes = sentimentData.sentiment.quotes.slice(0, 2).map(q => `- "${q.quote}" — ${q.source}`).join('\n');
    sentimentSection = `\n## OPINIONI REALI DAI FORUM (${sentimentData.postsAnalyzed} post analizzati — blog pipeline)
Usa questi dati per arricchire i pro/contro con opinioni autentiche. NON inventare variazioni.

**Problemi segnalati dagli utenti:**
${problems || '- Nessun problema ricorrente identificato'}

**Punti di forza apprezzati:**
${praises || '- Nessun elogio specifico identificato'}

**Citazioni dirette:**
${quotes || '- Nessuna citazione disponibile'}`;
  }

  // W15 fix: Token-aware budget enforcement.
  // Gemini context is large, but quality degrades with very long prompts.
  // Budget: system prompt (~900 tokens after D13 update) + user prompt + 2500 response tokens.
  //
  // D14 fix: Adaptive budget based on data richness.
  // Complex products with lots of evidence (generators, excavators) need more
  // room for benchmark + sentiment + KG context. Simple products with sparse
  // evidence waste tokens on empty sections. Scale: 6k–12k user prompt tokens.
  const SYSTEM_PROMPT_TOKENS = 900;  // D13 updated prompt
  const RESPONSE_TOKENS = 2500;
  const estimateTokens = (s: string) => Math.ceil(s.length / 3.2);

  // D14: Count total available content tokens to determine budget tier
  const totalContentTokens = [
    specsSection, unverifiedSection, ragSection, qaReasoningSection,
    benchmarkSection, kgSection, conflictsWarning, sentimentSection,
  ].reduce((sum, s) => sum + estimateTokens(s), 0);

  // D14: Adaptive tiers — more data = larger budget, but cap at 12k
  let MAX_USER_PROMPT_TOKENS: number;
  if (totalContentTokens < 3000) {
    MAX_USER_PROMPT_TOKENS = 6000;  // Sparse data — tight budget, no padding
  } else if (totalContentTokens < 6000) {
    MAX_USER_PROMPT_TOKENS = 8000;  // Normal — original budget
  } else if (totalContentTokens < 10000) {
    MAX_USER_PROMPT_TOKENS = 10000; // Rich data — allow benchmark + sentiment
  } else {
    MAX_USER_PROMPT_TOKENS = 12000; // Very rich — complex product with many sources
  }
  const MAX_PROMPT_CHARS = Math.floor(MAX_USER_PROMPT_TOKENS * 3.2);

  log.info(`[AI-V3] D14: Adaptive token budget — content=${totalContentTokens}tok → cap=${MAX_USER_PROMPT_TOKENS}tok (~${MAX_PROMPT_CHARS} chars)`);

  // Build sections in priority order (highest priority first)
  const prioritySections: Array<{ name: string; content: string; mutable: boolean }> = [
    { name: 'specs',       content: specsSection,       mutable: false },
    { name: 'qa',          content: qaReasoningSection, mutable: false },
    { name: 'conflicts',   content: conflictsWarning,   mutable: false },
    { name: 'rag',         content: ragSection,         mutable: true  },
    { name: 'kg',          content: kgSection,          mutable: true  },
    { name: 'unverified',  content: unverifiedSection,  mutable: true  },
    { name: 'benchmark',   content: benchmarkSection,   mutable: true  },
    { name: 'sentiment',   content: sentimentSection,   mutable: true  },
    // D20 fix: Inject violation feedback from TAYA Police corrections
    { name: 'feedback',    content: getViolationFeedback(5), mutable: true  },
  ];

  let totalTokens = 0;
  const truncated: Record<string, string> = {};

  for (const section of prioritySections) {
    const sectionTokens = estimateTokens(section.content);
    if (totalTokens + sectionTokens <= MAX_USER_PROMPT_TOKENS) {
      truncated[section.name] = section.content;
      totalTokens += sectionTokens;
    } else if (section.mutable && totalTokens < MAX_USER_PROMPT_TOKENS) {
      // W15: Partial include — take what fits within token budget
      const remainingTokens = MAX_USER_PROMPT_TOKENS - totalTokens;
      const remainingChars = Math.floor(remainingTokens * 3.2);
      truncated[section.name] = section.content.slice(0, remainingChars) + '\n[... troncato per budget token ...]';
      totalTokens = MAX_USER_PROMPT_TOKENS;
      log.warn(`[AI-V3] W15: section "${section.name}" truncated to ~${remainingTokens} tokens`);
    } else {
      truncated[section.name] = '';
      if (section.content.length > 0) {
        log.warn(`[AI-V3] W15: section "${section.name}" dropped (~${sectionTokens} tokens, budget full)`);
      }
    }
  }

  // Reassign sections from truncated budget map
  specsSection       = truncated['specs']      ?? specsSection;
  qaReasoningSection = truncated['qa']         ?? qaReasoningSection;
  conflictsWarning   = truncated['conflicts']  ?? conflictsWarning;
  ragSection         = truncated['rag']        ?? ragSection;
  kgSection          = truncated['kg']         ?? kgSection;
  unverifiedSection  = truncated['unverified'] ?? unverifiedSection;
  benchmarkSection   = truncated['benchmark']  ?? benchmarkSection;
  sentimentSection   = truncated['sentiment']  ?? sentimentSection;
  // D20 fix: violation feedback section
  const feedbackSection = truncated['feedback'] ?? '';

  log.info(`[AI-V3] D14: Prompt budget: ~${totalTokens}/${MAX_USER_PROMPT_TOKENS} tokens used across sections`);

  return `Genera contenuti per questo prodotto usando SOLO i dati verificati che ti fornisco.
Questi dati provengono da ricerca web REALE (UniversalRAG) e verifica fatti (TwoPhaseQA).
NON inventare dati. Se un'informazione non è presente, non includerla.

**Titolo:** ${safeTitle}
**Brand:** ${brand}
**SKU:** ${sku}
**Tipo prodotto:** ${product.product_type || 'Elettroutensile'}
${memorySection}
${specsSection}
${unverifiedSection}
${ragSection}
${qaReasoningSection}
${benchmarkSection}
${kgSection}
${conflictsWarning}
${sentimentSection}
${feedbackSection}

## ISTRUZIONI

1. Usa le specifiche tecniche SOLO se verificate da TwoPhaseQA
2. Integra i punti di forza/debolezza del QA nei pro/contro
3. Usa i dati RAG reali per arricchire la descrizione con dettagli concreti
4. Se un dato tecnico non è presente nei dati verificati sopra, NON includerlo nell'output — scrivi meno ma solo cose verificate. Mai inventare specifiche, mai descrivere "benefici tipici della categoria" come se fossero dati reali di questo prodotto
5. Usa il contesto del Knowledge Graph per i mestieri e casi d'uso
6. Collega ogni specifica a un beneficio lavorativo concreto (JTBD)
7. MAI usare "questo prodotto", "questo articolo", "questo utensile" — usa sempre il nome del prodotto o una perifrasi (es. "la chiodatrice", "l'avvitatore", "il trapano")
8. CRITICO: Non usare MAI il carattere " (virgolette doppie) all'interno dei valori stringa del JSON — non come segno pollici (scrivi ″ o "pollici"), non come virgolette citazione (scrivi « »). Il carattere " è riservato SOLO per la struttura JSON.

Rispondi SOLO con JSON valido:

NOTA LINGUA (W-V3-5): Le chiavi JSON sono in inglese (description, pros, cons, faqs, specs,
question, answer) perché sono contratti di codice — non tradurle.
I VALORI devono essere scritti interamente in italiano.

{
  "description": "... (in italiano) ...",
  "pros": ["... (in italiano) ...", "...", "..."],
  "cons": ["... (in italiano) ...", "..."],
  "faqs": [
    {"question": "... (in italiano) ...", "answer": "... (in italiano) ..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "specs": {
    "Potenza": "...",
    "Tensione": "...",
    "Peso": "..."
  }
}

Includi in "specs" SOLO le specifiche tecniche verificate da TwoPhaseQA (chiave = nome spec, valore = dato con unità). Se nessuna specifica è verificata, usa un oggetto vuoto {}.`;
}

// =============================================================================
// W-V3-1 fix: FAQ recovery — targeted second call when FAQs are truncated
// =============================================================================

/**
 * W-V3-1 fix: Recovers missing FAQ entries with a cheap targeted second call.
 *
 * Even with adaptive maxTokens, very complex products (many specs + long RAG evidence)
 * can fill the output budget before all 3 FAQs are written. Rather than silently
 * returning 1 or 2 FAQs, this function detects the truncation and fires a second
 * Gemini call with a minimal prompt containing only what's needed for FAQs.
 *
 * Cost: +1 lite-model call (~5ms, ~0.01 cent) only when FAQs are missing.
 * The call uses `useLiteModel: true` and maxTokens: 500 to keep it cheap.
 */
async function generateMissingFaqs(
  existingFaqs: { question: string; answer: string }[],
  qaFacts: QAFacts | null,
  productTitle: string,
  brand: string,
): Promise<{ question: string; answer: string }[]> {
  const needed = 3 - existingFaqs.length;
  if (needed <= 0) return existingFaqs;

  const specsContext = qaFacts?.verifiedSpecs
    .slice(0, 5)
    .map(s => `- ${s.question}: ${s.answer}`)
    .join('\n') ?? '';

  const existingQs = existingFaqs.map(f => f.question).join('\n') || '(nessuna)';

  const prompt = `Genera ${needed} FAQ aggiuntive per il prodotto "${productTitle}" (${brand}).

Specifiche verificate:
${specsContext || '(nessuna specifica disponibile)'}

FAQ già presenti (non duplicare):
${existingQs}

Genera domande reali che i clienti farebbero in negozio. Risposta in 1-2 frasi, in italiano.
Rispondi SOLO con JSON valido:
{
  "faqs": [
    {"question": "...", "answer": "..."}
  ]
}`;

  try {
    const result = await generateTextSafe({
      system: 'Rispondi SOLO con JSON valido, nessun testo aggiuntivo.',
      prompt,
      maxTokens: 500,
      temperature: 0.1,
      useLiteModel: true,
    });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in FAQ recovery response');
    const parsed = JSON.parse(jsonMatch[0]) as { faqs?: { question: string; answer: string }[] };
    const newFaqs = (parsed.faqs ?? []).slice(0, needed);
    log.info(`[AI-V3] W-V3-1: FAQ recovery added ${newFaqs.length} FAQ(s)`);
    return [...existingFaqs, ...newFaqs].slice(0, 3);
  } catch (err) {
    log.warn('[AI-V3] W-V3-1: FAQ recovery call failed:', err);
    return existingFaqs;
  }
}

// =============================================================================
// W-V3-2 fix: Self-consistency check across description / pros / cons
// =============================================================================

/**
 * W-V3-2 fix: Detects numeric inconsistencies within the generated output.
 *
 * The single LLM call produces description, pros, and cons in one pass.
 * If the model hallucinates different values for the same unit in different
 * sections (e.g. description says "135 Nm" but pros say "130 Nm"), Step 7
 * won't catch it because Step 7 only cross-checks description vs QA data.
 *
 * This function:
 * 1. Extracts (value, unit) pairs from description and pros+cons separately.
 * 2. Compares values for the same unit across sections.
 * 3. Flags pairs that differ by more than 2% (rounding tolerance).
 *
 * Returns an array of human-readable inconsistency strings (empty = clean).
 */
function checkOutputConsistency(content: EnrichedProductData): string[] {
  // Extract number+unit pairs from a text block.
  // Units covered: the most common technical measurement units for power tools.
  const UNIT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(Nm|kg|[kK][wW]|[wW]|[vV]|Ah|rpm|RPM|bar|dB|mm|cm|[lL]|[Ll]itri|°C|Hz|kVA|kN|cc)/g;

  const extractPairs = (text: string): Map<string, number[]> => {
    const byUnit = new Map<string, number[]>();
    let m: RegExpExecArray | null;
    const re = new RegExp(UNIT_PATTERN.source, 'g');
    while ((m = re.exec(text)) !== null) {
      const value = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      byUnit.get(unit)!.push(value);
    }
    return byUnit;
  };

  const descPairs    = extractPairs(content.description ?? '');
  const proConsPairs = extractPairs([...(content.pros ?? []), ...(content.cons ?? [])].join(' '));

  const issues: string[] = [];
  for (const [unit, descVals] of descPairs) {
    const pcVals = proConsPairs.get(unit);
    if (!pcVals) continue;
    for (const dv of descVals) {
      for (const pcv of pcVals) {
        const larger = Math.max(dv, pcv);
        if (larger > 0 && Math.abs(dv - pcv) / larger > 0.02) {
          issues.push(
            `descrizione: ${dv} ${unit} ↔ pros/cons: ${pcv} ${unit}`
          );
        }
      }
    }
  }

  return issues;
}

// =============================================================================
// LLM GENERATION V3 (Refactored)
// =============================================================================

async function generateWithLLMV3(
  userPrompt: string,
  ragEvidence: RAGEvidence,
  qaFacts: QAFacts | null,
  productTitle: string = '',
  brand: string = '',
): Promise<EnrichedProductData> {
  // W-V3-1 fix: Adaptive output token budget.
  // Base 2500 is enough for simple products but FAQs get truncated on complex ones.
  // Heuristic: verified spec count + RAG snippet count = product complexity.
  const specCount = qaFacts?.verifiedSpecs.length ?? 0;
  const snippetCount = ragEvidence.snippets.length;
  const complexityScore = specCount + snippetCount;
  const outputTokens = complexityScore > 15 ? 4096
    : complexityScore > 8  ? 3500
    : 2500;
  if (outputTokens > 2500) {
    log.info(`[AI-V3] W-V3-1: complexity=${complexityScore} → outputTokens=${outputTokens}`);
  }

  try {
    const result = await generateTextSafe({
      system: SYSTEM_PROMPT_V3_COMPACT, // W14: ~800 tokens vs ~2800 before
      prompt: userPrompt,
      maxTokens: outputTokens,
      temperature: 0.1, // W-V3-4 fix: lowered from 0.3 — structured JSON output needs near-determinism for reproducible debug
    });

    const content = result.text;
    
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // Strip markdown code fences, then find the outermost JSON object
    const stripped = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Gemini sometimes wraps JSON in extra prose — extract the first complete {...} block.
    // Use a greedy match to get the LAST closing brace (handles nested objects).
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    const jsonStr = jsonStart !== -1 && jsonEnd > jsonStart
      ? stripped.slice(jsonStart, jsonEnd + 1)
      : stripped;

    let parsed: EnrichedProductData;
    try {
      parsed = JSON.parse(jsonStr) as EnrichedProductData;
    } catch (parseError) {
      // Attempt to repair unescaped double-quotes inside JSON string values.
      // Gemini sometimes writes Italian quotation marks or inch specs as bare " characters.
      // Strategy: scan character by character. Inside a string value, any " that is NOT
      // followed by a JSON structural token (:, ,, ], }, whitespace+structural) is treated
      // as an inline quote and replaced with the Unicode double-prime ″ (U+2033).
      log.error('[AI-V3] JSON parse failed. LLM output preview:', content.substring(0, 300));
      log.info('[AI-V3] Attempting smart JSON repair...');

      const repaired = repairUnescapedQuotes(jsonStr);
      try {
        parsed = JSON.parse(repaired) as EnrichedProductData;
        log.info('[AI-V3] JSON repair succeeded');
      } catch (repairError) {
        const repairErrMsg = repairError instanceof Error ? repairError.message : String(repairError);
        log.error(`[AI-V3] JSON repair also failed: ${repairErrMsg}`);
        throw parseError;
      }
    }

    // Validate structure
    if (!parsed.description || !Array.isArray(parsed.pros) || !Array.isArray(parsed.cons) || !Array.isArray(parsed.faqs)) {
      throw new Error('Invalid response structure from LLM');
    }

    // W-V3-2: Self-consistency check — same unit, different value across sections
    const consistencyIssues = checkOutputConsistency(parsed);
    if (consistencyIssues.length > 0) {
      log.warn(`[AI-V3] W-V3-2: ${consistencyIssues.length} numeric inconsistency/ies in generated output:`);
      for (const issue of consistencyIssues) {
        log.warn(`[AI-V3]   ✗ ${issue}`);
      }
    }

    // Enhance cons with QA weaknesses if not already included
    if (qaFacts && qaFacts.weaknesses.length > 0 && parsed.cons.length < 3) {
      for (const weakness of qaFacts.weaknesses) {
        const cleanWeakness = weakness.replace(/^⚠\s*/, '');
        if (!parsed.cons.some(c => c.toLowerCase().includes(cleanWeakness.toLowerCase().slice(0, 20)))) {
          parsed.cons.push(cleanWeakness);
          if (parsed.cons.length >= 3) break;
        }
      }
    }

    // W-V3-1: Recover missing FAQs with a targeted second call if main call truncated them
    if ((parsed.faqs?.length ?? 0) < 3) {
      log.warn(`[AI-V3] W-V3-1: FAQs truncated (${parsed.faqs?.length ?? 0}/3) — recovering with targeted call`);
      parsed.faqs = await generateMissingFaqs(
        parsed.faqs ?? [],
        qaFacts,
        productTitle,
        brand,
      );
    }

    return parsed;
    
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    log.error('[AI-V3] Generation Error:', errMsg);
    log.error('[AI-V3] Failure type:', error instanceof SyntaxError ? 'JSON_PARSE' : error instanceof Error && error.message.includes('Invalid response') ? 'VALIDATION' : 'LLM_CALL');

    // Record error
    getMetricsStore().recordError({
      productId: 'unknown',
      errorType: 'generation_failure',
      severity: 'high',
      timestamp: new Date(),
      details: error instanceof Error ? error.message : 'Unknown error',
      resolved: false,
    });
    
    // Return fallback using REAL data from RAG + QA (not hallucinated).
    // W-V3-3: clean banned phrases — fallback bypasses the LLM system prompt
    return cleanFallbackContent(buildFallbackContent(ragEvidence, qaFacts));
  }
}

// =============================================================================
// D16 fix: Content Quality Scoring
// =============================================================================

/**
 * D16 fix: Computes an intrinsic quality score for generated content.
 *
 * Enables A/B testing between prompt versions and trend analysis of
 * content quality across runs. Each dimension is 0–1, and the overall
 * score is a weighted average.
 *
 * Dimensions:
 * - factualDensity: How many verified specs are referenced in the description?
 * - specificityScore: Do pros/cons cite specific numbers (not just adjectives)?
 * - jtbdCoverage: Are specs connected to work benefits (JTBD pattern)?
 * - completeness: Are all required output sections non-empty?
 * - honestyScore: Absence of banned marketing phrases?
 */
export function scoreContentQuality(
  content: EnrichedProductData,
  qaFacts: QAFacts | null,
): ContentQualityScore {
  const desc = content.description || '';
  const descLower = desc.toLowerCase();

  // 1. Factual density: ratio of verified spec values found in description
  let factualDensity = 0;
  if (qaFacts && qaFacts.verifiedSpecs.length > 0) {
    let found = 0;
    for (const spec of qaFacts.verifiedSpecs) {
      // Extract numbers from the spec answer and check if they appear in description
      const numbers = spec.answer.match(/\d+[.,]?\d*/g) || [];
      if (numbers.some(n => desc.includes(n))) found++;
    }
    factualDensity = found / qaFacts.verifiedSpecs.length;
  } else {
    factualDensity = 0.5; // No specs to verify — neutral score
  }

  // 2. Specificity: do pros/cons contain actual numbers (not just adjectives)?
  const allProsCons = [...(content.pros || []), ...(content.cons || [])];
  let specificItems = 0;
  for (const item of allProsCons) {
    if (/\d+/.test(item)) specificItems++;
  }
  const specificityScore = allProsCons.length > 0
    ? specificItems / allProsCons.length
    : 0;

  // 3. JTBD coverage: look for benefit language patterns near numbers
  // Patterns: "→", "per", "consente di", "permette", "significa", "garantisce"
  const jtbdPatterns = /→|per\s+\w+|consente|permette|significa|garantisce|ideale per|adatto a/gi;
  const jtbdMatches = desc.match(jtbdPatterns) || [];
  const jtbdCoverage = Math.min(1, jtbdMatches.length / 3); // 3+ patterns = full score

  // 4. Completeness: are all required sections non-empty and sufficient?
  let completenessPoints = 0;
  const totalPoints = 5;
  if (desc.length >= 100) completenessPoints++;  // Description meaningful
  if ((content.pros?.length ?? 0) >= 2) completenessPoints++;  // At least 2 pros
  if ((content.cons?.length ?? 0) >= 1) completenessPoints++;  // At least 1 con
  if ((content.faqs?.length ?? 0) >= 2) completenessPoints++;  // At least 2 FAQs
  if (content.specs && Object.keys(content.specs).length >= 3) completenessPoints++; // 3+ specs
  const completeness = completenessPoints / totalPoints;

  // 5. Honesty: penalize banned marketing phrases
  const BANNED_PHRASES = [
    'leader di settore', 'eccellenza', 'qualità superiore', 'il migliore',
    'straordinario', 'eccezionale', 'perfetto', 'alta qualità',
    'questo prodotto', 'questo articolo',
  ];
  const bannedFound = BANNED_PHRASES.filter(p => descLower.includes(p)).length;
  const honestyScore = Math.max(0, 1 - (bannedFound * 0.25));

  // Weighted overall score
  const overall =
    factualDensity * 0.30 +
    specificityScore * 0.20 +
    jtbdCoverage * 0.15 +
    completeness * 0.20 +
    honestyScore * 0.15;

  return {
    overall: Math.round(overall * 100) / 100,
    factualDensity: Math.round(factualDensity * 100) / 100,
    specificityScore: Math.round(specificityScore * 100) / 100,
    jtbdCoverage: Math.round(jtbdCoverage * 100) / 100,
    completeness: Math.round(completeness * 100) / 100,
    honestyScore: Math.round(honestyScore * 100) / 100,
  };
}

/**
 * Builds fallback content using real RAG + QA data when LLM generation fails.
 * This replaces the old fallback that used data from the autonomous (hallucinated) research.
 */
/**
 * W-V3-3 fix: Scrubs banned marketing phrases from fallback content.
 *
 * `buildFallbackContent()` assembles text from RAG snippets and QA verdicts,
 * which may themselves contain marketing fluff copied from retailer pages.
 * The LLM path is cleansed by the system-prompt rules, but the mechanical
 * fallback bypasses the LLM entirely — no TAYA Police, no system prompt.
 *
 * This function applies deterministic regex substitutions to strip the same
 * banned phrases that the system prompt forbids the model from using.
 */
const FALLBACK_PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/\bleader\s+di\s+settore\b/gi, 'specializzato nel settore'],
  [/\beccellenz[ae]\b/gi, 'qualità'],
  [/\bqualità\s+superior[ei]\b/gi, 'qualità professionale'],
  [/\bil\s+migliore\b/gi, 'un prodotto affidabile'],
  [/\bstraordinar[io|ia]\b/gi, 'efficace'],
  [/\beccezional[ei]\b/gi, 'buono'],
  [/\bperfett[oa]\b/gi, 'adatto'],
  [/\balta\s+qualità\b/gi, 'qualità professionale'],
  [/\bquesto\s+prodotto\b/gi, 'il prodotto'],
  [/\bquesto\s+articolo\b/gi, 'il prodotto'],
  [/\bquesto\s+utensile\b/gi, "l'utensile"],
];

function cleanFallbackContent(content: EnrichedProductData): EnrichedProductData {
  const clean = (text: string): string =>
    FALLBACK_PHRASE_REPLACEMENTS.reduce((s, [re, rep]) => s.replace(re, rep), text);

  return {
    ...content,
    description: clean(content.description ?? ''),
    pros: (content.pros ?? []).map(clean),
    cons: (content.cons ?? []).map(clean),
    faqs: (content.faqs ?? []).map(f => ({
      question: clean(f.question),
      answer: clean(f.answer),
    })),
  };
}

/**
 * D15 fix: Enhanced fallback that mechanically assembles real RAG + QA data.
 *
 * Previously the fallback ignored RAG snippets and verified specs entirely,
 * returning placeholder strings. Now it:
 * 1. Builds a description from QA verdict + top verified specs
 * 2. Constructs pros from verified strengths + high-trust RAG snippets
 * 3. Constructs FAQs from actual QA questions (not just generic ones)
 * 4. Includes verified specs in the specs field
 */
function buildFallbackContent(
  ragEvidence: RAGEvidence,
  qaFacts: QAFacts | null,
): EnrichedProductData {
  // D15: Build description from verified specs + QA verdict
  const descParts: string[] = [];
  if (qaFacts?.verdict && qaFacts.verdict.length > 20) {
    descParts.push(qaFacts.verdict);
  }
  // D15: Append key verified specs as bullet points
  if (qaFacts && qaFacts.verifiedSpecs.length > 0) {
    const specLines = qaFacts.verifiedSpecs
      .slice(0, 5)
      .map(s => `${s.question.replace(/\?$/, '')}: ${s.answer}`)
      .join('. ');
    descParts.push(`Specifiche verificate: ${specLines}.`);
  }
  // D15: If still empty, use top RAG snippet as last resort
  if (descParts.length === 0 && ragEvidence.snippets.length > 0) {
    const topSnippet = ragEvidence.snippets
      .sort((a, b) => b.trust - a.trust)[0];
    if (topSnippet && topSnippet.text.length > 30) {
      descParts.push(topSnippet.text.substring(0, 300));
    }
  }
  const description = descParts.length > 0
    ? descParts.join(' ')
    : 'Contattaci per una consulenza personalizzata su questo prodotto.';

  // D15: Build pros from QA strengths, then high-trust RAG snippets
  let pros: string[] = [];
  if (qaFacts && qaFacts.strengths.length > 0) {
    pros = qaFacts.strengths.slice(0, 3).map(s => s.replace(/^✓\s*/, ''));
  }
  if (pros.length < 3 && ragEvidence.snippets.length > 0) {
    // Extract positive indicators from high-trust RAG snippets
    const highTrust = ragEvidence.snippets
      .filter(s => s.trust >= 0.7)
      .slice(0, 3 - pros.length);
    for (const snippet of highTrust) {
      const shortText = snippet.text.substring(0, 100).replace(/\n/g, ' ').trim();
      if (shortText.length > 20) pros.push(shortText);
    }
  }
  if (pros.length === 0) {
    pros = [
      'Qualità professionale con garanzia ufficiale italiana',
      'Assistenza tecnica dedicata presso la nostra sede di Genova',
      'Possibilità di provarlo prima dell\'acquisto',
    ];
  }

  // D15: Build cons from QA weaknesses
  const cons = qaFacts && qaFacts.weaknesses.length > 0
    ? qaFacts.weaknesses.slice(0, 2).map(w => w.replace(/^⚠\s*/, ''))
    : [
        'Contattaci per conoscere i dettagli tecnici specifici',
        'Verifica la compatibilità con i tuoi accessori esistenti',
      ];

  // D15: Build FAQs from actual QA facts where possible
  const faqs: { question: string; answer: string }[] = [];
  if (qaFacts) {
    // Use verified specs as FAQ Q&A pairs
    for (const spec of qaFacts.verifiedSpecs.slice(0, 2)) {
      faqs.push({ question: spec.question, answer: spec.answer });
    }
  }
  // Fill remaining with defaults
  const defaultFaqs = [
    {
      question: 'Posso provarlo prima di acquistarlo?',
      answer: 'Certamente. Passa in negozio a Lungobisagno d\'Istria 34 e te lo facciamo vedere dal vivo.',
    },
    {
      question: 'Che garanzia ha?',
      answer: 'Garanzia ufficiale italiana di 2 anni. Per alcuni brand offriamo estensioni a condizioni vantaggiose.',
    },
    {
      question: 'Fate assistenza post-vendita?',
      answer: 'Sì, abbiamo un laboratorio interno per riparazioni e manutenzione.',
    },
  ];
  while (faqs.length < 3) {
    faqs.push(defaultFaqs[faqs.length]!);
  }

  // D15: Include verified specs as structured data
  const specs: Record<string, string> = {};
  if (qaFacts) {
    for (const spec of qaFacts.verifiedSpecs) {
      const key = spec.question.replace(/^Qual è |^Quanti |^Quante |^Ha |\?$/gi, '').trim();
      specs[key] = spec.answer;
    }
  }

  return {
    description,
    pros,
    cons,
    faqs,
    specs: Object.keys(specs).length > 0 ? specs : undefined,
  };
}

// =============================================================================
// W17 fix: HTML sanitization + audit
// =============================================================================

/**
 * W17 fix: Sanitize LLM-generated text before embedding in HTML.
 *
 * The LLM output goes directly into Shopify product descriptions. If the model
 * produces malformed or dangerous HTML (script tags, event handlers, unclosed
 * tags), it would go straight to production.
 *
 * This function:
 * 1. Strips dangerous tags: <script>, <iframe>, <object>, <embed>, <form>
 * 2. Strips event handler attributes: on*, javascript: hrefs
 * 3. Escapes residual HTML in LLM text (content that should be text, not markup)
 */
function sanitizeHtmlContent(text: string): string {
  return text
    // Strip dangerous tags and their content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // Strip event handler attributes (onclick, onerror, etc.)
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*\S+/gi, '')
    // Strip javascript: protocol in hrefs
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    // Encode any remaining raw < > that aren't part of allowed tags
    // (keep tags that are structurally valid like <strong>, <em>, <br>)
    .trim();
}

/**
 * W17 fix: Validate generated HTML for common structural problems.
 * Returns an array of warnings (empty = clean HTML).
 */
function validateHtml(html: string): string[] {
  const warnings: string[] = [];

  // Check for unclosed tags (basic check — not a full parser)
  const openTags = html.match(/<(div|ul|ol|li|p|h[1-6]|span|section|table|tr|td|th)\b/gi) || [];
  const closeTags = html.match(/<\/(div|ul|ol|li|p|h[1-6]|span|section|table|tr|td|th)>/gi) || [];
  if (openTags.length !== closeTags.length) {
    warnings.push(`Tag count mismatch: ${openTags.length} opening vs ${closeTags.length} closing`);
  }

  // Check for empty critical sections
  if (html.includes('<ul>\n') && html.includes('</ul>') && !html.includes('<li>')) {
    warnings.push('Empty <ul> found — no <li> children');
  }

  // Check for residual LLM artifacts
  if (html.includes('```') || html.includes('**')) {
    warnings.push('Residual markdown found in HTML output');
  }

  // Check for dangerous content that slipped through sanitization
  if (/<script/i.test(html) || /on\w+\s*=/i.test(html) || /javascript:/i.test(html)) {
    warnings.push('CRITICAL: Potentially dangerous HTML content detected');
  }

  return warnings;
}

// =============================================================================
// HTML FORMATTING V3
// =============================================================================

export function formatDescriptionAsHtmlV3(data: EnrichedProductDataV3): string {
  // W17: sanitize all LLM-generated text before embedding in HTML
  const safePros = data.pros.map(pro => sanitizeHtmlContent(pro));
  const safeCons = data.cons.map(con => sanitizeHtmlContent(con));
  const safeDescription = sanitizeHtmlContent(data.description);
  const safeFaqs = data.faqs.map(faq => ({
    question: sanitizeHtmlContent(faq.question),
    answer: sanitizeHtmlContent(faq.answer),
  }));
  const safeAccessories = data.accessories.map(acc => ({
    name: sanitizeHtmlContent(acc.name),
    reason: sanitizeHtmlContent(acc.reason),
  }));

  const prosHtml = safePros.map(pro => `<li>${pro}</li>`).join('\n          ');
  const consHtml = safeCons.map(con => `<li>${con}</li>`).join('\n          ');
  
  const faqsHtml = safeFaqs.map(faq => `
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h4 itemprop="name">${faq.question}</h4>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <p itemprop="text">${faq.answer}</p>
        </div>
      </div>`).join('\n');

  // Accessories section
  const accessoriesHtml = safeAccessories.length > 0
    ? `
  <div class="accessories-section">
    <h3>🔧 Accessori consigliati</h3>
    <ul>
      ${safeAccessories.map(acc => `<li><strong>${acc.name}</strong>: ${acc.reason}</li>`).join('\n      ')}
    </ul>
  </div>`
    : '';

  // Data quality indicator
  const qualityBadge = data.dataQuality.specsVerified
    ? '<span class="quality-badge verified">✓ Dati verificati</span>'
    : '<span class="quality-badge">Alcuni dati da confermare</span>';

  // KG context for trades
  const tradesHtml = data.knowledgeGraphContext.suitableForTrades.length > 0
    ? `<p class="suitable-trades">Ideale per: ${data.knowledgeGraphContext.suitableForTrades.join(', ')}</p>`
    : '';

  const html = `
<div class="product-description" itemscope itemtype="https://schema.org/Product">
  <div class="description-intro">
    <p itemprop="description">${safeDescription}</p>
    ${tradesHtml}
  </div>

  <div class="pros-cons">
    <div class="pros">
      <h3>👍 Perché sceglierlo</h3>
      <ul>
          ${prosHtml}
      </ul>
    </div>

    <div class="cons">
      <h3>👎 Da considerare</h3>
      <ul>
          ${consHtml}
      </ul>
    </div>
  </div>
  ${accessoriesHtml}

  <div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
    <h3>❓ Domande frequenti</h3>
    ${faqsHtml}
  </div>

  <p class="content-note">
    <small>
      ${qualityBadge} |
      Contenuto curato dal team tecnico di Autonord Service.
      <a href="/contact">Contattaci</a> per domande.
    </small>
  </p>
</div>`.trim();

  // W17: Validate HTML and log audit summary
  const htmlWarnings = validateHtml(html);
  if (htmlWarnings.length > 0) {
    log.warn(`[AI-V3] W17 HTML audit: ${htmlWarnings.length} warning(s):`);
    for (const w of htmlWarnings) {
      log.warn(`[AI-V3]   - ${w}`);
    }
  } else {
    log.info(`[AI-V3] W17 HTML audit: clean (${html.length} chars, ${safePros.length} pros, ${safeCons.length} cons, ${safeFaqs.length} FAQs)`);
  }

  return html;
}

// =============================================================================
// EXPORTS
// =============================================================================

// V3 is now the primary version - V1 (ai-enrichment.ts) has been deprecated
// FIX ARCHITETTURALE: product-research.ts è ora @deprecated (non più usato da V3)
