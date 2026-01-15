/**
 * AI Content Generation for Product Enrichment V2
 * 
 * Enhanced version with:
 * - Source hierarchy for technical specs
 * - Balanced review analysis from Amazon/Reddit
 * - Accessory recommendations from competitor analysis
 * - Safety checks for conflicting data
 */

import Anthropic from '@anthropic-ai/sdk';
import { EnrichedProductData, ShopifyProductWebhookPayload } from './webhook-types';
import { researchProduct, generateSafetyLog, ProductResearchResult } from './product-research';
import { getBrandConfig } from './product-sources';

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
// ENHANCED SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT_V2 = `Sei Marco, un tecnico commerciale di Autonord Service a Genova con 18 anni di esperienza nel settore elettroutensili professionali.

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
// ENHANCED CONTENT GENERATION
// =============================================================================

export interface EnrichedProductDataV2 extends EnrichedProductData {
  accessories: { name: string; reason: string }[];
  safetyLog: string;
  sourcesUsed: string[];
  dataQuality: {
    specsVerified: boolean;
    conflictsFound: number;
    manualCheckRequired: string[];
  };
}

/**
 * Generate product content with source hierarchy and research
 */
export async function generateProductContentV2(
  product: ShopifyProductWebhookPayload
): Promise<EnrichedProductDataV2> {
  const brand = normalizeBrand(product.vendor || 'Sconosciuto');
  const sku = product.variants[0]?.sku || 'N/A';
  
  console.log(`[AI-V2] Starting enhanced enrichment for: ${product.title}`);
  
  // Step 1: Research product from multiple sources
  console.log('[AI-V2] Step 1: Researching product...');
  const research = await researchProduct(
    product.title,
    brand,
    sku
  );
  
  // Step 2: Generate safety log
  const safetyLog = generateSafetyLog(research);
  console.log('[AI-V2] Safety log generated');
  
  // Step 3: Build enhanced prompt with research data
  const userPrompt = buildEnhancedPrompt(product, brand, research);
  
  // Step 4: Generate content with Claude
  console.log('[AI-V2] Step 4: Generating content with Claude...');
  const content = await generateWithClaude(userPrompt, research);
  
  // Step 5: Enrich with accessories
  const accessories = research.accessories.map(acc => ({
    name: acc.name,
    reason: acc.reason,
  }));
  
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
  };
}

/**
 * Build enhanced prompt with research data
 */
function buildEnhancedPrompt(
  product: ShopifyProductWebhookPayload,
  brand: string,
  research: ProductResearchResult
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

${conflictsWarning}

## ISTRUZIONI

1. Usa le specifiche tecniche SOLO se verificate
2. Integra il feedback reale nei pro/contro
3. Se un problema è segnalato da più utenti, mettilo nei CONTRO
4. Per dati incerti, suggerisci di contattare Autonord

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

/**
 * Generate content using Claude with research context
 */
async function generateWithClaude(
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
          content: `${SYSTEM_PROMPT_V2}\n\n---\n\n${userPrompt}` 
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
    console.error('[AI-V2] Generation Error:', error);
    
    // Return fallback with research data
    return {
      description: `${research.productName} di ${research.brand}. Un utensile professionale per chi lavora sul serio. ${research.realWorldFeedback.positives[0] || 'Contattaci per una consulenza personalizzata.'}`,
      pros: research.realWorldFeedback.positives.slice(0, 3).length > 0
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

/**
 * Format the description as HTML for Shopify body_html
 */
export function formatDescriptionAsHtmlV2(data: EnrichedProductDataV2): string {
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

  // Data quality indicator
  const qualityBadge = data.dataQuality.specsVerified
    ? '<span class="quality-badge verified">✓ Dati verificati</span>'
    : '<span class="quality-badge">Alcuni dati da confermare</span>';

  return `
<div class="product-description" itemscope itemtype="https://schema.org/Product">
  <div class="description-intro">
    <p itemprop="description">${data.description}</p>
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
}

// Re-export original functions for backward compatibility
export { generateProductContent, formatDescriptionAsHtml } from './ai-enrichment';
