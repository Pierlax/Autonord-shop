/**
 * AI Content Generation for Product Enrichment V3
 * 
 * Integrates RAG Enterprise Paper improvements:
 * - Provenance tracking for hallucination control
 * - Knowledge Graph for hybrid retrieval
 * - Business impact metrics
 * - Enhanced source attribution
 * 
 * Building on V2:
 * - Source hierarchy for technical specs
 * - Balanced review analysis from Amazon/Reddit
 * - Accessory recommendations from competitor analysis
 * - Safety checks for conflicting data
 */

import Anthropic from '@anthropic-ai/sdk';
import { EnrichedProductData, ShopifyProductWebhookPayload } from './webhook-types';
import { researchProduct, generateSafetyLog, ProductResearchResult } from './product-research';
import { getBrandConfig } from './product-sources';
import { fuseSources, FusionResult, SourceType } from './source-fusion';
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

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// =============================================================================
// ENHANCED SYSTEM PROMPT V3
// =============================================================================

const SYSTEM_PROMPT_V3 = `Sei Marco, un tecnico commerciale di Autonord Service a Genova con 18 anni di esperienza nel settore elettroutensili professionali.

## LA TUA VOCE

Scrivi come parli ai clienti in negozio: diretto, competente, ma mai arrogante. Usi un italiano pulito e professionale, ma non accademico.

## REGOLE FONDAMENTALI

1. **Onestà brutale**: Se un prodotto ha difetti, li dici. Se costa troppo per quello che offre, lo ammetti.

2. **Dati verificati**: Usa SOLO le specifiche tecniche che ti fornisco dalle fonti ufficiali. Se un dato è incerto, NON inventarlo.

3. **Feedback reale**: Integra le opinioni reali degli utenti (forum, recensioni) nei pro/contro. Se in 10 si lamentano del peso, scrivilo.

4. **Mai robotico**: 
   - MAI iniziare con "Questo prodotto..." 
   - MAI superlativi vuoti
   - SEMPRE partire dal problema che risolve

5. **Tracciabilità fonti**: Per ogni affermazione tecnica, indica mentalmente la fonte. Non inventare mai.

## STRUTTURA OUTPUT

Per ogni prodotto genera:
1. **Descrizione** (150-200 parole): Problema → Soluzione → Per chi è (e per chi NO)
2. **3 PRO**: Basati su specifiche VERIFICATE e feedback REALI
3. **2 CONTRO**: Problemi REALI trovati nelle recensioni/forum
4. **3 FAQ**: Domande che i clienti fanno DAVVERO
5. **Accessori consigliati**: Basati sull'analisi competitor

## ESEMPIO DI TONO

❌ SBAGLIATO:
"Questo trapano offre prestazioni eccezionali grazie al suo potente motore brushless."

✅ GIUSTO:
"Se passi la giornata a forare calcestruzzo armato e sei stanco di trapani che si arrendono a metà mattina, questo è quello che cercavi. Il motore brushless non è marketing: significa che dopo 200 fori sei ancora al 70% di batteria."`;

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
// PROVENANCE TRACKING
// =============================================================================

function trackProvenance(
  productId: string,
  productName: string,
  research: ProductResearchResult,
  fusionResult: FusionResult
): ContentProvenance {
  const tracker = new FactProvenanceTracker();

  // Register facts from technical specs
  for (const spec of research.technicalSpecs) {
    const sourceType = mapSourceToAttribution(spec.source);
    tracker.registerFact(
      spec.field,
      `${spec.value}${spec.unit ? ' ' + spec.unit : ''}`,
      {
        name: spec.source,
        type: sourceType,
        reliability: spec.priority / 10,
        extractedAt: new Date(),
      }
    );
  }

  // Register facts from fusion
  for (const fact of fusionResult.facts) {
    const sources: SourceAttribution[] = fact.sources.map(s => ({
      name: s.source,
      type: mapSourceTypeToAttribution(s.sourceType),
      reliability: s.reliability / 100,
      extractedAt: new Date(),
    }));

    if (sources.length > 0) {
      const factId = tracker.registerFact(
        fact.key,
        fact.value,
        sources[0],
        sources.slice(1)
      );

      if (fact.confidence >= 80) {
        tracker.verifyFact(factId, 'multi_source_agreement');
      }
    }
  }

  return generateContentProvenance(
    productId,
    productName,
    tracker.getAllFacts()
  );
}

