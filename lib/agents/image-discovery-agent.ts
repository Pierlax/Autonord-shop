/**
 * ImageDiscoveryAgent V3 - "Investigatore Privato" Edition
 * 
 * Trova immagini prodotto SPECIFICHE con strategie avanzate:
 * 1. Cross-Code: Cerca con codici alternativi internazionali
 * 2. Gold Standard: Cerca su cataloghi grossisti affidabili
 * 3. Validazione Vision stretta
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  findCrossRegionalCodes, 
  searchGoldStandardImage,
  GOLD_STANDARD_DOMAINS,
} from '@/lib/shopify/deep-research';

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
  'yanmar': ['yanmar.com', 'yanmar.it', 'yanmarce.com'],
};

// Domini da evitare per immagini (marketplace con foto user-generated)
const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'aliexpress.', 
  'facebook.', 'instagram.', 'pinterest.', 'twitter.', 'youtube.',
  'tiktok.', 'reddit.',
];

// Categorie di prodotto per validazione più precisa
const PRODUCT_CATEGORIES: Record<string, string[]> = {
  'portabit': ['bit holder', 'portabit', 'magnetic holder', 'extension', 'prolunga', 'porta inserti'],
  'adattatore': ['adapter', 'adattatore', 'socket adapter', 'riduzione', 'raccordo'],
  'punta': ['bit', 'punta', 'insert bit', 'screwdriver bit', 'inserto'],
  'avvitatore': ['drill', 'driver', 'avvitatore', 'trapano', 'impact', 'impulsi'],
  'batteria': ['battery', 'batteria', 'akku', 'power pack', 'accumulatore'],
  'caricatore': ['charger', 'caricatore', 'caricabatterie', 'charging'],
  'sega': ['saw', 'sega', 'circular saw', 'reciprocating', 'circolare'],
  'smerigliatrice': ['grinder', 'smerigliatrice', 'angle grinder', 'flex'],
  'lama': ['blade', 'lama', 'cutting blade', 'replacement blade', 'ricambio'],
  'filtro': ['filter', 'filtro', 'oil filter', 'air filter', 'manutenzione'],
  'kit': ['kit', 'set', 'combo', 'insieme'],
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
  confidence?: 'high' | 'medium' | 'low';
  error?: string;
}

interface ProductIdentifiers {
  mpn: string | null;
  ean: string | null;
  sku: string | null;
  category: string | null;
  searchTerms: string[];
  alternativeCodes: string[];
}

// =============================================================================
// MAIN FUNCTION - V3 con strategie "Investigatore Privato"
// =============================================================================

/**
 * Cerca e valida un'immagine prodotto SPECIFICA con strategie avanzate
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
  
  console.log(`[ImageAgent V3] 🔍 Searching for: ${title}`);
  console.log(`[ImageAgent V3] Identifiers: MPN=${identifiers.mpn}, EAN=${identifiers.ean}, Category=${identifiers.category}`);

  // Trova domini ufficiali per questo brand
  const officialDomains = Object.entries(OFFICIAL_DOMAINS)
    .find(([brand]) => vendorLower.includes(brand))?.[1] || [];

  // ===========================================
  // FASE 0: Cross-Code - Trova codici alternativi
  // ===========================================
  if (identifiers.mpn) {
    console.log(`[ImageAgent V3] Phase 0: Finding cross-regional codes for ${identifiers.mpn}`);
    try {
      const crossCodes = await findCrossRegionalCodes(title, vendor, identifiers.mpn);
      if (crossCodes.alternativeCodes.length > 0) {
        identifiers.alternativeCodes = crossCodes.alternativeCodes.map(c => c.code);
        console.log(`[ImageAgent V3] Found ${identifiers.alternativeCodes.length} alternative codes: ${identifiers.alternativeCodes.join(', ')}`);
      }
    } catch (e) {
      console.log(`[ImageAgent V3] Cross-code search skipped: ${e}`);
    }
  }

  // Tutti i codici da cercare (originale + alternativi)
  const allCodes = [
    identifiers.mpn,
    ...identifiers.alternativeCodes,
    identifiers.ean,
  ].filter(Boolean) as string[];

  // ===========================================
  // FASE 1: Gold Standard Domains
  // ===========================================
  console.log(`[ImageAgent V3] Phase 1: Searching Gold Standard domains`);
  try {
    const goldResult = await searchGoldStandardImage(
      title,
      vendor,
      allCodes.length > 0 ? allCodes : [title],
      identifiers.category
    );
    
    if (goldResult.found && goldResult.imageUrl) {
      // Validazione Vision
      const validation = await validateImageStrict(
        anthropic,
        goldResult.imageUrl,
        title,
        vendor,
        identifiers.mpn,
        identifiers.category
      );
      
      if (validation.valid) {
        console.log(`[ImageAgent V3] ✅ Gold Standard image validated: ${goldResult.domain}`);
        return {
          success: true,
          imageUrl: goldResult.imageUrl,
          imageAlt: `${title} - ${vendor}`,
          source: goldResult.domain,
          searchMethod: 'gold_standard',
          confidence: goldResult.confidence,
        };
      } else {
        console.log(`[ImageAgent V3] Gold Standard image rejected: ${validation.reason}`);
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V3] Gold Standard search error: ${e}`);
  }

  // ===========================================
  // FASE 2: Siti ufficiali con MPN
  // ===========================================
  for (const code of allCodes) {
    console.log(`[ImageAgent V3] Phase 2: Searching official sites for ${code}`);
    const result = await searchByIdentifier(
      anthropic, 
      code, 
      vendor, 
      officialDomains,
      title,
      identifiers.category
    );
    if (result.success) {
      return { ...result, searchMethod: `official_${code}` };
    }
  }

  // ===========================================
  // FASE 3: Ricerca con termini specifici
  // ===========================================
  console.log(`[ImageAgent V3] Phase 3: Searching by specific terms`);
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

  // ===========================================
  // FASE 4: Fallback - Cataloghi grossisti specifici
  // ===========================================
  console.log(`[ImageAgent V3] Phase 4: Fallback to specific retailer sites`);
  const fallbackResult = await searchFallbackRetailers(
    anthropic,
    title,
    vendor,
    allCodes,
    identifiers.category
  );
  
  if (fallbackResult.success) {
    return { ...fallbackResult, searchMethod: 'fallback_retailer' };
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
 * Cerca immagine per identificatore (MPN o EAN) sui siti ufficiali
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
1. Cerca PRIMA sui siti ufficiali: ${officialDomains.join(', ')}
2. L'immagine DEVE mostrare ESATTAMENTE il prodotto con codice ${identifier}
3. NON accettare immagini di altri prodotti dello stesso brand
4. L'immagine deve essere:
   - Foto prodotto isolato su sfondo bianco/neutro
   - SENZA watermark
   - Alta risoluzione (minimo 400x400px)
   - URL diretto all'immagine (.jpg, .png, .webp)

PRODOTTO CERCATO: ${fullTitle}
CATEGORIA: ${category || 'accessorio'}

ATTENZIONE SPECIALE per accessori/ricambi:
- Se cerchi "lame di ricambio" NON accettare foto di utensili completi
- Se cerchi "portabit" NON accettare foto di avvitatori
- Se cerchi "filtro" NON accettare foto di macchine intere

Se trovi l'immagine esatta, rispondi con JSON:
{
  "found": true,
  "imageUrl": "URL DIRETTO all'immagine",
  "source": "dominio",
  "confidence": "high/medium/low",
  "productShown": "descrizione di cosa mostra l'immagine"
}

Se NON trovi l'immagine ESATTA del prodotto ${identifier}, rispondi:
{"found": false, "reason": "motivo"}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
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
          console.log(`[ImageAgent V3] Blocked domain: ${parsed.imageUrl}`);
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
          console.log(`[ImageAgent V3] ✅ Valid image found: ${parsed.imageUrl}`);
          return {
            success: true,
            imageUrl: parsed.imageUrl,
            imageAlt: `${fullTitle} - ${vendor}`,
            source: parsed.source || 'official',
            confidence: parsed.confidence,
          };
        } else {
          console.log(`[ImageAgent V3] Image rejected: ${validation.reason}`);
        }
      }
    }
  } catch (error) {
    console.error('[ImageAgent V3] Search error:', error);
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
4. Per "lame di ricambio" devi trovare l'immagine delle LAME, non dell'utensile
5. Cerca PRIMA su: ${officialDomains.join(', ')}
6. L'immagine deve essere su sfondo bianco/neutro, senza watermark

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
      model: 'claude-opus-4-20250514',
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
    console.error('[ImageAgent V3] Specific search error:', error);
  }

  return { success: false, imageUrl: null, imageAlt: fullTitle, source: null };
}

/**
 * Fallback: cerca su cataloghi grossisti specifici
 */
