/**
 * AI Content Generation for Product Enrichment
 * Uses Anthropic Claude Opus for premium-quality TAYA-style content
 * 
 * Quality principles:
 * - Human-like, conversational Italian
 * - Technical accuracy without jargon overload
 * - Honest, balanced perspective (TAYA methodology)
 * - Natural variability to avoid robotic patterns
 */

import Anthropic from '@anthropic-ai/sdk';
import { EnrichedProductData, ShopifyProductWebhookPayload } from './webhook-types';

// Lazy initialization - only create client when needed
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

// Premium system prompt with detailed persona and anti-robot instructions
const SYSTEM_PROMPT = `Sei Marco, un tecnico commerciale di Autonord Service a Genova con 18 anni di esperienza nel settore elettroutensili professionali. Hai lavorato in cantiere come elettricista per 6 anni prima di passare alla vendita, quindi conosci sia la teoria che la pratica.

## LA TUA VOCE

Scrivi come parli ai clienti in negozio: diretto, competente, ma mai arrogante. Usi un italiano pulito e professionale, ma non accademico. Ogni tanto ti scappa un'espressione colorita o un riferimento al lavoro in cantiere.

## COSA TI RENDE DIVERSO

1. **Onestà brutale**: Se un prodotto ha difetti, li dici. Se costa troppo per quello che offre, lo ammetti. I clienti tornano da te perché si fidano.

2. **Esperienza pratica**: Non ripeti le specifiche tecniche come un robot. Traduci i numeri in situazioni reali: "135 Nm di coppia significa che butti giù un muro di mattoni pieni senza sudare".

3. **Conoscenza del territorio**: Sai che a Genova i cantieri sono spesso in spazi stretti, che l'umidità del mare stressa gli utensili, che gli elettricisti genovesi sono esigenti.

## COME SCRIVI

- **MAI** iniziare con "Questo prodotto..." o "Il [nome prodotto] è...". Inizia sempre dal PROBLEMA che risolve.
- **MAI** usare superlativi vuoti: "eccezionale", "straordinario", "il migliore". Se qualcosa è davvero il migliore, spiega PERCHÉ con dati.
- **MAI** elenchi puntati generici. Ogni punto deve essere specifico e utile.
- **SEMPRE** variare la struttura delle frasi. Alterna frasi brevi e incisive a spiegazioni più articolate.
- **SEMPRE** includere almeno un riferimento concreto (un mestiere specifico, una situazione reale, un confronto con la concorrenza).

## ESEMPI DI TONO

❌ SBAGLIATO (robotico):
"Questo trapano offre prestazioni eccezionali grazie al suo potente motore brushless. La batteria garantisce un'autonomia ottimale per lavori prolungati."

✅ GIUSTO (umano):
"Se passi la giornata a forare calcestruzzo armato e sei stanco di trapani che si arrendono a metà mattina, questo è quello che cercavi. Il motore brushless non è marketing: significa che dopo 200 fori sei ancora al 70% di batteria, mentre il tuo collega con il trapano a spazzole sta già cercando una presa."

## STRUTTURA DEI CONTENUTI

Per ogni prodotto genera:
1. **Descrizione** (150-200 parole): Parti dal problema, spiega come il prodotto lo risolve, concludi con per chi è (e per chi NO).
2. **3 PRO**: Vantaggi SPECIFICI e MISURABILI. Niente "ottima qualità costruttiva" - piuttosto "corpo in alluminio pressofuso che sopravvive a cadute da 2 metri (testato personalmente, purtroppo)".
3. **2 CONTRO**: Difetti REALI. Se non trovi difetti, sei tu che non stai guardando bene. Ogni prodotto ha compromessi.
4. **3 FAQ**: Domande che i clienti fanno DAVVERO in negozio, non quelle che vorresti ti facessero.`;

