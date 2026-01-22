/**
 * ImageDiscoveryAgent - TAYA Image Discovery System
 * 
 * Trova immagini prodotto ufficiali senza watermark di concorrenti.
 * 
 * FLUSSO:
 * 1. Estrai EAN/MPN dal titolo/SKU (es. pattern Milwaukee `493...`, `48-...`)
 * 2. Cerca immagine con priorità domini ufficiali (milwaukeetool.*, makita.*, etc.)
 * 3. Valida con Vision AI (no watermark, sfondo neutro, prodotto corretto)
 * 4. Ritorna URL validato o null
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// =============================================================================
// CONFIGURATION
// =============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// Domini ufficiali per brand (priorità alta)
const OFFICIAL_DOMAINS: Record<string, string[]> = {
  'milwaukee': [
    'milwaukeetool.com',
    'milwaukeetool.eu',
    'milwaukeetool.it',
    'milwaukeetool.de',
    'milwaukeetool.co.uk',
  ],
  'makita': [
    'makita.it',
    'makita.com',
    'makita.eu',
    'makitauk.com',
  ],
  'dewalt': [
    'dewalt.it',
    'dewalt.com',
    'dewalt.eu',
  ],
  'bosch': [
    'bosch-professional.com',
    'bosch-pt.com',
  ],
  'hilti': [
    'hilti.it',
    'hilti.com',
  ],
  'metabo': [
    'metabo.com',
    'metabo.it',
  ],
  'festool': [
    'festool.it',
    'festool.com',
  ],
  'hikoki': [
    'hikoki-powertools.it',
    'hikoki-powertools.com',
  ],
};

// Domini da evitare (concorrenti, marketplace con watermark)
const BLOCKED_DOMAINS = [
  'amazon.',
  'ebay.',
  'aliexpress.',
  'wish.',
  'manomano.',
  'leroymerlin.',
  'bricobravo.',
  'bricoman.',
  'obi.',
  'leroy-merlin.',
  'utensileria-online.',
  'ferramenta.',
  'toolstation.',
  'screwfix.',
];

// =============================================================================
// TYPES
// =============================================================================

export interface ImageSearchResult {
  url: string;
  source: string;
  isOfficial: boolean;
  confidence: number;
}

export interface ImageValidationResult {
  valid: boolean;
  reason: string;
  hasWatermark: boolean;
  isProductShot: boolean;
  backgroundType: 'white' | 'neutral' | 'complex' | 'unknown';
}

export interface ImageDiscoveryResult {
  success: boolean;
  imageUrl: string | null;
  imageAlt: string;
  source: string | null;
  validationDetails: ImageValidationResult | null;
  searchAttempts: number;
  error?: string;
}

// =============================================================================
// STEP 1: EXTRACT EAN/MPN FROM PRODUCT DATA
// =============================================================================

interface ProductIdentifiers {
  ean: string | null;
  mpn: string | null;
  sku: string | null;
  modelNumber: string | null;
}

/**
 * Estrae identificatori prodotto (EAN, MPN, SKU) dal titolo e dati
 */
export function extractProductIdentifiers(
  title: string,
  sku: string | null,
  barcode: string | null,
  vendor: string
): ProductIdentifiers {
  const identifiers: ProductIdentifiers = {
    ean: null,
    mpn: null,
    sku: sku,
    modelNumber: null,
  };

  // EAN/Barcode (13 o 12 cifre)
  if (barcode && /^\d{12,13}$/.test(barcode)) {
    identifiers.ean = barcode;
  }

  // Pattern specifici per brand
  const vendorLower = vendor.toLowerCase();
  
  if (vendorLower.includes('milwaukee') || vendorLower.includes('techtronic')) {
    // Milwaukee: 493XXXXXXX o 48-XX-XXXX
    const milwaukeePatterns = [
      /\b(493\d{7})\b/,           // 4932472065
      /\b(48-\d{2}-\d{4})\b/,     // 48-44-0411
      /\b(49-\d{2}-\d{4})\b/,     // 49-16-2772
      /\b(M18\s*[A-Z0-9-]+)\b/i,  // M18 FUEL, M18FPD2
    ];
    
    for (const pattern of milwaukeePatterns) {
      const match = title.match(pattern) || sku?.match(pattern);
      if (match) {
        identifiers.mpn = match[1].replace(/-/g, '');
        break;
      }
    }
  }
  
  if (vendorLower.includes('makita')) {
    // Makita: DDF484, DHP486, etc.
    const makitaPattern = /\b([A-Z]{2,3}\d{3,4}[A-Z]?\d?)\b/;
    const match = title.match(makitaPattern) || sku?.match(makitaPattern);
    if (match) {
      identifiers.mpn = match[1];
    }
  }
  
  if (vendorLower.includes('dewalt') || vendorLower.includes('stanley')) {
    // DeWalt: DCD796, DCF887, etc.
    const dewaltPattern = /\b(DC[A-Z]\d{3}[A-Z]?\d?)\b/;
    const match = title.match(dewaltPattern) || sku?.match(dewaltPattern);
    if (match) {
      identifiers.mpn = match[1];
    }
  }
  
  if (vendorLower.includes('bosch')) {
    // Bosch: GSR 18V-60, GBH 18V-26, etc.
    const boschPattern = /\b(G[A-Z]{2}\s*\d{2}V?-?\d{2,3}[A-Z]?)\b/i;
    const match = title.match(boschPattern) || sku?.match(boschPattern);
    if (match) {
      identifiers.mpn = match[1].replace(/\s+/g, ' ');
    }
  }

  // Fallback: cerca qualsiasi codice numerico lungo nel titolo
  if (!identifiers.mpn) {
    const genericPattern = /\b(\d{8,13})\b/;
    const match = title.match(genericPattern);
    if (match) {
      identifiers.modelNumber = match[1];
    }
  }

  return identifiers;
}

