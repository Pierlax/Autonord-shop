/**
 * ImageDiscoveryAgent V2
 * 
 * Trova immagini prodotto SPECIFICHE (non generiche del brand).
 * Priorità: codice prodotto esatto > EAN > nome prodotto specifico
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// CONFIG
// =============================================================================

const OFFICIAL_DOMAINS: Record<string, string[]> = {
  'milwaukee': ['milwaukeetool.com', 'milwaukeetool.eu', 'milwaukeetool.it', 'milwaukeetool.de'],
  'makita': ['makita.it', 'makita.com', 'makita.eu', 'makitauk.com'],
  'dewalt': ['dewalt.it', 'dewalt.com', 'dewalt.eu', 'dewalt.co.uk'],
  'bosch': ['bosch-professional.com', 'bosch-pt.com', 'bosch.it'],
  'hilti': ['hilti.it', 'hilti.com', 'hilti.group'],
  'metabo': ['metabo.com', 'metabo.it', 'metabo.de'],
  'festool': ['festool.it', 'festool.com', 'festool.de'],
  'hikoki': ['hikoki-powertools.it', 'hikoki-powertools.com'],
};

// Domini da evitare assolutamente
const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'aliexpress.', 'manomano.', 'leroymerlin.',
  'bricobravo.', 'bricoman.', 'obi.', 'ferramenta.', 'toolstation.',
  'screwfix.', 'toolstop.', 'ffx.', 'zoro.', 'grainger.',
  'homedepot.', 'lowes.', 'menards.', 'acehardware.',
  'facebook.', 'instagram.', 'pinterest.', 'twitter.', 'youtube.',
];

// Categorie di prodotto per validazione più precisa
const PRODUCT_CATEGORIES: Record<string, string[]> = {
  'portabit': ['bit holder', 'portabit', 'magnetic holder', 'extension', 'prolunga'],
  'adattatore': ['adapter', 'adattatore', 'socket adapter', 'riduzione'],
  'punta': ['bit', 'punta', 'insert bit', 'screwdriver bit'],
  'avvitatore': ['drill', 'driver', 'avvitatore', 'trapano', 'impact'],
  'batteria': ['battery', 'batteria', 'akku', 'power pack'],
  'caricatore': ['charger', 'caricatore', 'caricabatterie'],
  'sega': ['saw', 'sega', 'circular saw', 'reciprocating'],
  'smerigliatrice': ['grinder', 'smerigliatrice', 'angle grinder'],
  'lama': ['blade', 'lama', 'cutting blade', 'replacement blade'],
};

// =============================================================================
// TYPES
// =============================================================================

export interface ImageDiscoveryResult {
  success: boolean;
  imageUrl: string | null;
  imageAlt: string;
  source: string | null;
  searchMethod?: string;
  error?: string;
}

interface ProductIdentifiers {
  mpn: string | null;
  ean: string | null;
  sku: string | null;
  category: string | null;
  searchTerms: string[];
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Cerca e valida un'immagine prodotto SPECIFICA
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
  
  // Estrai tutti gli identificatori del prodotto
  const identifiers = extractProductIdentifiers(title, sku, barcode, vendor);
  
  console.log(`[ImageAgent] Searching for: ${title}`);
  console.log(`[ImageAgent] Identifiers: MPN=${identifiers.mpn}, EAN=${identifiers.ean}, Category=${identifiers.category}`);

  // Trova domini ufficiali per questo brand
  const officialDomains = Object.entries(OFFICIAL_DOMAINS)
    .find(([brand]) => vendorLower.includes(brand))?.[1] || [];

  // STRATEGIA DI RICERCA MULTI-FASE
  // Fase 1: Cerca con codice prodotto esatto
  if (identifiers.mpn) {
    console.log(`[ImageAgent] Phase 1: Searching by MPN ${identifiers.mpn}`);
    const result = await searchByIdentifier(
      anthropic, 
      identifiers.mpn, 
      vendor, 
      officialDomains,
      title,
      identifiers.category
    );
    if (result.success) {
      return { ...result, searchMethod: 'MPN' };
    }
  }

  // Fase 2: Cerca con EAN
  if (identifiers.ean) {
    console.log(`[ImageAgent] Phase 2: Searching by EAN ${identifiers.ean}`);
    const result = await searchByIdentifier(
      anthropic, 
      identifiers.ean, 
      vendor, 
      officialDomains,
      title,
      identifiers.category
    );
    if (result.success) {
      return { ...result, searchMethod: 'EAN' };
    }
  }

  // Fase 3: Cerca con termini specifici del prodotto
  console.log(`[ImageAgent] Phase 3: Searching by specific terms`);
  const result = await searchBySpecificTerms(
    anthropic,
    identifiers.searchTerms,
    vendor,
    officialDomains,
    title,
    identifiers.category
  );
  
  if (result.success) {
    return { ...result, searchMethod: 'specific_terms' };
  }

  return {
    success: false,
    imageUrl: null,
    imageAlt: title,
    source: null,
    error: 'No valid specific image found after all search phases',
  };
}

// =============================================================================
// SEARCH FUNCTIONS
// =============================================================================

/**
 * Cerca immagine per identificatore (MPN o EAN)
 */