function mapSourceToAttribution(source: string): SourceAttribution['type'] {
  const sourceLower = source.toLowerCase();
  if (sourceLower.includes('official') || sourceLower.includes('ufficiale')) {
    return 'official';
  }
  if (sourceLower.includes('manual') || sourceLower.includes('manuale')) {
    return 'manual';
  }
  if (sourceLower.includes('amazon') || sourceLower.includes('retailer')) {
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

function mapSourceTypeToAttribution(sourceType: SourceType): SourceAttribution['type'] {
  switch (sourceType) {
    case 'official':
      return 'official';
    case 'manual':
      return 'manual';
    case 'retailer_major':
    case 'retailer_niche':
      return 'retailer';
    case 'review_pro':
    case 'user_review':
      return 'review';
    case 'forum':
      return 'forum';
    default:
      return 'generated';
  }
}

// =============================================================================
// MAIN GENERATION FUNCTION V3
// =============================================================================

export async function generateProductContentV3(
  product: ShopifyProductWebhookPayload
): Promise<EnrichedProductDataV3> {
  const startTime = Date.now();
  const timings = {
    total: 0,
    research: 0,
    fusion: 0,
    llm: 0,
    verification: 0,
  };

  const brand = normalizeBrand(product.vendor || 'Sconosciuto');
  const sku = product.variants[0]?.sku || 'N/A';
  const productId = product.id?.toString() || 'unknown';
  
  console.log(`[AI-V3] Starting enhanced enrichment for: ${product.title}`);
  
  // Step 1: Research product from multiple sources
  console.log('[AI-V3] Step 1: Researching product...');
  const researchStart = Date.now();
  const research = await researchProduct(
    product.title,
    brand,
    sku
  );
  timings.research = Date.now() - researchStart;
  
  // Step 2: Enrich with Knowledge Graph
  console.log('[AI-V3] Step 2: Enriching with Knowledge Graph...');
  const kgContext = enrichWithKnowledgeGraph(product.title, brand);
  
  // Step 3: Fuse sources with weighted confidence
  console.log('[AI-V3] Step 3: Fusing sources...');
  const fusionStart = Date.now();
  const rawFacts = research.technicalSpecs.map(spec => ({
    key: spec.field,
    value: `${spec.value}${spec.unit ? ' ' + spec.unit : ''}`,
    source: spec.source,
    sourceType: 'official' as SourceType, // Default to official for specs
  }));
  const fusionResult = fuseSources(rawFacts);
  timings.fusion = Date.now() - fusionStart;
  
  // Step 4: Track provenance
  console.log('[AI-V3] Step 4: Tracking provenance...');
  const provenance = trackProvenance(productId, product.title, research, fusionResult);
  
  // Step 5: Generate safety log
  const safetyLog = generateSafetyLog(research);
  console.log('[AI-V3] Safety log generated');
  
  // Step 6: Build enhanced prompt with KG context
  const userPrompt = buildEnhancedPromptV3(product, brand, research, kgContext);
  
  // Step 7: Generate content with Claude
  console.log('[AI-V3] Step 7: Generating content with Claude...');
  const llmStart = Date.now();
  const content = await generateWithClaudeV3(userPrompt, research);
  timings.llm = Date.now() - llmStart;
  
  // Step 8: Verification (placeholder for now)
  const verificationStart = Date.now();
  // TODO: Add verification step
  timings.verification = Date.now() - verificationStart;
  
  // Step 9: Enrich with accessories
  const accessories = research.accessories.map(acc => ({
    name: acc.name,
    reason: acc.reason,
  }));
  
  // Step 10: Calculate total time and record metrics
  timings.total = Date.now() - startTime;
  
  const metrics = createGenerationMetrics(
    productId,
    product.title,
    timings,
    {
      confidence: provenance.overallConfidence,
      sources: research.sourcesUsed.length,
      conflicts: research.conflicts.length,
      resolved: research.conflicts.filter(c => !c.requiresManualCheck).length,
      manualChecks: research.manualCheckRequired.length,
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
  
  console.log(`[AI-V3] Generation complete in ${timings.total}ms`);
  console.log(`[AI-V3] Provenance: ${provenance.overallConfidence}% confidence, ${provenance.warnings.length} warnings`);
  
  return {
    ...content,
    accessories,
    safetyLog,
    sourcesUsed: research.sourcesUsed.map(s => s.name),
    dataQuality: {
      specsVerified: research.conflicts.filter(c => c.requiresManualCheck).length === 0,
      conflictsFound: research.conflicts.length,
      manualCheckRequired: research.manualCheckRequired,
    },
    provenance,
    knowledgeGraphContext: kgContext,
    metrics,
  };
}

// =============================================================================
// PROMPT BUILDING V3
// =============================================================================

function buildEnhancedPromptV3(
  product: ShopifyProductWebhookPayload,
  brand: string,
  research: ProductResearchResult,
  kgContext: EnrichedProductDataV3['knowledgeGraphContext']
): string {
  const sku = product.variants[0]?.sku || 'N/A';
  
  // Format technical specs
  const specsSection = research.technicalSpecs.length > 0
    ? `## SPECIFICHE TECNICHE VERIFICATE (da fonti ufficiali)
${research.technicalSpecs.map(s => `- ${s.field}: ${s.value}${s.unit ? ' ' + s.unit : ''} (fonte: ${s.source})`).join('\n')}`
    : '## SPECIFICHE TECNICHE\nNon disponibili da fonti verificate.';
  
  // Format real-world feedback
  const feedbackSection = `## FEEDBACK REALE DAGLI UTENTI

### Punti positivi (da recensioni):
${research.realWorldFeedback.positives.length > 0 
  ? research.realWorldFeedback.positives.map(p => `- ${p}`).join('\n')
  : '- Nessun feedback positivo specifico trovato'}

### Problemi segnalati (da forum/recensioni 3-4 stelle):
${research.realWorldFeedback.negatives.length > 0
  ? research.realWorldFeedback.negatives.map(n => `- ${n}`).join('\n')
  : '- Nessun problema specifico segnalato'}

### Problemi ricorrenti:
${research.realWorldFeedback.commonProblems.length > 0
  ? research.realWorldFeedback.commonProblems.map(p => `- ${p}`).join('\n')
  : '- Nessun problema ricorrente identificato'}

### Citazioni reali:
${research.realWorldFeedback.quotes.slice(0, 3).map(q => 
  `> "${q.text}" - ${q.source}${q.rating ? ` (${q.rating}★)` : ''}`
).join('\n\n')}`;

  // Knowledge Graph context section
  const kgSection = `## CONTESTO KNOWLEDGE GRAPH

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

  // Format data conflicts warning
  const conflictsWarning = research.manualCheckRequired.length > 0
    ? `## ⚠️ DATI INCERTI - NON USARE
${research.manualCheckRequired.map(c => `- ${c}`).join('\n')}

IMPORTANTE: Per questi dati, scrivi "contattaci per conferma" invece di inventare.`
    : '';

  return `Genera contenuti per questo prodotto usando SOLO i dati verificati che ti fornisco.

**Titolo:** ${product.title}
**Brand:** ${brand}
**SKU:** ${sku}
**Tipo prodotto:** ${product.product_type || 'Elettroutensile'}

${specsSection}

${feedbackSection}

${kgSection}

${conflictsWarning}

## ISTRUZIONI

1. Usa le specifiche tecniche SOLO se verificate
2. Integra il feedback reale nei pro/contro
3. Se un problema è segnalato da più utenti, mettilo nei CONTRO
4. Per dati incerti, suggerisci di contattare Autonord
5. Usa il contesto del Knowledge Graph per arricchire la descrizione (mestieri, casi d'uso)

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
// CLAUDE GENERATION V3
// =============================================================================

async function generateWithClaudeV3(
  userPrompt: string,
  research: ProductResearchResult
): Promise<EnrichedProductData> {
  try {
    const anthropic = getAnthropicClient();
    
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 2500,
      temperature: 0.6,
      messages: [
        { 
          role: 'user', 
          content: `${SYSTEM_PROMPT_V3}\n\n---\n\n${userPrompt}` 
        },
      ],
    });

    const textBlock = message.content.find(block => block.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (!content) {
      throw new Error('Empty response from Claude');
    }

    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanedContent) as EnrichedProductData;

    // Validate structure
    if (!parsed.description || !Array.isArray(parsed.pros) || !Array.isArray(parsed.cons) || !Array.isArray(parsed.faqs)) {
      throw new Error('Invalid response structure from Claude');
    }

    // Enhance cons with real problems if not already included
    const realProblems = research.realWorldFeedback.commonProblems;
    if (realProblems.length > 0 && parsed.cons.length < 3) {
      for (const problem of realProblems) {
        if (!parsed.cons.some(c => c.toLowerCase().includes(problem.toLowerCase().slice(0, 20)))) {
          parsed.cons.push(problem);
          if (parsed.cons.length >= 3) break;
        }
      }
    }

    return parsed;
    
  } catch (error) {
    console.error('[AI-V3] Generation Error:', error);
    
    // Record error
    getMetricsStore().recordError({
      productId: 'unknown',
      errorType: 'generation_failure',
      severity: 'high',
      timestamp: new Date(),
      details: error instanceof Error ? error.message : 'Unknown error',
      resolved: false,
    });
    
    // Return fallback with research data
    return {
      description: `${research.productName} di ${research.brand}. Un utensile professionale per chi lavora sul serio. ${research.realWorldFeedback.positives[0] || 'Contattaci per una consulenza personalizzata.'}`,
      pros: research.realWorldFeedback.positives.length > 0
        ? research.realWorldFeedback.positives.slice(0, 3)
        : [
            'Qualità professionale con garanzia ufficiale italiana',
            'Assistenza tecnica dedicata presso la nostra sede di Genova',
            'Possibilità di provarlo prima dell\'acquisto',
          ],
      cons: research.realWorldFeedback.negatives.slice(0, 2).length > 0
        ? research.realWorldFeedback.negatives.slice(0, 2)
        : [
            'Contattaci per conoscere i dettagli tecnici specifici',
            'Verifica la compatibilità con i tuoi accessori esistenti',
          ],
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

// Re-export V2 functions for backward compatibility
export { generateProductContentV2, formatDescriptionAsHtmlV2 } from './ai-enrichment-v2';
export { generateProductContent, formatDescriptionAsHtml } from './ai-enrichment';
