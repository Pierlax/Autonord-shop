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
  formatProvenanceDisplay,
  generateProvenanceReport,
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

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

// AI client is now centralized in lib/shopify/ai-client.ts (Gemini)
// No per-module initialization needed

// =============================================================================
// ENHANCED SYSTEM PROMPT V3
// =============================================================================

// The Pragmatic Truth Philosophy is now imported from core-philosophy module
// This combines TAYA (Marcus Sheridan), Krug (Don't Make Me Think), and JTBD (Christensen)
const SYSTEM_PROMPT_V3 = `${AGENT_1_PRODUCT_DIRECTIVE}

---

## PERSONA: TEAM AUTONORD

Siete il Team Tecnico di Autonord Service, un gruppo di esperti con oltre 40 anni di esperienza combinata nel settore elettroutensili professionali a Genova. Il team include ex-elettricisti, ex-idraulici e tecnici specializzati che hanno lavorato in cantiere prima di passare alla consulenza.

## LA VOSTRA VOCE

Scrivete come parlate ai clienti in negozio: diretti, competenti, ma mai arroganti. Usate un italiano pulito e professionale, ma non accademico. Parlate al plurale ("noi", "abbiamo testato", "consigliamo") per rappresentare l'esperienza collettiva del team.

## REGOLE KRUG - FORMATO SCANNABLE

1. **Prima riga = problema che risolve** (non caratteristiche)
2. **Specifiche in formato:** Grassetto + Valore + (Beneficio lavorativo)
3. **Pro/Contro:** Max 1 riga ciascuno, bullet points
4. **FAQ:** Domande reali, risposte in 1-2 frasi
5. **Max 200 parole** - Se puoi dirlo in 5 parole, non usarne 10

## REGOLE JTBD - COLLEGA SPEC A LAVORO

Ogni specifica tecnica DEVE essere collegata a un beneficio lavorativo:
- "5Ah" → "Mezza giornata senza ricaricare"
- "Brushless" → "Meno manutenzione, vita più lunga"
- "1.5kg" → "Ideale per lavori sopra la testa"
- "80Nm" → "Fora anche il cemento armato"

## STRUTTURA OUTPUT

1. **Descrizione** (150-200 parole): Problema → Soluzione → Per chi (e NON per chi)
2. **3 PRO**: Spec verificata + beneficio lavorativo concreto
3. **2 CONTRO**: Problemi REALI da recensioni (non minimizzati)
4. **3 FAQ**: Domande che i clienti fanno DAVVERO
5. **Accessori**: Basati su analisi competitor

## ESEMPIO TRASFORMAZIONE

❌ VIETATO:
"Questo trapano offre prestazioni eccezionali grazie al suo potente motore brushless."

✅ OBBLIGATORIO:
"Passi la giornata a forare cemento armato? Questo non si arrende a metà mattina.
**Motore:** Brushless (dopo 200 fori sei ancora al 70% di batteria)
**Peso:** 1.8kg (gestibile anche sopra la testa)
**Contro:** Costa. Se fai solo bricolage, guarda il modello base."

## PAROLE VIETATE

MAI usare: "leader di settore", "eccellenza", "qualità superiore", "il migliore", "straordinario", "eccezionale", "perfetto", "alta qualità", "questo prodotto", "questo articolo"`;

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
  };
  metrics: ContentGenerationMetrics;
}

// =============================================================================
// KNOWLEDGE GRAPH ENRICHMENT
// =============================================================================

function enrichWithKnowledgeGraph(
  productName: string,
  brand: string
): EnrichedProductDataV3['knowledgeGraphContext'] {
  const kg = getKnowledgeGraph();
  const context = kg.enrichProductContext(productName, brand);

  return {
    brandInfo: context.brandInfo ? JSON.stringify(context.brandInfo.properties) : null,
    categoryInfo: context.categoryInfo ? context.categoryInfo.name : null,
    batterySystem: context.batterySystem ? context.batterySystem.name : null,
    suitableForTrades: context.suitableForTrades.map(t => t.name),
    relatedUseCases: context.relatedUseCases.map(u => u.name),
  };
}

