/**
 * ImageDiscoveryAgent
 * 
 * Trova immagini prodotto ufficiali senza watermark.
 * Usato dal worker regenerate-product per arricchire le schede.
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// CONFIG
// =============================================================================

const OFFICIAL_DOMAINS: Record<string, string[]> = {
  'milwaukee': ['milwaukeetool.com', 'milwaukeetool.eu', 'milwaukeetool.it'],
  'makita': ['makita.it', 'makita.com', 'makita.eu'],
  'dewalt': ['dewalt.it', 'dewalt.com', 'dewalt.eu'],
  'bosch': ['bosch-professional.com', 'bosch-pt.com'],
  'hilti': ['hilti.it', 'hilti.com'],
  'metabo': ['metabo.com', 'metabo.it'],
  'festool': ['festool.it', 'festool.com'],
  'hikoki': ['hikoki-powertools.it', 'hikoki-powertools.com'],
};

const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'aliexpress.', 'manomano.', 'leroymerlin.',
  'bricobravo.', 'bricoman.', 'obi.', 'ferramenta.', 'toolstation.',
];

// =============================================================================
// TYPES
// =============================================================================

export interface ImageDiscoveryResult {
  success: boolean;
  imageUrl: string | null;
  imageAlt: string;
  source: string | null;
  error?: string;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Cerca e valida un'immagine prodotto ufficiale
 */
export async function discoverProductImage(
  title: string,
  vendor: string,
  sku: string | null,
  barcode: string | null
): Promise<ImageDiscoveryResult> {
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      imageUrl: null,
      imageAlt: title,
      source: null,
      error: 'Missing ANTHROPIC_API_KEY',
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const vendorLower = vendor.toLowerCase();
  
  // Trova domini ufficiali per questo brand
  const officialDomains = Object.entries(OFFICIAL_DOMAINS)
    .find(([brand]) => vendorLower.includes(brand))?.[1] || [];

  // Estrai codice prodotto (MPN)
  const mpn = extractMPN(title, sku, vendor);

  const searchPrompt = `Cerca l'immagine ufficiale del prodotto "${title}" (${vendor}).

CODICE PRODOTTO: ${mpn || sku || 'N/A'}
EAN: ${barcode || 'N/A'}

ISTRUZIONI:
1. Cerca PRIMA sui siti ufficiali: ${officialDomains.join(', ') || vendor + ' official site'}
2. L'immagine deve essere:
   - Foto prodotto su sfondo bianco/neutro
   - SENZA watermark di altri negozi
   - Del prodotto ESATTO (non generico)
3. EVITA: Amazon, eBay, Leroy Merlin, Manomano, altri e-commerce

RISPONDI SOLO con JSON:
{
  "found": true/false,
  "imageUrl": "URL diretto immagine (.jpg/.png/.webp) o null",
  "source": "dominio di provenienza"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      }],
      messages: [{ role: 'user', content: searchPrompt }],
    });

    // Estrai risposta
    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.found && parsed.imageUrl) {
        // Verifica che non sia un dominio bloccato
        if (isBlockedDomain(parsed.imageUrl)) {
          return {
            success: false,
            imageUrl: null,
            imageAlt: title,
            source: null,
            error: 'Image from blocked domain',
          };
        }

        // Valida l'immagine con Vision
        const isValid = await validateImage(anthropic, parsed.imageUrl, title, vendor);
        
        if (isValid) {
          return {
            success: true,
            imageUrl: parsed.imageUrl,
            imageAlt: `${title} - ${vendor}`,
            source: parsed.source || 'web',
          };
        }
      }
    }

    return {
      success: false,
      imageUrl: null,
      imageAlt: title,
      source: null,
      error: 'No valid image found',
    };

  } catch (error) {
    console.error('[ImageAgent] Error:', error);
    return {
      success: false,
      imageUrl: null,
      imageAlt: title,
      source: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Estrae il codice MPN dal titolo/SKU
 */
function extractMPN(title: string, sku: string | null, vendor: string): string | null {
  const vendorLower = vendor.toLowerCase();
  
  // Milwaukee: 493XXXXXXX o 48-XX-XXXX
  if (vendorLower.includes('milwaukee') || vendorLower.includes('techtronic')) {
    const patterns = [/\b(493\d{7})\b/, /\b(48-\d{2}-\d{4})\b/, /\b(49-\d{2}-\d{4})\b/];
    for (const p of patterns) {
      const match = title.match(p) || sku?.match(p);
      if (match) return match[1];
    }
  }
  
  // Makita: DDF484, DHP486
  if (vendorLower.includes('makita')) {
    const match = title.match(/\b([A-Z]{2,3}\d{3,4}[A-Z]?\d?)\b/) || sku?.match(/\b([A-Z]{2,3}\d{3,4}[A-Z]?\d?)\b/);
    if (match) return match[1];
  }
  
  // DeWalt: DCD796, DCF887
  if (vendorLower.includes('dewalt') || vendorLower.includes('stanley')) {
    const match = title.match(/\b(DC[A-Z]\d{3}[A-Z]?\d?)\b/) || sku?.match(/\b(DC[A-Z]\d{3}[A-Z]?\d?)\b/);
    if (match) return match[1];
  }
  
  // Fallback: codice numerico lungo
  const genericMatch = title.match(/\b(\d{8,13})\b/);
  return genericMatch ? genericMatch[1] : null;
}

/**
 * Verifica che l'URL non sia da un dominio bloccato
 */
function isBlockedDomain(url: string): boolean {
  const urlLower = url.toLowerCase();
  return BLOCKED_DOMAINS.some(d => urlLower.includes(d));
}

/**
 * Valida l'immagine con Vision AI
 */
async function validateImage(
  anthropic: Anthropic,
  imageUrl: string,
  expectedProduct: string,
  vendor: string
): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { 
            type: 'text', 
            text: `È questa un'immagine professionale del prodotto "${expectedProduct}" (${vendor})?
            
Verifica:
1. Foto prodotto su sfondo bianco/neutro (non ambientata)
2. Nessun watermark visibile di altri negozi
3. Prodotto corrispondente alla descrizione

Rispondi SOLO: {"valid": true/false, "reason": "breve spiegazione"}` 
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const result = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.valid === true;
      }
    }
  } catch (error) {
    console.error('[ImageAgent] Validation error:', error);
  }
  
  return false;
}