async function searchByIdentifier(
  anthropic: Anthropic,
  identifier: string,
  vendor: string,
  officialDomains: string[],
  fullTitle: string,
  category: string | null
): Promise<ImageDiscoveryResult> {
  
  const searchPrompt = `Trova l'immagine UFFICIALE del prodotto ${vendor} con codice "${identifier}".

ISTRUZIONI CRITICHE:
1. Cerca SOLO sui siti ufficiali: ${officialDomains.join(', ')}
2. L'immagine DEVE mostrare ESATTAMENTE il prodotto con codice ${identifier}
3. NON accettare immagini di altri prodotti dello stesso brand
4. L'immagine deve essere:
   - Foto prodotto isolato su sfondo bianco/neutro
   - SENZA watermark
   - Alta risoluzione (minimo 400x400px)
   - URL diretto all'immagine (.jpg, .png, .webp)

PRODOTTO CERCATO: ${fullTitle}
CATEGORIA: ${category || 'accessorio'}

Se trovi l'immagine esatta, rispondi con JSON:
{
  "found": true,
  "imageUrl": "URL DIRETTO all'immagine",
  "source": "dominio",
  "confidence": "high/medium/low"
}

Se NON trovi l'immagine ESATTA del prodotto ${identifier}, rispondi:
{"found": false, "reason": "motivo"}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 8,
      }],
      messages: [{ role: 'user', content: searchPrompt }],
    });

    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.found && parsed.imageUrl && parsed.confidence !== 'low') {
        // Verifica dominio
        if (isBlockedDomain(parsed.imageUrl)) {
          console.log(`[ImageAgent] Blocked domain: ${parsed.imageUrl}`);
          return { success: false, imageUrl: null, imageAlt: fullTitle, source: null };
        }

        // Validazione Vision STRETTA
        const validation = await validateImageStrict(
          anthropic, 
          parsed.imageUrl, 
          fullTitle, 
          vendor,
          identifier,
          category
        );
        
        if (validation.valid) {
          console.log(`[ImageAgent] Valid image found: ${parsed.imageUrl}`);
          return {
            success: true,
            imageUrl: parsed.imageUrl,
            imageAlt: `${fullTitle} - ${vendor}`,
            source: parsed.source || 'official',
          };
        } else {
          console.log(`[ImageAgent] Image rejected: ${validation.reason}`);
        }
      }
    }
  } catch (error) {
    console.error('[ImageAgent] Search error:', error);
  }

  return { success: false, imageUrl: null, imageAlt: fullTitle, source: null };
}

/**
 * Cerca con termini specifici del prodotto
 */
async function searchBySpecificTerms(
  anthropic: Anthropic,
  searchTerms: string[],
  vendor: string,
  officialDomains: string[],
  fullTitle: string,
  category: string | null
): Promise<ImageDiscoveryResult> {
  
  const searchQuery = searchTerms.join(' ');
  
  const searchPrompt = `Trova l'immagine UFFICIALE di questo prodotto specifico:

PRODOTTO: ${fullTitle}
BRAND: ${vendor}
TERMINI CHIAVE: ${searchQuery}
CATEGORIA: ${category || 'accessorio'}

REGOLE FONDAMENTALI:
1. L'immagine deve mostrare ESATTAMENTE questo prodotto, NON altri prodotti ${vendor}
2. Per un "portabit magnetico 60mm" devi trovare l'immagine di un PORTABIT, non di un avvitatore
3. Per un "adattatore 1/2 - 1/4" devi trovare l'immagine di un ADATTATORE, non di un trapano
4. Cerca PRIMA su: ${officialDomains.join(', ')}
5. L'immagine deve essere su sfondo bianco/neutro, senza watermark

ATTENZIONE: Se trovi solo immagini generiche del brand o di altri prodotti, rispondi found: false

Rispondi JSON:
{
  "found": true/false,
  "imageUrl": "URL diretto immagine o null",
  "source": "dominio",
  "productShown": "descrizione di cosa mostra l'immagine"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 8,
      }],
      messages: [{ role: 'user', content: searchPrompt }],
    });

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
        if (isBlockedDomain(parsed.imageUrl)) {
          return { success: false, imageUrl: null, imageAlt: fullTitle, source: null };
        }

        // Validazione Vision STRETTA
        const validation = await validateImageStrict(
          anthropic, 
          parsed.imageUrl, 
          fullTitle, 
          vendor,
          null,
          category
        );
        
        if (validation.valid) {
          return {
            success: true,
            imageUrl: parsed.imageUrl,
            imageAlt: `${fullTitle} - ${vendor}`,
            source: parsed.source || 'web',
          };
        }
      }
    }
  } catch (error) {
    console.error('[ImageAgent] Specific search error:', error);
  }

  return { success: false, imageUrl: null, imageAlt: fullTitle, source: null };
}

