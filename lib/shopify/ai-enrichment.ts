/**
 * AI Content Generation for Product Enrichment
 * Uses Anthropic Claude to generate TAYA-style product descriptions
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

const SYSTEM_PROMPT = `Sei un esperto di elettroutensili e attrezzature edili con 20 anni di esperienza in cantiere.
Segui il Metodo "They Ask, You Answer" di Marcus Sheridan: sii onesto, trasparente, e affronta anche i difetti dei prodotti.

Il tuo obiettivo è aiutare i professionisti a fare la scelta giusta, anche se significa scoraggiarli dall'acquisto.

Regole:
1. Scrivi in italiano professionale ma accessibile
2. Evidenzia i PROBLEMI che il prodotto risolve, non solo le caratteristiche
3. Sii onesto sui difetti (peso, prezzo, limitazioni)
4. Non usare superlativi vuoti ("il migliore", "incredibile")
5. Cita casi d'uso specifici (elettricista, idraulico, muratore)
6. Mantieni un tono da "collega esperto", non da venditore`;

const USER_PROMPT_TEMPLATE = `Analizza questo prodotto e genera contenuti per l'e-commerce:

**Titolo:** {title}
**Brand:** {brand}
**SKU:** {sku}
**Tipo:** {productType}

Genera in formato JSON:
{
  "description": "Descrizione di 150-200 parole che spiega QUALI PROBLEMI risolve questo attrezzo e PER CHI è adatto. Inizia con il problema, non con le caratteristiche.",
  "pros": ["3 vantaggi tecnici specifici e misurabili"],
  "cons": ["2 svantaggi onesti (es. peso, prezzo, curva di apprendimento, compatibilità)"],
  "faqs": [
    {"question": "Domanda tecnica frequente 1", "answer": "Risposta pratica"},
    {"question": "Domanda tecnica frequente 2", "answer": "Risposta pratica"},
    {"question": "Domanda tecnica frequente 3", "answer": "Risposta pratica"}
  ]
}

IMPORTANTE: 
- I PRO devono essere specifici e tecnici, non generici
- I CONTRO devono essere onesti e reali, non finti difetti
- Le FAQ devono rispondere a dubbi reali dei professionisti
- Rispondi SOLO con il JSON, senza markdown o commenti`;

export async function generateProductContent(
  product: ShopifyProductWebhookPayload
): Promise<EnrichedProductData> {
  const userPrompt = USER_PROMPT_TEMPLATE
    .replace('{title}', product.title)
    .replace('{brand}', product.vendor || 'Sconosciuto')
    .replace('{sku}', product.variants[0]?.sku || 'N/A')
    .replace('{productType}', product.product_type || 'Elettroutensile');

  try {
    const anthropic = getAnthropicClient();
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        { 
          role: 'user', 
          content: `${SYSTEM_PROMPT}\n\n${userPrompt}` 
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

    return parsed;
  } catch (error) {
    console.error('AI Generation Error:', error);
    
    // Return fallback content if AI fails
    return {
      description: `${product.title} di ${product.vendor}. Contattaci per maggiori informazioni tecniche su questo prodotto.`,
      pros: [
        'Qualità professionale garantita',
        'Assistenza tecnica dedicata',
        'Garanzia ufficiale italiana',
      ],
      cons: [
        'Contattaci per dettagli specifici',
        'Verifica compatibilità con i tuoi accessori',
      ],
      faqs: [
        {
          question: 'Quali accessori sono inclusi?',
          answer: 'Contatta il nostro team tecnico per la lista completa degli accessori inclusi.',
        },
        {
          question: 'È coperto da garanzia?',
          answer: 'Sì, tutti i nostri prodotti sono coperti da garanzia ufficiale italiana.',
        },
        {
          question: 'Posso richiedere una dimostrazione?',
          answer: 'Certamente! Contattaci per organizzare una dimostrazione presso la nostra sede.',
        },
      ],
    };
  }
}

/**
 * Format the description as HTML for Shopify body_html
 */
export function formatDescriptionAsHtml(data: EnrichedProductData): string {
  const prosHtml = data.pros.map(pro => `<li>✓ ${pro}</li>`).join('');
  const consHtml = data.cons.map(con => `<li>⚠ ${con}</li>`).join('');
  const faqsHtml = data.faqs.map(faq => `
    <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h4 itemprop="name">${faq.question}</h4>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <p itemprop="text">${faq.answer}</p>
      </div>
    </div>
  `).join('');

  return `
<div class="product-description-enhanced" itemscope itemtype="https://schema.org/Product">
  <div class="description-main">
    <p itemprop="description">${data.description}</p>
  </div>
  
  <div class="pros-cons-section">
    <div class="pros">
      <h3>✅ Perché Sceglierlo</h3>
      <ul>${prosHtml}</ul>
    </div>
    
    <div class="cons">
      <h3>⚠️ Da Considerare</h3>
      <ul>${consHtml}</ul>
    </div>
  </div>
  
  <div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
    <h3>❓ Domande Frequenti</h3>
    ${faqsHtml}
  </div>
  
  <p class="ai-disclaimer"><em>Contenuto generato con assistenza AI e verificato dal nostro team tecnico.</em></p>
</div>
  `.trim();
}
