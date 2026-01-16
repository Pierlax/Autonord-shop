/**
 * No-Retrieval Detection - UniversalRAG Implementation
 * 
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora 
 * of Diverse Modalities and Granularities" (KAIST, 2026)
 * 
 * Some queries don't need external retrieval because:
 * 1. The answer is general knowledge (e.g., "What is a brushless motor?")
 * 2. The LLM's parametric knowledge is sufficient
 * 3. The query is about concepts, not specific product data
 * 
 * Detecting these cases saves API costs and reduces latency.
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

export type RetrievalNeed = 
  | 'required'           // Must retrieve external data
  | 'optional'           // Could help but not necessary
  | 'unnecessary';       // Parametric knowledge sufficient

export type KnowledgeType = 
  | 'product_specific'   // Specific to this product (needs retrieval)
  | 'brand_general'      // General brand info (might need retrieval)
  | 'category_general'   // General category knowledge (often parametric)
  | 'domain_knowledge'   // Power tool domain knowledge (parametric)
  | 'common_knowledge';  // General knowledge (parametric)

export interface RetrievalDecision {
  need: RetrievalNeed;
  knowledgeType: KnowledgeType;
  confidence: number;
  reasoning: string;
  suggestedApproach: 'full_retrieval' | 'light_retrieval' | 'parametric_only';
  estimatedCostSavings: number; // 0-1, percentage of retrieval cost saved
}

// Patterns that indicate parametric knowledge is sufficient
const PARAMETRIC_PATTERNS: { pattern: RegExp; knowledgeType: KnowledgeType }[] = [
  // Domain knowledge - general power tool concepts
  { pattern: /cos'è (un |una |il |la )?(motore brushless|batteria al litio|coppia|rpm|impatto|percussione)/i, knowledgeType: 'domain_knowledge' },
  { pattern: /what is (a |an )?(brushless motor|lithium battery|torque|impact driver)/i, knowledgeType: 'domain_knowledge' },
  { pattern: /differenza tra (brushless|brushed|18v|20v|litio|nicd)/i, knowledgeType: 'domain_knowledge' },
  { pattern: /come funziona (un |una )?(avvitatore|trapano|smerigliatrice|seghetto)/i, knowledgeType: 'domain_knowledge' },
  { pattern: /vantaggi (del |della |di )?(brushless|litio|cordless|senza filo)/i, knowledgeType: 'domain_knowledge' },
  
  // Category general knowledge
  { pattern: /tipi di (avvitatori|trapani|seghe|smerigliatrici)/i, knowledgeType: 'category_general' },
  { pattern: /a cosa serve (un |una )?(avvitatore|trapano|smerigliatrice)/i, knowledgeType: 'category_general' },
  { pattern: /quando usare (un |una )?(avvitatore|trapano|smerigliatrice)/i, knowledgeType: 'category_general' },
  
  // Common knowledge
  { pattern: /sicurezza (sul lavoro|elettroutensili|dpi)/i, knowledgeType: 'common_knowledge' },
  { pattern: /manutenzione (base|generale|ordinaria)/i, knowledgeType: 'common_knowledge' },
];

// Patterns that definitely require retrieval
const RETRIEVAL_REQUIRED_PATTERNS: RegExp[] = [
  // Specific product data
  /prezzo|costo|€|euro|\d+\s*(v|volt|ah|wh|nm|rpm|kg|mm)/i,
  /specifiche|specifications|datasheet|scheda tecnica/i,
  /recensioni|reviews|opinioni|feedback/i,
  /disponibilità|stock|spedizione|consegna/i,
  
  // Product-specific queries
  /questo (prodotto|modello|articolo)/i,
  /il (milwaukee|makita|dewalt|bosch|hilti|metabo|festool|hikoki) [a-z0-9\-]+/i,
  
  // Comparison with specific products
  /vs|versus|confronto tra|meglio tra/i,
  
  // Specific SKU or model numbers
  /[A-Z]{2,}\d{3,}|M\d{2}|LXT|XGT|FUEL|ONE\+/i,
];

/**
 * Rule-based retrieval need detection
 */