// =============================================================================
// VALIDATION
// =============================================================================

interface ValidationResult {
  valid: boolean;
  reason: string;
}

/**
 * Validazione Vision STRETTA - verifica che l'immagine mostri il prodotto ESATTO
 */
async function validateImageStrict(
  anthropic: Anthropic,
  imageUrl: string,
  expectedProduct: string,
  vendor: string,
  productCode: string | null,
  category: string | null
): Promise<ValidationResult> {
  try {
    const categoryDescription = getCategoryDescription(category);
    
    const validationPrompt = `Analizza questa immagine e verifica se mostra ESATTAMENTE il prodotto richiesto.

PRODOTTO RICHIESTO: ${expectedProduct}
BRAND: ${vendor}
${productCode ? `CODICE: ${productCode}` : ''}
CATEGORIA ATTESA: ${categoryDescription}

VERIFICA RIGOROSA:
1. L'immagine mostra un ${categoryDescription}? (NON un altro tipo di prodotto)
2. È una foto prodotto professionale su sfondo bianco/neutro?
3. Ci sono watermark visibili di altri negozi?
4. Il prodotto nell'immagine corrisponde alla descrizione "${expectedProduct}"?

ESEMPI DI RIFIUTO:
- Se cerco un "portabit magnetico" e l'immagine mostra un avvitatore → RIFIUTA
- Se cerco un "adattatore" e l'immagine mostra un trapano → RIFIUTA
- Se cerco "lame di ricambio" e l'immagine mostra l'utensile intero → RIFIUTA

Rispondi SOLO con JSON:
{
  "valid": true/false,
  "productType": "tipo di prodotto mostrato nell'immagine",
  "matchesCategory": true/false,
  "hasWatermark": true/false,
  "reason": "spiegazione dettagliata"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: validationPrompt },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const result = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validazione stretta: deve corrispondere alla categoria E non avere watermark
        const isValid = parsed.valid === true && 
                       parsed.matchesCategory === true && 
                       parsed.hasWatermark !== true;
        
        return {
          valid: isValid,
          reason: parsed.reason || (isValid ? 'Image validated' : 'Image does not match product'),
        };
      }
    }
  } catch (error) {
    console.error('[ImageAgent] Validation error:', error);
  }
  
  return { valid: false, reason: 'Validation failed' };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Estrae tutti gli identificatori del prodotto
 */
function extractProductIdentifiers(
  title: string,
  sku: string | null,
  barcode: string | null,
  vendor: string
): ProductIdentifiers {
  const vendorLower = vendor.toLowerCase();
  const titleLower = title.toLowerCase();
  
  let mpn: string | null = null;
  let category: string | null = null;
  const searchTerms: string[] = [];

  // Estrai MPN per brand
  if (vendorLower.includes('milwaukee') || vendorLower.includes('techtronic')) {
    // Milwaukee: 493XXXXXXX, 48-XX-XXXX, 49-XX-XXXX
    const patterns = [
      /\b(493\d{7})\b/,
      /\b(48-\d{2}-\d{4})\b/,
      /\b(49-\d{2}-\d{4})\b/,
      /\b(4932\d{6})\b/,
    ];
    for (const p of patterns) {
      const match = title.match(p) || sku?.match(p);
      if (match) {
        mpn = match[1];
        break;
      }
    }
  } else if (vendorLower.includes('makita')) {
    const match = title.match(/\b([A-Z]{2,3}\d{3,4}[A-Z]?\d?)\b/);
    if (match) mpn = match[1];
  } else if (vendorLower.includes('dewalt')) {
    const match = title.match(/\b(DC[A-Z]\d{3}[A-Z]?\d?)\b/);
    if (match) mpn = match[1];
  }

  // Fallback: codice numerico lungo nel titolo
  if (!mpn) {
    const genericMatch = title.match(/\b(\d{8,13})\b/);
    if (genericMatch) mpn = genericMatch[1];
  }

  // Determina categoria prodotto
  for (const [cat, keywords] of Object.entries(PRODUCT_CATEGORIES)) {
    if (keywords.some(kw => titleLower.includes(kw))) {
      category = cat;
      break;
    }
  }

  // Costruisci termini di ricerca specifici
  // Rimuovi parole generiche e mantieni quelle specifiche
  const specificWords = title
    .replace(/milwaukee|makita|dewalt|bosch|hilti|metabo|festool/gi, '')
    .replace(/professionale|professional|premium|pro/gi, '')
    .split(/[\s\-–—]+/)
    .filter(w => w.length > 2)
    .slice(0, 5);
  
  searchTerms.push(vendor);
  searchTerms.push(...specificWords);
  if (mpn) searchTerms.push(mpn);

  return {
    mpn,
    ean: barcode,
    sku,
    category,
    searchTerms,
  };
}

/**
 * Ottiene descrizione leggibile della categoria
 */
function getCategoryDescription(category: string | null): string {
  const descriptions: Record<string, string> = {
    'portabit': 'portabit/prolunga magnetica per punte (piccolo accessorio cilindrico)',
    'adattatore': 'adattatore/riduzione per attacchi (piccolo accessorio metallico)',
    'punta': 'punta per avvitatore (piccolo inserto)',
    'avvitatore': 'avvitatore/trapano elettrico (utensile completo)',
    'batteria': 'batteria/pacco batterie',
    'caricatore': 'caricabatterie',
    'sega': 'sega elettrica',
    'smerigliatrice': 'smerigliatrice angolare',
    'lama': 'lama di ricambio (accessorio piatto/disco)',
  };
  
  return descriptions[category || ''] || 'accessorio/utensile';
}

/**
 * Verifica che l'URL non sia da un dominio bloccato
 */
function isBlockedDomain(url: string): boolean {
  const urlLower = url.toLowerCase();
  return BLOCKED_DOMAINS.some(d => urlLower.includes(d));
}

// =============================================================================
// EXPORTS
// =============================================================================

export { extractProductIdentifiers, isBlockedDomain, OFFICIAL_DOMAINS, BLOCKED_DOMAINS };