async function searchFallbackRetailers(
  anthropic: Anthropic,
  fullTitle: string,
  vendor: string,
  codes: string[],
  category: string | null
): Promise<ImageDiscoveryResult> {
  
  // Seleziona retailer in base al brand
  const vendorLower = vendor.toLowerCase();
  let targetSites: string[] = [];
  
  if (vendorLower.includes('milwaukee')) {
    targetSites = ['toolstop.co.uk', 'acmetools.com', 'ohiopowertool.com', 'ffx.co.uk'];
  } else if (vendorLower.includes('makita')) {
    targetSites = ['toolstop.co.uk', 'ffx.co.uk', 'toolnut.com', 'rotopino.it'];
  } else if (vendorLower.includes('yanmar')) {
    targetSites = ['yanmarce.com', 'yanmar.com'];
  } else {
    targetSites = ['toolstop.co.uk', 'ffx.co.uk', 'rotopino.it', 'fixami.it'];
  }

  const codesString = codes.length > 0 ? codes.join('" OR "') : fullTitle;
  
  const searchPrompt = `Cerca l'immagine del prodotto su questi SPECIFICI siti di grossisti:

PRODOTTO: ${fullTitle}
BRAND: ${vendor}
CODICI: "${codesString}"
CATEGORIA: ${category || 'accessorio'}

CERCA SPECIFICAMENTE SU:
${targetSites.map(s => `- site:${s}`).join('\n')}

Questi sono siti professionali con foto di alta qualità.
L'immagine deve mostrare ESATTAMENTE il prodotto cercato (${category || 'accessorio'}).

Rispondi JSON:
{
  "found": true/false,
  "imageUrl": "URL diretto immagine",
  "source": "dominio",
  "confidence": "high/medium/low"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 6,
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
        // Validazione Vision
        const validation = await validateImageStrict(
          anthropic,
          parsed.imageUrl,
          fullTitle,
          vendor,
          null,
          category
        );
        
        if (validation.valid) {
          console.log(`[ImageAgent V3] ✅ Fallback retailer image found: ${parsed.source}`);
          return {
            success: true,
            imageUrl: parsed.imageUrl,
            imageAlt: `${fullTitle} - ${vendor}`,
            source: parsed.source,
            confidence: parsed.confidence,
          };
        }
      }
    }
  } catch (error) {
    console.error('[ImageAgent V3] Fallback search error:', error);
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

ESEMPI DI RIFIUTO OBBLIGATORIO:
- Se cerco un "portabit magnetico" e l'immagine mostra un avvitatore → RIFIUTA
- Se cerco un "adattatore" e l'immagine mostra un trapano → RIFIUTA
- Se cerco "lame di ricambio" e l'immagine mostra l'utensile intero → RIFIUTA
- Se cerco "filtro olio" e l'immagine mostra un escavatore → RIFIUTA
- Se cerco un "kit batterie" e l'immagine mostra solo l'utensile → RIFIUTA

Rispondi SOLO con JSON:
{
  "valid": true/false,
  "productType": "tipo di prodotto mostrato nell'immagine",
  "matchesCategory": true/false,
  "hasWatermark": true/false,
  "isGenericBrandImage": true/false,
  "reason": "spiegazione dettagliata"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
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
        
        // Validazione stretta: deve corrispondere alla categoria E non avere watermark E non essere generica
        const isValid = parsed.valid === true && 
                       parsed.matchesCategory === true && 
                       parsed.hasWatermark !== true &&
                       parsed.isGenericBrandImage !== true;
        
        return {
          valid: isValid,
          reason: parsed.reason || (isValid ? 'Image validated' : 'Image does not match product'),
        };
      }
    }
  } catch (error) {
    console.error('[ImageAgent V3] Validation error:', error);
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
  const alternativeCodes: string[] = [];

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
  } else if (vendorLower.includes('yanmar')) {
    // Yanmar: VIO17, VIO33, SV08, etc.
    const match = title.match(/\b(VIO\d{2}|SV\d{2}|B\d{2})\b/i);
    if (match) mpn = match[1].toUpperCase();
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
    .replace(/milwaukee|makita|dewalt|bosch|hilti|metabo|festool|yanmar/gi, '')
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
    alternativeCodes,
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
    'avvitatore': 'avvitatore/trapano elettrico (utensile completo con impugnatura)',
    'batteria': 'batteria/pacco batterie (blocco rettangolare)',
    'caricatore': 'caricabatterie (dispositivo con slot per batteria)',
    'sega': 'sega elettrica (utensile con lama)',
    'smerigliatrice': 'smerigliatrice angolare (utensile con disco)',
    'lama': 'lama di ricambio (accessorio piatto/disco, NON utensile completo)',
    'filtro': 'filtro (componente cilindrico o piatto per manutenzione)',
    'kit': 'kit/set di componenti (più elementi insieme)',
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