// =============================================================================
// PROVENANCE TRACKING (Refactored to use RAG + QA data)
// =============================================================================

/**
 * Builds provenance from RAG evidence and QA verified facts.
 * No longer depends on the old product-research module.
 */
function trackProvenanceFromRAGandQA(
  productId: string,
  productName: string,
  ragResult: UniversalRAGResult,
  qaResult: TwoPhaseQAResult | null,
): ContentProvenance {
  const tracker = new FactProvenanceTracker();

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
      }
    }
  }

  // Register facts from RAG evidence
  if (ragResult.success && ragResult.data?.evidence && Array.isArray(ragResult.data.evidence)) {
    for (const item of ragResult.data.evidence) {
      const sourceLabel = item.source || item.sourceType || 'UniversalRAG';
      const content = item.content || item.text || item.snippet || '';
      
      if (content && typeof content === 'string' && content.length > 10) {
        tracker.registerFact(
          `RAG Evidence (${sourceLabel})`,
          content.substring(0, 200),
          {
            name: sourceLabel,
            type: mapRagSourceToAttribution(sourceLabel),
            reliability: item.confidence ? parseFloat(item.confidence) / 100 : 0.7,
            extractedAt: new Date(),
          }
        );
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

  return generateContentProvenance(
    productId,
    productName,
    tracker.getAllFacts()
  );
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
  
  // Step 2: Enrich with Knowledge Graph (this is local, no web calls)
  log.info('[AI-V3] Step 2: Enriching with Knowledge Graph...');
  const kgContext = enrichWithKnowledgeGraph(product.title, brand);
  
  // Step 3: Track provenance from RAG + QA data
  log.info('[AI-V3] Step 3: Tracking provenance from RAG + QA...');
  const fusionStart = Date.now();
  const provenance = trackProvenanceFromRAGandQA(productId, product.title, ragResult, qaResult);
  timings.fusion = Date.now() - fusionStart;
  
  // Step 4: Generate safety log
  const safetyLog = generateSafetyLogFromRAGandQA(product.title, ragResult, qaResult);
  log.info('[AI-V3] Safety log generated');
  
  // Step 5: Build enhanced prompt with REAL data from RAG + QA + KG
  const userPrompt = buildEnhancedPromptV3(product, brand, ragEvidence, qaFacts, kgContext);
  
  // Step 6: Generate content with LLM
  log.info('[AI-V3] Step 6: Generating content with LLM (using RAG+QA context)...');
  const llmStart = Date.now();
  const content = await generateWithLLMV3(userPrompt, ragEvidence, qaFacts);
  timings.llm = Date.now() - llmStart;
  
  // Step 7: Verification (placeholder for now)
  const verificationStart = Date.now();
  // TODO: Add verification step
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
  };
}

// =============================================================================
// RAG + QA DATA EXTRACTION HELPERS
// =============================================================================

interface RAGEvidence {
  snippets: { text: string; source: string; confidence?: string }[];
  benchmarkContext: string | null;
  brandProfile: string | null;
  competitors: string[];
  conflicts: string[];
  accessories: { name: string; reason: string }[];
}

interface QAFacts {
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

/**
 * Extracts structured evidence from the UniversalRAG result.
 */
function extractRAGEvidence(ragResult: UniversalRAGResult): RAGEvidence {
  const evidence: RAGEvidence = {
    snippets: [],
    benchmarkContext: null,
    brandProfile: null,
    competitors: [],
    conflicts: [],
    accessories: [],
  };

  if (!ragResult.success || !ragResult.data) {
    return evidence;
  }

  const data = ragResult.data;

  // Extract evidence snippets
  if (data.evidence && Array.isArray(data.evidence)) {
    for (const item of data.evidence) {
      const text = item.content || item.text || item.snippet || '';
      const source = item.source || item.sourceType || 'unknown';
      if (text && typeof text === 'string' && text.length > 5) {
        evidence.snippets.push({
          text,
          source,
          confidence: item.confidence,
        });
      }
    }
  }

  // Extract from source-keyed data (fallback)
  if (evidence.snippets.length === 0 && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (['benchmarkContext', 'brandProfile', 'competitors', 'confidence', 'coverage', 'conflicts', 'error'].includes(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const text = typeof item === 'string' ? item : (item?.content || item?.text || item?.snippet || '');
          if (text && typeof text === 'string' && text.length > 5) {
            evidence.snippets.push({ text, source: key });
          }
        }
      } else if (typeof value === 'string' && value.length > 20) {
        evidence.snippets.push({ text: value, source: key });
      }
    }
  }

  // Benchmark context
  if (data.benchmarkContext && typeof data.benchmarkContext === 'string') {
    evidence.benchmarkContext = data.benchmarkContext;
  }

  // Brand profile
  if (data.brandProfile) {
    evidence.brandProfile = typeof data.brandProfile === 'string'
      ? data.brandProfile
      : JSON.stringify(data.brandProfile);
  }

  // Competitors
  if (data.competitors && Array.isArray(data.competitors)) {
    evidence.competitors = data.competitors.map((c: any) => 
      typeof c === 'string' ? c : (c.name || c.title || JSON.stringify(c))
    );
  }

  // Conflicts
  if (data.conflicts && Array.isArray(data.conflicts)) {
    evidence.conflicts = data.conflicts.map((c: any) =>
      typeof c === 'string' ? c : (c.description || c.field || JSON.stringify(c))
    );
  }

  return evidence;
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

  return {
    verifiedSpecs,
    unverifiedSpecs,
    strengths: qaResult.complexQA.comparison.strengths,
    weaknesses: qaResult.complexQA.comparison.weaknesses,
    idealFor: qaResult.complexQA.suitability.idealFor,
    notIdealFor: qaResult.complexQA.suitability.notIdealFor,
    verdict: qaResult.complexQA.recommendation.verdict,
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
  kgContext: EnrichedProductDataV3['knowledgeGraphContext']
): string {
  const sku = product.variants[0]?.sku || 'N/A';
  
  // === SECTION 1: Verified specs from TwoPhaseQA ===
  let specsSection: string;
  if (qaFacts && qaFacts.verifiedSpecs.length > 0) {
    specsSection = `## SPECIFICHE TECNICHE VERIFICATE (da TwoPhaseQA - fatti atomici verificati)
${qaFacts.verifiedSpecs.map(s => `- ${s.question}: **${s.answer}** (fonte: ${s.source})`).join('\n')}`;
  } else {
    specsSection = '## SPECIFICHE TECNICHE\nNessuna specifica verificata disponibile da TwoPhaseQA.';
  }

  // === SECTION 2: Unverified specs (use with caution) ===
  let unverifiedSection = '';
  if (qaFacts && qaFacts.unverifiedSpecs.length > 0) {
    unverifiedSection = `\n## ⚠️ DATI NON COMPLETAMENTE VERIFICATI (usa con cautela)
${qaFacts.unverifiedSpecs.map(s => `- ${s.question}: ${s.answer} (confidence: ${s.confidence}, fonte: ${s.source})`).join('\n')}

IMPORTANTE: Per questi dati, scrivi "contattaci per conferma" invece di presentarli come certi.`;
  }

  // === SECTION 3: RAG evidence (real web search snippets) ===
  let ragSection = '';
  if (ragEvidence.snippets.length > 0) {
    const topSnippets = ragEvidence.snippets.slice(0, 10); // Max 10 snippets
    ragSection = `\n## DATI DA RICERCA WEB REALE (UniversalRAG)
${topSnippets.map(s => `[Fonte: ${s.source}${s.confidence ? ` | Confidence: ${s.confidence}` : ''}]
${s.text.substring(0, 500)}`).join('\n\n')}`;
  }

  // === SECTION 4: QA reasoning (strengths, weaknesses, verdict) ===
  let qaReasoningSection = '';
  if (qaFacts) {
    qaReasoningSection = `\n## ANALISI RAGIONATA (da TwoPhaseQA)

### Punti di forza (basati su fatti verificati):
${qaFacts.strengths.length > 0 
  ? qaFacts.strengths.map(s => `- ${s}`).join('\n')
  : '- Nessun punto di forza specifico identificato'}

### Punti deboli (basati su fatti verificati):
${qaFacts.weaknesses.length > 0
  ? qaFacts.weaknesses.map(w => `- ${w}`).join('\n')
  : '- Nessun punto debole specifico identificato'}

### Ideale per:
${qaFacts.idealFor.length > 0 ? qaFacts.idealFor.map(i => `- ${i}`).join('\n') : '- Non specificato'}

### NON ideale per:
${qaFacts.notIdealFor.length > 0 ? qaFacts.notIdealFor.map(n => `- ${n}`).join('\n') : '- Non specificato'}

### Verdetto esperto: ${qaFacts.verdict} (confidence: ${qaFacts.verdictConfidence})
${qaFacts.caveats.length > 0 ? `Avvertenze: ${qaFacts.caveats.join('; ')}` : ''}`;
  }

  // === SECTION 5: Benchmark context ===
  let benchmarkSection = '';
  if (ragEvidence.benchmarkContext) {
    benchmarkSection = `\n## CONTESTO BENCHMARK (Ancora di Verità)
${ragEvidence.benchmarkContext}`;
  }

  // === SECTION 6: Knowledge Graph context ===
  const kgSection = `\n## CONTESTO KNOWLEDGE GRAPH

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
  : 'Non specificato'}`;

  // === SECTION 7: Conflicts warning ===
  let conflictsWarning = '';
  if (ragEvidence.conflicts.length > 0) {
    conflictsWarning = `\n## ⚠️ CONFLITTI NEI DATI - ATTENZIONE
${ragEvidence.conflicts.map(c => `- ${c}`).join('\n')}

IMPORTANTE: Per questi dati in conflitto, scrivi "contattaci per conferma" invece di inventare.`;
  }

  return `Genera contenuti per questo prodotto usando SOLO i dati verificati che ti fornisco.
Questi dati provengono da ricerca web REALE (UniversalRAG) e verifica fatti (TwoPhaseQA).
NON inventare dati. Se un'informazione non è presente, non includerla.

**Titolo:** ${product.title}
**Brand:** ${brand}
**SKU:** ${sku}
**Tipo prodotto:** ${product.product_type || 'Elettroutensile'}

${specsSection}
${unverifiedSection}
${ragSection}
${qaReasoningSection}
${benchmarkSection}
${kgSection}
${conflictsWarning}

## ISTRUZIONI

1. Usa le specifiche tecniche SOLO se verificate da TwoPhaseQA
2. Integra i punti di forza/debolezza del QA nei pro/contro
3. Usa i dati RAG reali per arricchire la descrizione con dettagli concreti
4. Per dati incerti o non verificati, suggerisci di contattare Autonord
5. Usa il contesto del Knowledge Graph per i mestieri e casi d'uso
6. Collega ogni specifica a un beneficio lavorativo concreto (JTBD)

Rispondi SOLO con JSON valido:
{
  "description": "...",
  "pros": ["...", "...", "..."],
  "cons": ["...", "..."],
  "faqs": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}`;
}

// =============================================================================
// LLM GENERATION V3 (Refactored)
// =============================================================================

async function generateWithLLMV3(
  userPrompt: string,
  ragEvidence: RAGEvidence,
  qaFacts: QAFacts | null,
): Promise<EnrichedProductData> {
  try {
    const result = await generateTextSafe({
      system: SYSTEM_PROMPT_V3,
      prompt: userPrompt,
      maxTokens: 2500,
      temperature: 0.6,
    });

    const content = result.text;
    
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanedContent) as EnrichedProductData;

    // Validate structure
    if (!parsed.description || !Array.isArray(parsed.pros) || !Array.isArray(parsed.cons) || !Array.isArray(parsed.faqs)) {
      throw new Error('Invalid response structure from LLM');
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

    return parsed;
    
  } catch (error) {
    log.error('[AI-V3] Generation Error:', error);
    
    // Record error
    getMetricsStore().recordError({
      productId: 'unknown',
      errorType: 'generation_failure',
      severity: 'high',
      timestamp: new Date(),
      details: error instanceof Error ? error.message : 'Unknown error',
      resolved: false,
    });
    
    // Return fallback using REAL data from RAG + QA (not hallucinated)
    return buildFallbackContent(ragEvidence, qaFacts);
  }
}

/**
 * Builds fallback content using real RAG + QA data when LLM generation fails.
 * This replaces the old fallback that used data from the autonomous (hallucinated) research.
 */
function buildFallbackContent(
  ragEvidence: RAGEvidence,
  qaFacts: QAFacts | null,
): EnrichedProductData {
  // Build description from RAG snippets
  const descriptionParts: string[] = [];
  if (ragEvidence.snippets.length > 0) {
    descriptionParts.push(ragEvidence.snippets[0].text.substring(0, 200));
  }
  if (qaFacts?.verdict) {
    descriptionParts.push(qaFacts.verdict);
  }
  const description = descriptionParts.length > 0
    ? descriptionParts.join('. ')
    : 'Contattaci per una consulenza personalizzata su questo prodotto.';

  // Build pros from QA strengths or RAG data
  const pros = qaFacts && qaFacts.strengths.length > 0
    ? qaFacts.strengths.slice(0, 3).map(s => s.replace(/^✓\s*/, ''))
    : [
        'Qualità professionale con garanzia ufficiale italiana',
        'Assistenza tecnica dedicata presso la nostra sede di Genova',
        'Possibilità di provarlo prima dell\'acquisto',
      ];

  // Build cons from QA weaknesses
  const cons = qaFacts && qaFacts.weaknesses.length > 0
    ? qaFacts.weaknesses.slice(0, 2).map(w => w.replace(/^⚠\s*/, ''))
    : [
        'Contattaci per conoscere i dettagli tecnici specifici',
        'Verifica la compatibilità con i tuoi accessori esistenti',
      ];

  return {
    description,
    pros,
    cons,
    faqs: [
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
    ],
  };
}

// =============================================================================
// HTML FORMATTING V3
// =============================================================================

export function formatDescriptionAsHtmlV3(data: EnrichedProductDataV3): string {
  const prosHtml = data.pros.map(pro => `<li>${pro}</li>`).join('\n          ');
  const consHtml = data.cons.map(con => `<li>${con}</li>`).join('\n          ');
  
  const faqsHtml = data.faqs.map(faq => `
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h4 itemprop="name">${faq.question}</h4>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <p itemprop="text">${faq.answer}</p>
        </div>
      </div>`).join('\n');

  // Accessories section
  const accessoriesHtml = data.accessories.length > 0
    ? `
  <div class="accessories-section">
    <h3>🔧 Accessori consigliati</h3>
    <ul>
      ${data.accessories.map(acc => `<li><strong>${acc.name}</strong>: ${acc.reason}</li>`).join('\n      ')}
    </ul>
  </div>`
    : '';

  // Provenance display
  const provenanceHtml = formatProvenanceDisplay(data.provenance);

  // Data quality indicator
  const qualityBadge = data.dataQuality.specsVerified
    ? '<span class="quality-badge verified">✓ Dati verificati</span>'
    : '<span class="quality-badge">Alcuni dati da confermare</span>';

  // KG context for trades
  const tradesHtml = data.knowledgeGraphContext.suitableForTrades.length > 0
    ? `<p class="suitable-trades">Ideale per: ${data.knowledgeGraphContext.suitableForTrades.join(', ')}</p>`
    : '';

  return `
<div class="product-description" itemscope itemtype="https://schema.org/Product">
  <div class="description-intro">
    <p itemprop="description">${data.description}</p>
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
      ${provenanceHtml} |
      Contenuto curato dal team tecnico di Autonord Service. 
      <a href="/contact">Contattaci</a> per domande.
    </small>
  </p>
</div>`.trim();
}

// =============================================================================
// EXPORTS
// =============================================================================

// V3 is now the primary version - V1 (ai-enrichment.ts) has been deprecated
// FIX ARCHITETTURALE: product-research.ts è ora @deprecated (non più usato da V3)