export function detectRetrievalNeedRules(query: string): RetrievalDecision {
  const queryLower = query.toLowerCase();
  
  // Check if retrieval is definitely required
  for (const pattern of RETRIEVAL_REQUIRED_PATTERNS) {
    if (pattern.test(query)) {
      return {
        need: 'required',
        knowledgeType: 'product_specific',
        confidence: 0.9,
        reasoning: `Query contains product-specific pattern: ${pattern.source}`,
        suggestedApproach: 'full_retrieval',
        estimatedCostSavings: 0,
      };
    }
  }
  
  // Check if parametric knowledge is sufficient
  for (const { pattern, knowledgeType } of PARAMETRIC_PATTERNS) {
    if (pattern.test(queryLower)) {
      return {
        need: 'unnecessary',
        knowledgeType,
        confidence: 0.85,
        reasoning: `Query matches parametric knowledge pattern: ${pattern.source}`,
        suggestedApproach: 'parametric_only',
        estimatedCostSavings: 0.9,
      };
    }
  }
  
  // Check query characteristics
  const hasNumbers = /\d/.test(query);
  const hasBrandName = /(milwaukee|makita|dewalt|bosch|hilti|metabo|festool|hikoki|einhell|stanley)/i.test(query);
  const hasModelNumber = /[A-Z]{1,3}\d{2,}|M\d{2}|LXT|XGT/i.test(query);
  const isQuestionAboutConcept = /^(cos'è|cosa sono|come|perché|quando|quale tipo)/i.test(queryLower);
  
  if (hasModelNumber || (hasBrandName && hasNumbers)) {
    return {
      need: 'required',
      knowledgeType: 'product_specific',
      confidence: 0.85,
      reasoning: 'Query contains brand/model identifiers',
      suggestedApproach: 'full_retrieval',
      estimatedCostSavings: 0,
    };
  }
  
  if (isQuestionAboutConcept && !hasBrandName && !hasNumbers) {
    return {
      need: 'optional',
      knowledgeType: 'category_general',
      confidence: 0.7,
      reasoning: 'Conceptual question without specific product reference',
      suggestedApproach: 'light_retrieval',
      estimatedCostSavings: 0.5,
    };
  }
  
  // Default: require retrieval for safety
  return {
    need: 'required',
    knowledgeType: 'product_specific',
    confidence: 0.6,
    reasoning: 'Default to retrieval for product-related queries',
    suggestedApproach: 'full_retrieval',
    estimatedCostSavings: 0,
  };
}

/**
 * LLM-based retrieval need detection
 */
export async function detectRetrievalNeedLLM(
  query: string,
  productContext?: { title: string; vendor: string }
): Promise<RetrievalDecision> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `Sei un classificatore per un sistema RAG di e-commerce elettroutensili.
Determina se la query richiede retrieval esterno o se la conoscenza parametrica del modello è sufficiente.

TIPI DI CONOSCENZA:
- product_specific: Dati specifici del prodotto (prezzo, specifiche esatte, disponibilità) → RICHIEDE retrieval
- brand_general: Info generali sul brand → POTREBBE richiedere retrieval
- category_general: Conoscenza generale sulla categoria → SPESSO parametrica
- domain_knowledge: Concetti del dominio elettroutensili → PARAMETRICA
- common_knowledge: Conoscenza generale → PARAMETRICA

ESEMPI:
- "Quanto costa il Milwaukee M18 FUEL?" → product_specific, required
- "Cos'è un motore brushless?" → domain_knowledge, unnecessary
- "Quali sono i vantaggi delle batterie al litio?" → domain_knowledge, unnecessary
- "Specifiche del Makita DHP486?" → product_specific, required
- "Come scegliere un trapano?" → category_general, optional

Rispondi SOLO con JSON:
{
  "need": "required|optional|unnecessary",
  "knowledgeType": "product_specific|brand_general|category_general|domain_knowledge|common_knowledge",
  "confidence": 0.0-1.0,
  "reasoning": "Breve spiegazione"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        { role: 'user', content: `Query: "${query}"${productContext ? `\nContesto: ${productContext.title} (${productContext.vendor})` : ''}` }
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const suggestedApproach = parsed.need === 'required' ? 'full_retrieval' 
      : parsed.need === 'optional' ? 'light_retrieval' 
      : 'parametric_only';
    
    const estimatedCostSavings = parsed.need === 'unnecessary' ? 0.9 
      : parsed.need === 'optional' ? 0.5 
      : 0;
    
    return {
      need: parsed.need as RetrievalNeed,
      knowledgeType: parsed.knowledgeType as KnowledgeType,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      suggestedApproach,
      estimatedCostSavings,
    };
  } catch (error) {
    log.error('[NoRetrievalDetector] LLM detection failed:', error);
    return detectRetrievalNeedRules(query);
  }
}

/**
 * Generate parametric response for queries that don't need retrieval
 */
export async function generateParametricResponse(
  query: string,
  knowledgeType: KnowledgeType
): Promise<{ response: string; confidence: number }> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompts: Record<KnowledgeType, string> = {
    domain_knowledge: `Sei un esperto di elettroutensili professionali. Rispondi alla domanda usando la tua conoscenza del dominio.
Sii preciso e tecnico ma accessibile. Se la domanda richiede dati specifici di un prodotto che non conosci, indicalo chiaramente.`,
    
    category_general: `Sei un consulente per elettroutensili. Fornisci informazioni generali sulla categoria di prodotti.
Evita di fare affermazioni su prodotti specifici senza dati verificati.`,
    
    brand_general: `Sei un esperto del settore elettroutensili. Fornisci informazioni generali sul brand menzionato.
Basati su conoscenze consolidate, evita speculazioni su prodotti specifici.`,
    
    common_knowledge: `Sei un assistente informativo. Rispondi alla domanda con informazioni generali accurate.`,
    
    product_specific: `Non dovresti rispondere a questa query senza retrieval. Indica che servono dati specifici.`,
  };

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        { role: 'user', content: query }
      ],
      system: systemPrompts[knowledgeType],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return {
      response: content.text,
      confidence: knowledgeType === 'domain_knowledge' ? 0.85 : 0.7,
    };
  } catch (error) {
    log.error('[NoRetrievalDetector] Parametric generation failed:', error);
    return {
      response: 'Non sono in grado di rispondere a questa domanda senza consultare fonti esterne.',
      confidence: 0,
    };
  }
}

/**
 * Main function: Decide retrieval strategy for product enrichment
 */
export async function decideRetrievalStrategy(
  productTitle: string,
  vendor: string,
  enrichmentType: 'specs' | 'description' | 'pros_cons' | 'faqs' | 'full'
): Promise<RetrievalDecision> {
  // For product enrichment, we almost always need retrieval
  // But we can optimize based on what we're enriching
  
  const enrichmentNeeds: Record<string, RetrievalDecision> = {
    specs: {
      need: 'required',
      knowledgeType: 'product_specific',
      confidence: 0.95,
      reasoning: 'Technical specifications require verified external data',
      suggestedApproach: 'full_retrieval',
      estimatedCostSavings: 0,
    },
    description: {
      need: 'required',
      knowledgeType: 'product_specific',
      confidence: 0.9,
      reasoning: 'Product descriptions need specific features and use cases',
      suggestedApproach: 'full_retrieval',
      estimatedCostSavings: 0,
    },
    pros_cons: {
      need: 'required',
      knowledgeType: 'product_specific',
      confidence: 0.85,
      reasoning: 'Pros/cons should be based on real user feedback',
      suggestedApproach: 'full_retrieval',
      estimatedCostSavings: 0,
    },
    faqs: {
      need: 'optional',
      knowledgeType: 'category_general',
      confidence: 0.7,
      reasoning: 'FAQs can mix product-specific and general knowledge',
      suggestedApproach: 'light_retrieval',
      estimatedCostSavings: 0.3,
    },
    full: {
      need: 'required',
      knowledgeType: 'product_specific',
      confidence: 0.95,
      reasoning: 'Full enrichment requires comprehensive external data',
      suggestedApproach: 'full_retrieval',
      estimatedCostSavings: 0,
    },
  };
  
  return enrichmentNeeds[enrichmentType] || enrichmentNeeds.full;
}

/**
 * Check if a specific field can use cached/parametric knowledge
 */
export function canUseCachedKnowledge(
  field: string,
  vendor: string,
  productType: string
): boolean {
  // Brand-specific knowledge that's stable
  const brandKnowledge: Record<string, string[]> = {
    milwaukee: ['M18 battery system', 'FUEL technology', 'ONE-KEY connectivity', 'REDLITHIUM batteries'],
    makita: ['LXT battery system', 'XGT 40V system', 'Star Protection', 'AVT technology'],
    dewalt: ['20V MAX system', 'FLEXVOLT technology', 'Tool Connect', 'POWERSTACK batteries'],
    bosch: ['18V system', 'Connected tools', 'KickBack Control', 'Electronic Cell Protection'],
    hilti: ['Nuron battery platform', 'Active Torque Control', 'Dust removal systems'],
  };
  
  const vendorLower = vendor.toLowerCase();
  
  // If asking about brand technology, we can use parametric knowledge
  if (brandKnowledge[vendorLower]) {
    const brandFeatures = brandKnowledge[vendorLower];
    if (brandFeatures.some(feature => field.toLowerCase().includes(feature.toLowerCase()))) {
      return true;
    }
  }
  
  // General category knowledge
  const categoryKnowledge = [
    'brushless motor benefits',
    'lithium battery advantages',
    'cordless vs corded',
    'impact driver vs drill',
  ];
  
  if (categoryKnowledge.some(topic => field.toLowerCase().includes(topic))) {
    return true;
  }
  
  return false;
}

/**
 * Estimate cost savings from no-retrieval detection
 */
export function estimateCostSavings(
  decisions: RetrievalDecision[],
  avgRetrievalCost: number = 0.05 // $0.05 per retrieval call
): { totalSavings: number; percentageSaved: number; decisionsOptimized: number } {
  let totalSavings = 0;
  let decisionsOptimized = 0;
  
  for (const decision of decisions) {
    if (decision.need !== 'required') {
      totalSavings += avgRetrievalCost * decision.estimatedCostSavings;
      decisionsOptimized++;
    }
  }
  
  const percentageSaved = decisions.length > 0 
    ? (decisionsOptimized / decisions.length) * 100 
    : 0;
  
  return {
    totalSavings,
    percentageSaved,
    decisionsOptimized,
  };
}