// =============================================================================
// STEP 2: SEARCH FOR PRODUCT IMAGE
// =============================================================================

/**
 * Cerca immagine prodotto usando Claude con Web Search
 * Priorità: domini ufficiali > retailer affidabili > altri
 */
async function searchProductImage(
  productTitle: string,
  identifiers: ProductIdentifiers,
  vendor: string
): Promise<ImageSearchResult[]> {
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });

  const vendorLower = vendor.toLowerCase();
  const officialDomains = Object.entries(OFFICIAL_DOMAINS)
    .find(([brand]) => vendorLower.includes(brand))?.[1] || [];

  // Costruisci query di ricerca ottimizzata
  const searchTerms = [
    identifiers.mpn,
    identifiers.ean,
    identifiers.sku,
    productTitle,
  ].filter(Boolean);

  const searchQuery = `${vendor} ${searchTerms[0] || productTitle} product image official`;

  const prompt = `Cerca l'immagine ufficiale del prodotto "${productTitle}" (${vendor}).

IDENTIFICATORI PRODOTTO:
- MPN/Codice: ${identifiers.mpn || 'N/A'}
- EAN: ${identifiers.ean || 'N/A'}
- SKU: ${identifiers.sku || 'N/A'}

ISTRUZIONI:
1. Cerca PRIMA sui siti ufficiali del produttore: ${officialDomains.join(', ') || 'sito ufficiale ' + vendor}
2. L'immagine deve essere:
   - Foto prodotto professionale su sfondo bianco/neutro
   - SENZA watermark di altri negozi
   - Alta risoluzione (almeno 500x500px)
   - Del prodotto ESATTO (non generico del brand)

3. EVITA immagini da: Amazon, eBay, AliExpress, Leroy Merlin, Manomano, altri e-commerce

RISPONDI SOLO con JSON:
{
  "found": true/false,
  "images": [
    {
      "url": "URL diretto dell'immagine (deve finire in .jpg, .png, .webp)",
      "source": "dominio di provenienza",
      "confidence": 1-100
    }
  ],
  "searchQuery": "query usata"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        }
      ],
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Estrai il testo dalla risposta
    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    // Parse JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.found && parsed.images?.length > 0) {
        return parsed.images.map((img: any) => ({
          url: img.url,
          source: img.source || 'unknown',
          isOfficial: officialDomains.some(d => img.url?.includes(d)),
          confidence: img.confidence || 50,
        }));
      }
    }
  } catch (error) {
    log.error('[ImageAgent] Search error:', error);
  }

  return [];
}

// =============================================================================
// STEP 3: VALIDATE IMAGE WITH VISION AI
// =============================================================================

/**
 * Valida l'immagine usando Claude Vision
 * Controlla: watermark, sfondo, qualità, prodotto corretto
 */
async function validateImageWithVision(
  imageUrl: string,
  expectedProduct: string,
  vendor: string
): Promise<ImageValidationResult> {
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });

  const prompt = `Analizza questa immagine di un prodotto ${vendor}.

PRODOTTO ATTESO: "${expectedProduct}"

VERIFICA:
1. È una foto prodotto professionale (non foto amatoriale/lifestyle)?
2. Lo sfondo è bianco o neutro (non ambientato)?
3. Ci sono watermark visibili di altri negozi/e-commerce?
4. Il prodotto mostrato corrisponde alla descrizione?
5. L'immagine è di buona qualità (non sfocata, non pixelata)?

