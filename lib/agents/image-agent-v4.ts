/**
 * ImageAgent V4 - Unified Deep Research + Image Discovery
 * 
 * Un unico agente efficiente che:
 * 1. PDF Hunter - Cerca datasheet per specifiche (opzionale, per confidence)
 * 2. Cross-Code - Trova codici alternativi internazionali
 * 3. Gold Standard Search - Cerca su cataloghi affidabili
 * 4. Vision Validation - Valida l'immagine trovata
 * 
 * Flusso ottimizzato:
 * - Estrae identificatori dal prodotto
 * - Cerca codici alternativi (1 chiamata)
 * - Cerca immagine su Gold Standard con TUTTI i codici (1 chiamata)
 * - Valida con Vision (1 chiamata)
 * - Fallback a ricerca generica se necessario
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// CONFIG
// =============================================================================

const GOLD_STANDARD_DOMAINS = {
  // Distributori ufficiali
  official: [
    'milwaukeetool.eu', 'milwaukeetool.com', 'milwaukeetool.it',
    'makita.it', 'makita.com', 'makita.eu',
    'dewalt.it', 'dewalt.com',
    'bosch-professional.com',
  ],
  // UK - Foto professionali eccellenti
  uk: [
    'toolstop.co.uk',
    'ffx.co.uk', 
    'screwfix.com',
    'toolstation.com',
    'powertoolworld.co.uk',
    'kelvinpowertools.com',
  ],
  // USA - Cataloghi completi
  usa: [
    'acmetools.com',
    'ohiopowertool.com',
    'toolnut.com',
    'cpooutlets.com',
    'zoro.com',
  ],
  // EU - Buona copertura
  eu: [
    'rotopino.it',
    'fixami.it',
    'manomano.it',
    'contorion.de',
    'svh24.de',
    'toolnation.nl',
  ],
};

const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'aliexpress.', 
  'facebook.', 'instagram.', 'pinterest.', 'twitter.', 'youtube.',
  'tiktok.', 'reddit.', 'wish.com',
];

// =============================================================================
// TYPES
// =============================================================================

export interface ImageAgentV4Result {
  success: boolean;
  imageUrl: string | null;
  imageAlt: string;
  source: string | null;
  method: 'gold_standard' | 'official_site' | 'web_search' | 'none';
  confidence: 'high' | 'medium' | 'low';
  // Dati extra per enrichment
  alternativeCodes: string[];
  pdfSpecsFound: boolean;
  searchAttempts: number;
  totalTimeMs: number;
  error?: string;
}

interface ProductIdentifiers {
  mpn: string | null;
  ean: string | null;
  sku: string | null;
  brand: string;
  category: string | null;
  allCodes: string[];  // Tutti i codici da cercare
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export async function findProductImage(
  title: string,
  vendor: string,
  sku: string | null,
  barcode: string | null
): Promise<ImageAgentV4Result> {
  const startTime = Date.now();
  let searchAttempts = 0;
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return createErrorResult(title, 'Missing ANTHROPIC_API_KEY', startTime);
  }
  
  const anthropic = new Anthropic({ apiKey });
  const brand = normalizeBrand(vendor);
  
  console.log(`[ImageAgent V4] 🔍 Starting search for: ${title}`);
  
  // ===========================================
  // STEP 1: Estrai identificatori
  // ===========================================
  const identifiers = extractIdentifiers(title, brand, sku, barcode);
  console.log(`[ImageAgent V4] Identifiers: MPN=${identifiers.mpn}, EAN=${identifiers.ean}, Category=${identifiers.category}`);
  
  // ===========================================
  // STEP 2: Trova codici alternativi (Cross-Code)
  // ===========================================
  if (identifiers.mpn) {
    const altCodes = await findAlternativeCodes(anthropic, identifiers.mpn, brand);
    identifiers.allCodes = Array.from(new Set([identifiers.mpn, ...altCodes]));
    console.log(`[ImageAgent V4] All codes to search: ${identifiers.allCodes.join(', ')}`);
  }
  
  // ===========================================
  // STEP 3: Cerca su Gold Standard (con tutti i codici)
  // ===========================================
  searchAttempts++;
  const goldResult = await searchGoldStandard(
    anthropic, 
    title, 
    brand, 
    identifiers.allCodes,
    identifiers.category
  );
  
  if (goldResult.found && goldResult.imageUrl) {
    // Valida con Vision
    const isValid = await validateImage(anthropic, goldResult.imageUrl, title, brand, identifiers.mpn);
    
    if (isValid) {
      console.log(`[ImageAgent V4] ✅ Gold Standard image validated: ${goldResult.domain}`);
      return {
        success: true,
        imageUrl: goldResult.imageUrl,
        imageAlt: `${title} - ${brand}`,
        source: goldResult.domain,
        method: 'gold_standard',
        confidence: goldResult.confidence,
        alternativeCodes: identifiers.allCodes.slice(1),
        pdfSpecsFound: false,
        searchAttempts,
        totalTimeMs: Date.now() - startTime,
      };
    }
    console.log(`[ImageAgent V4] ⚠️ Gold Standard image rejected by Vision`);
  }
  
  // ===========================================
  // STEP 4: Fallback - Cerca su sito ufficiale brand
  // ===========================================
  searchAttempts++;
  const officialResult = await searchOfficialSite(
    anthropic,
    title,
    brand,
    identifiers.allCodes
  );
  
  if (officialResult.found && officialResult.imageUrl) {
    const isValid = await validateImage(anthropic, officialResult.imageUrl, title, brand, identifiers.mpn);
    
    if (isValid) {
      console.log(`[ImageAgent V4] ✅ Official site image validated: ${officialResult.domain}`);
      return {
        success: true,
        imageUrl: officialResult.imageUrl,
        imageAlt: `${title} - ${brand}`,
        source: officialResult.domain,
        method: 'official_site',
        confidence: 'high',
        alternativeCodes: identifiers.allCodes.slice(1),
        pdfSpecsFound: false,
        searchAttempts,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }
  
  // ===========================================
  // STEP 5: Fallback - Ricerca web generica
  // ===========================================
  searchAttempts++;
  const webResult = await searchWeb(
    anthropic,
    title,
    brand,
    identifiers.allCodes,
    identifiers.category
  );
  
  if (webResult.found && webResult.imageUrl) {
    // Validazione più stretta per ricerca generica
    const isValid = await validateImage(anthropic, webResult.imageUrl, title, brand, identifiers.mpn);
    
    if (isValid) {
      console.log(`[ImageAgent V4] ✅ Web search image validated: ${webResult.domain}`);
      return {
        success: true,
        imageUrl: webResult.imageUrl,
        imageAlt: `${title} - ${brand}`,
        source: webResult.domain,
        method: 'web_search',
        confidence: 'medium',
        alternativeCodes: identifiers.allCodes.slice(1),
        pdfSpecsFound: false,
        searchAttempts,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }
  
  // ===========================================
  // Nessuna immagine trovata
  // ===========================================
  console.log(`[ImageAgent V4] ❌ No valid image found after ${searchAttempts} attempts`);
  return {
    success: false,
    imageUrl: null,
    imageAlt: title,
    source: null,
    method: 'none',
    confidence: 'low',
    alternativeCodes: identifiers.allCodes.slice(1),
    pdfSpecsFound: false,
    searchAttempts,
    totalTimeMs: Date.now() - startTime,
    error: 'No valid image found',
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractIdentifiers(
  title: string, 
  brand: string, 
  sku: string | null, 
  barcode: string | null
): ProductIdentifiers {
  let mpn: string | null = null;
  let ean: string | null = null;
  let category: string | null = null;
  
  // Estrai MPN da titolo o SKU
  const mpnPatterns = [
    /\b(493\d{7})\b/,           // Milwaukee EU: 4932xxxxxxx
    /\b(48-\d{2}-\d{4})\b/,     // Milwaukee US: 48-xx-xxxx
    /\b(49-\d{2}-\d{4})\b/,     // Milwaukee US: 49-xx-xxxx
    /\b([A-Z]{1,3}\d{4,6}[A-Z]?)\b/i,  // Makita: DHP486Z, etc
  ];
  
  for (const pattern of mpnPatterns) {
    const match = title.match(pattern) || sku?.match(pattern);
    if (match) {
      mpn = match[1];
      break;
    }
  }
  
  // EAN dal barcode
  if (barcode && /^\d{13}$/.test(barcode)) {
    ean = barcode;
  }
  
  // Categoria dal titolo
  const categoryKeywords: Record<string, string[]> = {
    'portabit': ['portabit', 'bit holder', 'porta inserti', 'prolunga', 'extension'],
    'adattatore': ['adattatore', 'adapter', 'riduzione', 'raccordo'],
    'lama': ['lama', 'blade', 'ricambio', 'replacement'],
    'filtro': ['filtro', 'filter', 'manutenzione'],
    'avvitatore': ['avvitatore', 'drill', 'trapano', 'impact', 'impulsi'],
    'batteria': ['batteria', 'battery', 'akku'],
    'sega': ['sega', 'saw', 'circolare', 'reciprocating'],
    'smerigliatrice': ['smerigliatrice', 'grinder', 'flex'],
    'aspiratore': ['aspiratore', 'vacuum', 'aspirapolvere'],
    'kit': ['kit', 'set', 'combo'],
  };
  
  const titleLower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => titleLower.includes(kw))) {
      category = cat;
      break;
    }
  }
  
  // Costruisci array di tutti i codici
  const allCodes: string[] = [];
  if (mpn) allCodes.push(mpn);
  if (sku && sku !== mpn) allCodes.push(sku);
  if (ean) allCodes.push(ean);
  
  return { mpn, ean, sku, brand, category, allCodes };
}

async function findAlternativeCodes(
  anthropic: Anthropic,
  mpn: string,
  brand: string
): Promise<string[]> {
  // Pattern di conversione noti per Milwaukee
  if (brand.toLowerCase().includes('milwaukee')) {
    const altCodes: string[] = [];
    
    // EU → US conversion
    if (mpn.startsWith('4932')) {
      // 4932352406 → 48-32-4006 (pattern comune)
      const suffix = mpn.slice(-4);
      altCodes.push(`48-32-${suffix}`);
      altCodes.push(`49-32-${suffix}`);
    }
    
    // US → EU conversion
    if (mpn.startsWith('48-') || mpn.startsWith('49-')) {
      const parts = mpn.split('-');
      if (parts.length === 3) {
        altCodes.push(`4932${parts[1]}${parts[2]}`);
      }
    }
    
    if (altCodes.length > 0) {
      console.log(`[ImageAgent V4] Cross-code: ${mpn} → ${altCodes.join(', ')}`);
      return altCodes;
    }
  }
  
  // Per altri brand, usa Claude per trovare codici alternativi
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 2,
      }],
      messages: [{
        role: 'user',
        content: `Find alternative product codes for ${brand} ${mpn}.
Look for: US code, EU code, international variants.
Return ONLY a JSON array of alternative codes, e.g.: ["48-32-4006", "49-32-4006"]
If no alternatives found, return: []`,
      }],
    });
    
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const codes = JSON.parse(match[0]);
      return codes.filter((c: string) => c && c !== mpn);
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Cross-code search failed: ${e}`);
  }
  
  return [];
}

async function searchGoldStandard(
  anthropic: Anthropic,
  title: string,
  brand: string,
  codes: string[],
  category: string | null
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null; confidence: 'high' | 'medium' | 'low' }> {
  
  // Seleziona domini prioritari per brand
  const brandLower = brand.toLowerCase();
  let priorityDomains: string[] = [];
  
  if (brandLower.includes('milwaukee')) {
    priorityDomains = ['milwaukeetool.eu', 'toolstop.co.uk', 'acmetools.com', 'ohiopowertool.com'];
  } else if (brandLower.includes('makita')) {
    priorityDomains = ['makita.it', 'toolstop.co.uk', 'ffx.co.uk'];
  } else if (brandLower.includes('dewalt')) {
    priorityDomains = ['dewalt.it', 'toolstop.co.uk', 'screwfix.com'];
  } else if (brandLower.includes('bosch')) {
    priorityDomains = ['bosch-professional.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('yanmar')) {
    priorityDomains = ['yanmar.com', 'yanmarce.com'];
  } else {
    priorityDomains = [...GOLD_STANDARD_DOMAINS.uk.slice(0, 3), ...GOLD_STANDARD_DOMAINS.eu.slice(0, 2)];
  }
  
  const codesQuery = codes.slice(0, 3).map(c => `"${c}"`).join(' OR ');
  const siteQueries = priorityDomains.slice(0, 4).map(d => `site:${d}`).join(' OR ');
  
  const prompt = `Find a PROFESSIONAL product image for:
PRODUCT: ${title}
BRAND: ${brand}
CODES: ${codesQuery}
CATEGORY: ${category || 'tool accessory'}

SEARCH ON THESE TRUSTED SITES:
${priorityDomains.map((d, i) => `${i + 1}. ${d}`).join('\n')}

IMAGE REQUIREMENTS:
1. Product photo on WHITE or NEUTRAL background
2. NO watermarks
3. High resolution (min 400x400)
4. Shows EXACTLY this product type: ${category || 'accessory'}
5. Direct image URL (.jpg, .png, .webp)

Return JSON:
{
  "found": true/false,
  "imageUrl": "direct image URL",
  "domain": "source domain",
  "confidence": "high/medium/low",
  "matchedCode": "which code matched"
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
      messages: [{ role: 'user', content: prompt }],
    });
    
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    
    const jsonMatch = text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.found && result.imageUrl && !isBlockedDomain(result.imageUrl)) {
        return {
          found: true,
          imageUrl: result.imageUrl,
          domain: result.domain || extractDomain(result.imageUrl),
          confidence: result.confidence || 'medium',
        };
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Gold Standard search error: ${e}`);
  }
  
  return { found: false, imageUrl: null, domain: null, confidence: 'low' };
}

async function searchOfficialSite(
  anthropic: Anthropic,
  title: string,
  brand: string,
  codes: string[]
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null }> {
  
  const brandDomains: Record<string, string[]> = {
    'milwaukee': ['milwaukeetool.eu', 'milwaukeetool.com'],
    'makita': ['makita.it', 'makita.com'],
    'dewalt': ['dewalt.it', 'dewalt.com'],
    'bosch': ['bosch-professional.com'],
    'hilti': ['hilti.it', 'hilti.com'],
    'yanmar': ['yanmar.com', 'yanmarce.com'],
  };
  
  const brandLower = brand.toLowerCase();
  const domains = Object.entries(brandDomains).find(([b]) => brandLower.includes(b))?.[1] || [];
  
  if (domains.length === 0) {
    return { found: false, imageUrl: null, domain: null };
  }
  
  const prompt = `Find product image on OFFICIAL ${brand} website.
PRODUCT: ${title}
CODES: ${codes.slice(0, 2).join(', ')}
SEARCH ONLY ON: ${domains.join(', ')}

Return JSON:
{
  "found": true/false,
  "imageUrl": "direct image URL",
  "domain": "source domain"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      }],
      messages: [{ role: 'user', content: prompt }],
    });
    
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    
    const jsonMatch = text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.found && result.imageUrl) {
        return {
          found: true,
          imageUrl: result.imageUrl,
          domain: result.domain || extractDomain(result.imageUrl),
        };
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Official site search error: ${e}`);
  }
  
  return { found: false, imageUrl: null, domain: null };
}

async function searchWeb(
  anthropic: Anthropic,
  title: string,
  brand: string,
  codes: string[],
  category: string | null
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null }> {
  
  const searchQuery = codes[0] 
    ? `${brand} ${codes[0]} product image`
    : `${brand} ${title} product image`;
  
  const prompt = `Find a product image for: ${searchQuery}
CATEGORY: ${category || 'tool'}

AVOID these domains: amazon, ebay, aliexpress, facebook, instagram, pinterest

IMAGE REQUIREMENTS:
1. Professional product photo
2. No watermarks
3. Direct image URL

Return JSON:
{
  "found": true/false,
  "imageUrl": "direct image URL",
  "domain": "source domain"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      }],
      messages: [{ role: 'user', content: prompt }],
    });
    
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    
    const jsonMatch = text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.found && result.imageUrl && !isBlockedDomain(result.imageUrl)) {
        return {
          found: true,
          imageUrl: result.imageUrl,
          domain: result.domain || extractDomain(result.imageUrl),
        };
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Web search error: ${e}`);
  }
  
  return { found: false, imageUrl: null, domain: null };
}

async function validateImage(
  anthropic: Anthropic,
  imageUrl: string,
  expectedProduct: string,
  brand: string,
  productCode: string | null
): Promise<boolean> {
  
  // Determina se il prodotto è un ricambio/accessorio
  const titleLower = expectedProduct.toLowerCase();
  const isReplacement = titleLower.includes('ricambio') || titleLower.includes('replacement') || 
                        titleLower.includes('lame') || titleLower.includes('blade') ||
                        titleLower.includes('spare') || titleLower.includes('part');
  const isAccessory = titleLower.includes('adattatore') || titleLower.includes('adapter') ||
                      titleLower.includes('portabit') || titleLower.includes('holder') ||
                      titleLower.includes('prolunga') || titleLower.includes('extension') ||
                      titleLower.includes('filtro') || titleLower.includes('filter');
  const isPowerTool = titleLower.includes('avvitatore') || titleLower.includes('drill') ||
                      titleLower.includes('trapano') || titleLower.includes('sega') ||
                      titleLower.includes('smerigliatrice') || titleLower.includes('grinder') ||
                      titleLower.includes('aspiratore') || titleLower.includes('vacuum');
  
  // Estrai il tipo specifico di prodotto dal titolo
  let expectedType = 'product';
  if (titleLower.includes('lame') || titleLower.includes('blade')) expectedType = 'blades/cutting blades';
  else if (titleLower.includes('filtro') || titleLower.includes('filter')) expectedType = 'filter';
  else if (titleLower.includes('adattatore') || titleLower.includes('adapter')) expectedType = 'adapter';
  else if (titleLower.includes('portabit') || titleLower.includes('holder')) expectedType = 'bit holder';
  else if (titleLower.includes('prolunga') || titleLower.includes('extension')) expectedType = 'extension';
  else if (titleLower.includes('avvitatore') || titleLower.includes('drill')) expectedType = 'drill/driver';
  else if (titleLower.includes('batteria') || titleLower.includes('battery')) expectedType = 'battery';
  
  const prompt = `Analyze this product image STRICTLY.

EXPECTED PRODUCT: ${expectedProduct}
BRAND: ${brand}
PRODUCT CODE: ${productCode || 'N/A'}
EXPECTED TYPE: ${expectedType}

STRICT VALIDATION RULES:

${isReplacement ? `⚠️ THIS IS A REPLACEMENT PART/BLADE - BE VERY STRICT:
- The image MUST show ${expectedType}, NOT a complete power tool
- If the image shows a drill, driver, saw, or any complete tool → REJECT
- Only accept images showing the actual replacement part (blades, cutting heads, etc.)
- Small parts like blades should be shown isolated, not attached to a tool
` : ''}
${isAccessory ? `⚠️ THIS IS AN ACCESSORY - BE STRICT:
- The image MUST show ${expectedType}
- If the image shows a complete power tool instead of the accessory → REJECT
- Accept: adapters, bit holders, extensions shown alone
- Reject: drills, drivers, saws (unless the product IS a drill)
` : ''}
${isPowerTool ? `✓ THIS IS A POWER TOOL:
- The image should show a ${expectedType}
- Accept complete tool images
` : ''}

GENERAL CRITERIA:
1. Is this a ${brand} product? (logo, colors, style)
2. Does the image show EXACTLY a ${expectedType}?
3. Is it a professional product photo?

Return JSON:
{
  "valid": true/false,
  "reason": "brief explanation",
  "productShown": "describe what the image actually shows",
  "expectedVsActual": "expected ${expectedType}, image shows [what]"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    
    const jsonMatch = text.match(/\{[\s\S]*?"valid"[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`[ImageAgent V4] Vision validation: ${result.valid ? '✅' : '❌'} - ${result.reason}`);
      return result.valid === true;
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Vision validation error: ${e}`);
    // In caso di errore, accetta l'immagine se viene da Gold Standard
    return true;
  }
  
  return false;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function normalizeBrand(vendor: string): string {
  const brandMap: Record<string, string> = {
    'milwaukee tool': 'Milwaukee',
    'milwaukee electric tool': 'Milwaukee',
    'makita corporation': 'Makita',
    'dewalt industrial': 'DeWalt',
    'robert bosch': 'Bosch',
    'stanley black & decker': 'DeWalt',
  };
  
  const lower = vendor.toLowerCase();
  for (const [key, value] of Object.entries(brandMap)) {
    if (lower.includes(key)) return value;
  }
  
  return vendor.split(' ')[0]; // First word
}

function isBlockedDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return BLOCKED_DOMAINS.some(d => lower.includes(d));
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function createErrorResult(title: string, error: string, startTime: number): ImageAgentV4Result {
  return {
    success: false,
    imageUrl: null,
    imageAlt: title,
    source: null,
    method: 'none',
    confidence: 'low',
    alternativeCodes: [],
    pdfSpecsFound: false,
    searchAttempts: 0,
    totalTimeMs: Date.now() - startTime,
    error,
  };
}