const USER_PROMPT_TEMPLATE = `Genera contenuti per questo prodotto:

**Titolo:** {title}
**Brand:** {brand}
**SKU:** {sku}
**Tipo prodotto:** {productType}
**Vendor originale:** {vendor}

Ricorda:
- Scrivi come Marco, non come un'AI
- Il cliente che legge è un professionista, non un hobbista
- Sii onesto sui difetti, costruisce fiducia
- Varia lo stile: non tutte le descrizioni devono avere la stessa struttura

Rispondi SOLO con JSON valido (niente markdown, niente commenti):
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

// Brand mapping for better context
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
  
  // If no mapping found, try to extract brand from vendor name
  // Remove common suffixes
  return vendor
    .replace(/\s*(SRL|SPA|GMBH|INC|LLC|LTD|ITALIA|ITALY)\s*/gi, '')
    .trim() || vendor;
}

export async function generateProductContent(
  product: ShopifyProductWebhookPayload
): Promise<EnrichedProductData> {
  const brand = normalizeBrand(product.vendor || 'Sconosciuto');
  
  const userPrompt = USER_PROMPT_TEMPLATE
    .replace('{title}', product.title)
    .replace('{brand}', brand)
    .replace('{sku}', product.variants[0]?.sku || 'N/A')
    .replace('{productType}', product.product_type || 'Elettroutensile')
    .replace('{vendor}', product.vendor || 'N/A');

  try {
    const anthropic = getAnthropicClient();
    
    // Use Claude Opus for highest quality
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 2000,
      temperature: 0.7, // Add some creativity/variability
      messages: [
        { 
          role: 'user', 
          content: `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}` 
        },
      ],
    });

    // Extract text content from Claude's response
    const textBlock = message.content.find(block => block.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (!content) {
      throw new Error('Empty response from Claude');
    }

    // Clean the response (remove potential markdown code blocks)
    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanedContent) as EnrichedProductData;

    // Validate the response structure
    if (!parsed.description || !Array.isArray(parsed.pros) || !Array.isArray(parsed.cons) || !Array.isArray(parsed.faqs)) {
      throw new Error('Invalid response structure from Claude');
    }

    // Quality check: ensure content doesn't start with robotic patterns
    const roboticStarts = [
      'questo prodotto',
      'il ' + product.title.toLowerCase().split(' ')[0],
      'questo ' + product.title.toLowerCase().split(' ')[0],
    ];
    
    const descLower = parsed.description.toLowerCase();
    for (const pattern of roboticStarts) {
      if (descLower.startsWith(pattern)) {
        console.warn(`[AI] Warning: Description starts with robotic pattern "${pattern}"`);
        // Could regenerate here, but for now just log
      }
    }

    return parsed;
  } catch (error) {
    console.error('AI Generation Error:', error);
    
    // Return fallback content if AI fails
    return {
      description: `${product.title} di ${normalizeBrand(product.vendor)}. Un utensile professionale pensato per chi lavora sul serio. Contattaci per una consulenza personalizzata: ti aiutiamo a capire se è quello giusto per le tue esigenze.`,
      pros: [
        'Qualità professionale con garanzia ufficiale italiana',
        'Assistenza tecnica dedicata presso la nostra sede di Genova',
        'Possibilità di provarlo prima dell\'acquisto su appuntamento',
      ],
      cons: [
        'Contattaci per conoscere i dettagli tecnici specifici',
        'Verifica la compatibilità con i tuoi accessori esistenti',
      ],
      faqs: [
        {
          question: 'Posso provarlo prima di acquistarlo?',
          answer: 'Certamente. Passa in negozio a Lungobisagno d\'Istria 34 e te lo facciamo vedere dal vivo. Se vuoi, portiamo anche qualche materiale per testarlo.',
        },
        {
          question: 'Che garanzia ha?',
          answer: 'Garanzia ufficiale italiana di 2 anni. Per alcuni brand offriamo estensioni di garanzia a condizioni vantaggiose.',
        },
        {
          question: 'Fate assistenza post-vendita?',
          answer: 'Sì, abbiamo un laboratorio interno per riparazioni e manutenzione. Per i brand principali siamo centro assistenza autorizzato.',
        },
      ],
    };
  }
}

/**
 * Format the description as HTML for Shopify body_html
 * Uses semantic HTML with Schema.org markup for SEO
 */
export function formatDescriptionAsHtml(data: EnrichedProductData): string {
  const prosHtml = data.pros.map(pro => `<li>${pro}</li>`).join('\n          ');
  const consHtml = data.cons.map(con => `<li>${con}</li>`).join('\n          ');
  
  const faqsHtml = data.faqs.map(faq => `
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h4 itemprop="name">${faq.question}</h4>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <p itemprop="text">${faq.answer}</p>
        </div>
      </div>`).join('\n');

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
  
  <div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
    <h3>❓ Domande frequenti</h3>
    ${faqsHtml}
  </div>
  
  <p class="content-note"><small>Contenuto curato dal team tecnico di Autonord Service. Hai domande? <a href="/contact">Contattaci</a>.</small></p>
</div>`.trim();
}