RISPONDI SOLO con JSON:
{
  "valid": true/false,
  "reason": "Spiegazione breve",
  "hasWatermark": true/false,
  "isProductShot": true/false,
  "backgroundType": "white" | "neutral" | "complex" | "unknown",
  "matchesDescription": true/false,
  "qualityScore": 1-100
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const result = textBlock?.type === 'text' ? textBlock.text : null;

    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          valid: parsed.valid && !parsed.hasWatermark && parsed.isProductShot,
          reason: parsed.reason,
          hasWatermark: parsed.hasWatermark,
          isProductShot: parsed.isProductShot,
          backgroundType: parsed.backgroundType,
        };
      }
    }
  } catch (error) {
    log.error('[ImageAgent] Vision validation error:', error);
  }

  return {
    valid: false,
    reason: 'Validation failed',
    hasWatermark: false,
    isProductShot: false,
    backgroundType: 'unknown',
  };
}

/**
 * Verifica che l'URL non sia da un dominio bloccato
 */
function isBlockedDomain(url: string): boolean {
  const urlLower = url.toLowerCase();
  return BLOCKED_DOMAINS.some(domain => urlLower.includes(domain));
}

/**
 * Verifica che l'URL sia un'immagine valida
 */
function isValidImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const urlLower = url.toLowerCase();
  
  // Controlla estensione o pattern URL immagine
  return imageExtensions.some(ext => urlLower.includes(ext)) ||
         urlLower.includes('/image') ||
         urlLower.includes('/img') ||
         urlLower.includes('/photo');
}

// =============================================================================
// MAIN DISCOVERY FUNCTION
// =============================================================================

/**
 * Funzione principale: cerca e valida immagine prodotto
 */
export async function discoverProductImage(
  title: string,
  vendor: string,
  sku: string | null,
  barcode: string | null
): Promise<ImageDiscoveryResult> {
  log.info(`[ImageAgent] Starting discovery for: ${title}`);
  
  let searchAttempts = 0;
  
  try {
    // Step 1: Estrai identificatori
    const identifiers = extractProductIdentifiers(title, sku, barcode, vendor);
    log.info(`[ImageAgent] Identifiers: MPN=${identifiers.mpn}, EAN=${identifiers.ean}`);
    
    // Step 2: Cerca immagini
    searchAttempts++;
    const searchResults = await searchProductImage(title, identifiers, vendor);
    log.info(`[ImageAgent] Found ${searchResults.length} candidate images`);
    
    if (searchResults.length === 0) {
      return {
        success: false,
        imageUrl: null,
        imageAlt: title,
        source: null,
        validationDetails: null,
        searchAttempts,
        error: 'No images found',
      };
    }
    
    // Step 3: Valida immagini (in ordine di priorità)
    // Prima le ufficiali, poi le altre
    const sortedResults = searchResults.sort((a, b) => {
      if (a.isOfficial && !b.isOfficial) return -1;
      if (!a.isOfficial && b.isOfficial) return 1;
      return b.confidence - a.confidence;
    });
    
    for (const candidate of sortedResults) {
      // Skip domini bloccati
      if (isBlockedDomain(candidate.url)) {
        log.info(`[ImageAgent] Skipping blocked domain: ${candidate.source}`);
        continue;
      }
      
      // Skip URL non validi
      if (!isValidImageUrl(candidate.url)) {
        log.info(`[ImageAgent] Skipping invalid image URL: ${candidate.url}`);
        continue;
      }
      
      log.info(`[ImageAgent] Validating: ${candidate.url}`);
      searchAttempts++;
      
      const validation = await validateImageWithVision(
        candidate.url,
        title,
        vendor
      );
      
      if (validation.valid) {
        log.info(`[ImageAgent] ✅ Valid image found: ${candidate.url}`);
        return {
          success: true,
          imageUrl: candidate.url,
          imageAlt: `${title} - Immagine ufficiale ${vendor}`,
          source: candidate.source,
          validationDetails: validation,
          searchAttempts,
        };
      } else {
        log.info(`[ImageAgent] ❌ Invalid: ${validation.reason}`);
      }
    }
    
    // Nessuna immagine valida trovata
    return {
      success: false,
      imageUrl: null,
      imageAlt: title,
      source: null,
      validationDetails: null,
      searchAttempts,
      error: 'No valid images passed validation',
    };
    
  } catch (error) {
    log.error('[ImageAgent] Discovery error:', error);
    return {
      success: false,
      imageUrl: null,
      imageAlt: title,
      source: null,
      validationDetails: null,
      searchAttempts,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  extractProductIdentifiers,
  searchProductImage,
  validateImageWithVision,
  isBlockedDomain,
  OFFICIAL_DOMAINS,
  BLOCKED_DOMAINS,
};
