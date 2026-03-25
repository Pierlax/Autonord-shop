/**
 * ImageAgent V4 - Unified Deep Research + Image Discovery
 * 
 * Un unico agente efficiente che:
 * 1. PDF Hunter - Cerca datasheet per specifiche (opzionale, per confidence)
 * 2. Cross-Code - Trova codici alternativi internazionali
 * 3. Gold Standard Search - Cerca su cataloghi affidabili
 * 4. Vision Validation - Valida l'immagine trovata
 * 
 * AI Engine: Google Gemini via ai-client.ts (rate-limited, auto-retry)
 * Web Search: via search-client.ts (SerpAPI/Exa/Google)
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { performWebSearch, searchProductImages } from '@/lib/shopify/search-client';
import { cachedGeneric } from '@/lib/shopify/rag-cache';

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
    'metabo.com', 'metabo.it',
    'hikoki-powertools.it', 'hikoki-powertools.com',
    'hilti.com', 'hilti.it',
    'festool.it', 'festool.com',
  ],
  // UK - Foto professionali eccellenti
  uk: [
    'toolstop.co.uk',
    'ffx.co.uk',
    'screwfix.com',
    'toolstation.com',
    'powertoolworld.co.uk',
    'kelvinpowertools.com',
    'lawson-his.co.uk',
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
    'totalutensili.it',
    'toolshopitalia.it',
    'utensileriaonline.it',
    'fershop.eu',
    'contorion.de',
    'svh24.de',
    'toolnation.nl',
  ],
};

const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'aliexpress.',
  'facebook.', 'instagram.', 'pinterest.', 'twitter.', 'youtube.',
  'tiktok.', 'reddit.', 'wish.com',
  // misterworker.com uses a generic placeholder image (chain-0.jpg) for products
  // that lack proper photos — this causes wrong images to be uploaded.
  'misterworker.com',
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

/**
 * Generates a deterministic cache key for a product image search.
 * Same djb2 algorithm used by rag-cache.ts.
 */
function generateImageCacheKey(title: string, vendor: string, sku: string | null, barcode: string | null): string {
  const input = `${title}|${vendor}|${sku || ''}|${barcode || ''}`.toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cached version of findProductImage.
 * Results are stored for 7 days (same TTL as RAG image intent).
 * On cache hit, skips all HTTP requests entirely.
 */
export async function findProductImage(
  title: string,
  vendor: string,
  sku: string | null,
  barcode: string | null
): Promise<ImageAgentV4Result> {
  const cacheKey = generateImageCacheKey(title, vendor, sku, barcode);
  return cachedGeneric<ImageAgentV4Result>(
    cacheKey,
    () => findProductImageUncached(title, vendor, sku, barcode),
  );
}

async function findProductImageUncached(
  title: string,
  vendor: string,
  sku: string | null,
  barcode: string | null
): Promise<ImageAgentV4Result> {
  const startTime = Date.now();
  let searchAttempts = 0;

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
    const altCodes = await findAlternativeCodes(identifiers.mpn, brand, title);
    identifiers.allCodes = Array.from(new Set([identifiers.mpn, ...altCodes]));
    console.log(`[ImageAgent V4] All codes to search: ${identifiers.allCodes.join(', ')}`);
  }

  // ===========================================
  // STEP 3: GCS Direct Image Search (STRATEGIA PRIMARIA)
  // Query esatta "[brand] [codice]" site:[dominio-affidabile]
  // searchType=image → URL diretto, niente og:image parsing
  // ===========================================
  searchAttempts++;
  const gcsResult = await searchGCSImageDirect(title, brand, identifiers.allCodes, identifiers.category);
  if (gcsResult.found && gcsResult.imageUrl) {
    // Vision validation solo per medium confidence (high = codice esatto in URL)
    const visionOk = gcsResult.confidence === 'high'
      || await validateImageWithVision(gcsResult.imageUrl, title, brand);
    if (visionOk) {
      console.log(`[ImageAgent V4] ✅ GCS direct strategy: ${gcsResult.domain} (vision=${gcsResult.confidence === 'high' ? 'skipped' : 'ok'})`);
      return {
        success: true,
        imageUrl: gcsResult.imageUrl,
        imageAlt: `${title} - ${brand}`,
        source: gcsResult.domain,
        method: 'gold_standard',
        confidence: gcsResult.confidence,
        alternativeCodes: identifiers.allCodes.slice(1),
        pdfSpecsFound: false,
        searchAttempts,
        totalTimeMs: Date.now() - startTime,
      };
    }
    console.log(`[ImageAgent V4] GCS image rejected by vision validation, continuing...`);
  }

  // ===========================================
  // STEP 4: Direct URL search — NO API key needed (fallback)
  // Costruisce URL di pagina-prodotto noti e ne fa parsing og:image.
  // Funziona anche senza Google CSE configurato.
  // ===========================================
  searchAttempts++;
  const directResult = await searchDirectUrls(brand, identifiers.allCodes, title);
  if (directResult.found && directResult.imageUrl && await isImageAccessible(directResult.imageUrl)) {
    const visionOk = directResult.confidence === 'high'
      || await validateImageWithVision(directResult.imageUrl, title, brand);
    if (visionOk) {
      console.log(`[ImageAgent V4] ✅ Direct URL strategy succeeded: ${directResult.domain}`);
      return {
        success: true,
        imageUrl: directResult.imageUrl,
        imageAlt: `${title} - ${brand}`,
        source: directResult.domain,
        method: 'gold_standard',
        confidence: directResult.confidence,
        alternativeCodes: identifiers.allCodes.slice(1),
        pdfSpecsFound: false,
        searchAttempts,
        totalTimeMs: Date.now() - startTime,
      };
    }
    console.log(`[ImageAgent V4] Direct URL image rejected by vision validation, continuing...`);
  }

  // ===========================================
  // STEP 5: Sito ufficiale brand (fallback)
  // ===========================================
  searchAttempts++;
  const officialResult = await searchOfficialSite(
    title,
    brand,
    identifiers.allCodes
  );

  if (officialResult.found && officialResult.imageUrl && await isImageAccessible(officialResult.imageUrl)) {
    // Official site — always vision-validate (high trust domain but can still be wrong product page)
    const visionOk = await validateImageWithVision(officialResult.imageUrl, title, brand);
    if (visionOk) {
      console.log(`[ImageAgent V4] ✅ Official site image found: ${officialResult.domain}`);
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
    console.log(`[ImageAgent V4] Official site image rejected by vision validation, continuing...`);
  }

  // ===========================================
  // STEP 6: Gemini knowledge-based URL (last resort)
  // ===========================================
  searchAttempts++;
  const geminiResult = await findImageViaGeminiKnowledge(title, brand, identifiers.allCodes);
  if (geminiResult.found && geminiResult.imageUrl && await isImageAccessible(geminiResult.imageUrl)) {
    console.log(`[ImageAgent V4] ✅ Gemini knowledge image found: ${geminiResult.domain}`);
    return {
      success: true,
      imageUrl: geminiResult.imageUrl,
      imageAlt: `${title} - ${brand}`,
      source: geminiResult.domain,
      method: 'web_search',
      confidence: 'medium',
      alternativeCodes: identifiers.allCodes.slice(1),
      pdfSpecsFound: false,
      searchAttempts,
      totalTimeMs: Date.now() - startTime,
    };
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
// STEP 3: GCS DIRECT IMAGE SEARCH — STRATEGIA PRIMARIA
// =============================================================================

/**
 * Strategia primaria di ricerca immagini via Google Custom Search searchType=image.
 *
 * Query esatta: `"Brand" "Codice"` → Google restituisce URL diretti di immagini
 * dal dominio filtrato, senza dover parsare og:image da pagine HTML.
 *
 * Domini selezionati per brand: solo retailer con CDN puliti e senza geo-redirect.
 * milwaukeetool.eu ESCLUSO: Vercel viene geo-reindirizzato a Ungheria/Francia.
 *
 * Fallback a Bing image scraping se Google CSE non è configurato.
 */
async function searchGCSImageDirect(
  title: string,
  brand: string,
  codes: string[],
  _category: string | null
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null; confidence: 'high' | 'medium' | 'low' }> {

  // Domini con CDN affidabili per brand — niente geo-redirect, niente listing pages
  const brandLower = brand.toLowerCase();
  let imageDomains: string[];

  if (brandLower.includes('milwaukee')) {
    // milwaukeetool.eu/.it ESCLUSI — geo-redirect (Vercel → Ungheria/Francia)
    // EU retailers (rotopino, fixami, contorion) stock EU article numbers (49xxxxxxxx)
    imageDomains = [
      'toolstop.co.uk', 'ffx.co.uk',          // UK — great catalog photos
      'rotopino.it', 'fixami.it',              // IT EU — stock EU codes
      'contorion.de', 'svh24.de',              // DE EU — stock EU codes
      'acmetools.com', 'ohiopowertool.com',    // US — for US codes
    ];
  } else if (brandLower.includes('makita')) {
    imageDomains = ['makita.it', 'makita.com', 'toolstop.co.uk', 'ffx.co.uk'];
  } else if (brandLower.includes('dewalt')) {
    imageDomains = ['dewalt.it', 'dewalt.com', 'toolstop.co.uk', 'screwfix.com'];
  } else if (brandLower.includes('bosch')) {
    imageDomains = ['bosch-professional.com', 'toolstop.co.uk', 'screwfix.com'];
  } else if (brandLower.includes('hilti')) {
    imageDomains = ['hilti.it', 'hilti.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('metabo')) {
    imageDomains = ['metabo.it', 'metabo.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('hikoki') || brandLower.includes('hitachi')) {
    imageDomains = ['hikoki-powertools.it', 'hikoki-powertools.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('festool')) {
    imageDomains = ['festool.it', 'festool.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('husqvarna')) {
    imageDomains = ['husqvarna.it', 'husqvarna.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('yanmar')) {
    imageDomains = ['macchineescavatori.it', 'edilatlas.it', 'imer.it'];
  } else if (brandLower.includes('imer')) {
    imageDomains = ['imer.it', 'edilportale.com'];
  } else if (brandLower.includes('montolit')) {
    imageDomains = ['montolit.com', 'totalutensili.it'];
  } else if (brandLower.includes('nilfisk')) {
    imageDomains = ['nilfisk.it', 'nilfisk.com'];
  } else {
    imageDomains = ['toolstop.co.uk', 'ffx.co.uk', 'acmetools.com', 'ohiopowertool.com'];
  }

  const primaryCode = codes[0];

  // Build queries — ordered from most precise to most permissive.
  // 1. Exact EU/US code in quotes → guaranteed product match when code appears in URL
  // 2. Second code (e.g. US code derived from EU)
  // 3. Title-based → works when EU code doesn't appear on UK/US retailer pages
  const queries: string[] = [];
  if (primaryCode) {
    queries.push(`"${brand}" "${primaryCode}"`);
    if (codes[1]) queries.push(`"${brand}" "${codes[1]}"`);
  }

  // Milwaukee model code (e.g. FBJS-0X, M18CHX, M18CCES) appears directly in the title
  // and is a reliable image search signal — better than the EU article number.
  // Pattern: 2+ uppercase letters + optional digits + optional dash + suffix
  const milwaukeeModelMatch = title.match(/\b((?:M1[28]|M28)\s*[A-Z]{2,}(?:[-]\d*[A-Z]*)*)\b/i);
  if (milwaukeeModelMatch && brand.toLowerCase().includes('milwaukee')) {
    const modelCode = milwaukeeModelMatch[1].replace(/\s+/, '');  // "M18 FBJS-0X" → "M18FBJS-0X"
    queries.push(`"${brand}" "${modelCode}"`);
    // Also search without variant suffix (-0X, -502X) — finds all variants of the same tool
    const baseModel = modelCode.replace(/-\d*[A-Z]*$/, '');  // "M18FBJS-0X" → "M18FBJS"
    if (baseModel !== modelCode) queries.push(`"${brand}" "${baseModel}"`);
  }

  // Generic title-based fallback (broader, no quotes)
  const titleWords = title
    .replace(new RegExp(brand, 'gi'), '')
    .split(/[\s\-\/,]+/)
    .filter(w => w.length >= 3 && !/^(per|con|the|and|kit|set|pro|new|da|di|il|la|le)$/i.test(w))
    .slice(0, 4);
  queries.push(`${brand} ${titleWords.join(' ')}`);

  for (const query of queries) {
    try {
      const imageResults = await searchProductImages(query, imageDomains.slice(0, 4), 5);

      for (const imgResult of imageResults) {
        if (isBlockedDomain(imgResult.imageUrl)) continue;
        if (!isValidImageUrl(imgResult.imageUrl)) continue;
        if (isWrongProductImage(imgResult.imageUrl, codes)) continue;

        // Scarta immagini troppo piccole (thumbnail) quando le dimensioni sono note
        if (imgResult.width && imgResult.width < 300) continue;
        if (imgResult.height && imgResult.height < 300) continue;

        // Scarta immagini da pagine editoriali (blog, news)
        const urlLower = imgResult.imageUrl.toLowerCase();
        if (
          urlLower.includes('/blog/') || urlLower.includes('/news/') ||
          urlLower.includes('/post/') || urlLower.includes('/wp-content/uploads/')
        ) continue;

        // Verifica che l'URL risponda effettivamente come immagine
        if (!(await validateImageDownloadable(imgResult.imageUrl))) continue;

        const isOfficial = GOLD_STANDARD_DOMAINS.official.some(d => imgResult.domain.includes(d));
        console.log(`[ImageAgent V4] ✅ GCS direct: ${imgResult.imageUrl.substring(0, 100)} (${imgResult.domain})`);
        return {
          found: true,
          imageUrl: maximizeImageUrl(imgResult.imageUrl),
          domain: imgResult.domain,
          confidence: isOfficial ? 'high' : 'medium',
        };
      }
    } catch (e) {
      console.log(`[ImageAgent V4] GCS image search error for "${query}": ${e}`);
    }
  }

  return { found: false, imageUrl: null, domain: null, confidence: 'low' };
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
    /\b(493\d{7})\b/,                            // Milwaukee EU numeric: 4932471068
    /\b(48-\d{2}-\d{4})\b/,                      // Milwaukee US: 48-32-4006
    /\b(49-\d{2}-\d{4})\b/,                      // Milwaukee US: 49-32-4006
    /\b((?:M12|M18|M28)\s*[A-Z]{2,}[A-Z0-9\-]*)/i,  // Milwaukee model: M12 FCIWF12G3-0, M18 FPD2
    /\b([A-Z]{2,4}\d{3,6}[A-Z]{0,2})\b/i,       // Makita/DeWalt: DHP486Z, DCD796, GBH2-28
    /\b([A-Z]{1,3}\d{4,6}[A-Z]?)\b/i,           // Generic: legacy fallback
  ];

  for (const pattern of mpnPatterns) {
    const match = title.match(pattern) || sku?.match(pattern);
    if (match) {
      mpn = match[1].trim();
      break;
    }
  }
  
  // EAN dal barcode
  if (barcode && /^\d{13}$/.test(barcode)) {
    ean = barcode;
  }
  
  // Categoria dal titolo
  const categoryKeywords: Record<string, string[]> = {
    // Power tools
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
    // Construction & heavy equipment
    'piastra vibrante': ['piastra vibrante', 'vibratory plate', 'compattatore', 'compactor'],
    'betoniera': ['betoniera', 'concrete mixer', 'miscelatore', 'miscelatura'],
    'tagliapiastrelle': ['tagliapiastrelle', 'tile cutter', 'tagliatrice piastrelle', 'taglio piastrelle'],
    'generatore': ['generatore', 'gruppo elettrogeno', 'generator', 'genset'],
    'miniescavatore': ['miniescavatore', 'mini escavatore', 'minipala', 'micro escavatore'],
    'benna': ['benna', 'bucket', 'benna escavatore', 'benna demolitrice', 'pinza'],
    'motosega': ['motosega', 'chainsaw', 'motosega a scoppio'],
    'idropulitrice': ['idropulitrice', 'pressure washer', 'lavapavimenti'],
    'pompa': ['pompa', 'pump', 'pompa calce', 'intonacatrice'],
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
  mpn: string,
  brand: string,
  title: string = ''
): Promise<string[]> {
  // Pattern di conversione noti per Milwaukee
  if (brand.toLowerCase().includes('milwaukee')) {
    const altCodes: string[] = [];

    // ---------------------------------------------------------------------
    // Milwaukee battery US-code extraction from product title
    // EU article numbers (4932xxxxxx) have NO mathematical relationship to
    // the customer-facing US codes (48-11-xxxx). Instead, derive the US
    // code from the platform (M18/M12) + capacity visible in the title.
    //
    // Known US battery codes:
    //   M18: 48-11-18{cap*10 padded 2 digits}
    //        e.g. 2Ah→1820, 3Ah→1828*, 4Ah→1840, 5Ah→1850, 6Ah→1860, 8Ah→1880
    //             *48-11-1828 for 3Ah Compact; 48-11-1830 for 3Ah High-Demand
    //   M12: 48-11-24{cap*10 padded 2 digits}
    //        e.g. 2Ah→2420, 4Ah→2440, 6Ah→2460
    // ---------------------------------------------------------------------
    const batteryCapMatch = title.match(/\b(M18|M12)\b.*?(\d+(?:\.\d+)?)\s*Ah/i);
    if (batteryCapMatch) {
      const platform = batteryCapMatch[1].toUpperCase(); // 'M18' or 'M12'
      const cap = parseFloat(batteryCapMatch[2]);
      const capStr = Math.round(cap * 10).toString().padStart(2, '0');
      if (platform === 'M18') {
        altCodes.push(`48-11-18${capStr}`);
      } else if (platform === 'M12') {
        altCodes.push(`48-11-24${capStr}`);
      }
      console.log(`[ImageAgent V4] Battery cross-code: ${platform} ${cap}Ah → ${altCodes[altCodes.length - 1]}`);
    }

    // Generic EU → US last-4-digits pattern for accessories (e.g. 4932xxxxxx → 48-32-xxxx)
    // Only used when no battery-specific code was found above.
    if (altCodes.length === 0 && mpn.startsWith('4932')) {
      const suffix = mpn.slice(-4);
      altCodes.push(`48-32-${suffix}`);
    }

    // US → EU: reconstruct EU-style article number
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
  
  // Per altri brand, usa Gemini per trovare codici alternativi
  try {
    const result = await generateTextSafe({
      system: 'You are a product code expert for professional power tools. Return ONLY valid JSON.',
      prompt: `Find alternative product codes for ${brand} ${mpn}.
Look for: US code, EU code, international variants.
Return ONLY a JSON array of alternative codes, e.g.: ["48-32-4006", "49-32-4006"]
If no alternatives found, return: []`,
      maxTokens: 500,
      temperature: 0.2,
      useLiteModel: true,
    });
    
    const match = result.text.match(/\[[\s\S]*?\]/);
    if (match) {
      const codes = JSON.parse(match[0]);
      return codes.filter((c: string) => c && c !== mpn);
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Cross-code search failed: ${e}`);
  }
  
  return [];
}

/**
 * Direct URL search — NO API key required.
 *
 * Constructs known search page URLs for Gold Standard retailers using the
 * product MPN/SKU, then fetches each page and extracts the og:image.
 * This is the primary strategy and works completely free of charge.
 *
 * URL patterns tested and confirmed for each retailer:
 *   toolstop.co.uk        → /search/?q={code}
 *   ffx.co.uk             → /tools/search?q={code}
 *   powertoolworld.co.uk  → /catalogsearch/result/?q={code}
 *   screwfix.com          → /search?query={code}
 *   toolstation.com       → /search?query={code}
 *   rotopino.it           → /search?q={code}
 *   milwaukeetool.eu      → /Products/{code}  (direct product page)
 *   makita.it             → /products/{code}  (direct product page)
 *   makita.com            → /products/{code}
 */
async function searchDirectUrls(
  brand: string,
  codes: string[],
  title: string
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null; confidence: 'high' | 'medium' | 'low' }> {
  if (codes.length === 0 && !title) return { found: false, imageUrl: null, domain: null, confidence: 'low' };

  const brandLower = brand.toLowerCase();
  const primaryCode = codes[0] || '';
  const allCodes = codes.slice(0, 3);
  const searchTerm = primaryCode || encodeURIComponent(title.substring(0, 60));

  // Build candidate URLs per brand + generic retailers
  const candidateUrls: Array<{ url: string; domain: string; confidence: 'high' | 'medium' | 'low' }> = [];

  // Brand-specific direct product pages (highest quality images)
  if (brandLower.includes('milwaukee')) {
    // milwaukeetool.eu/.it excluded — geo-redirect from Vercel IPs.
    // US retailers have predictable product page URLs keyed to the US code (48-xx-xxxx).
    // EU retailers have searchable catalogs that stock EU codes (49xxxxxxxx).
    for (const code of allCodes) {
      const isUsCode = /^4[89]-\d{2}-\d{4}$/.test(code);
      if (isUsCode) {
        // acmetools and ohiopowertool have direct product URLs keyed to US codes.
        // Use 'medium' so vision validation always runs — the US code may have been
        // AI-generated and may not match the actual product.
        candidateUrls.push(
          { url: `https://www.acmetools.com/${code.toLowerCase()}`, domain: 'acmetools.com', confidence: 'medium' },
          { url: `https://www.ohiopowertool.com/milwaukee-tools-${code.toLowerCase()}`, domain: 'ohiopowertool.com', confidence: 'medium' },
          { url: `https://www.toolstop.co.uk/search?q=${encodeURIComponent(code)}`, domain: 'toolstop.co.uk', confidence: 'medium' },
          { url: `https://www.ffx.co.uk/tools/search?q=${encodeURIComponent(code)}`, domain: 'ffx.co.uk', confidence: 'medium' },
        );
      } else if (/^4\d{9}$/.test(code)) {
        // EU code (10 digits starting with 4) — EU retailers
        candidateUrls.push(
          { url: `https://www.rotopino.it/search?q=${encodeURIComponent(code)}`, domain: 'rotopino.it', confidence: 'medium' },
          { url: `https://www.fixami.it/search?query=${encodeURIComponent(code)}`, domain: 'fixami.it', confidence: 'medium' },
          { url: `https://www.contorion.de/search?q=${encodeURIComponent(code)}`, domain: 'contorion.de', confidence: 'medium' },
        );
      } else if (/^M1[28]\s*[A-Z]{2}/i.test(code)) {
        // Milwaukee model code (M18FBJS-0X, M12CHZ, etc.) — search on retailers
        candidateUrls.push(
          { url: `https://www.toolstop.co.uk/search?q=${encodeURIComponent(code)}`, domain: 'toolstop.co.uk', confidence: 'medium' },
          { url: `https://www.ffx.co.uk/tools/search?q=${encodeURIComponent(code)}`, domain: 'ffx.co.uk', confidence: 'medium' },
          { url: `https://www.acmetools.com/search?q=${encodeURIComponent(code)}`, domain: 'acmetools.com', confidence: 'medium' },
        );
      }
    }
  } else if (brandLower.includes('makita')) {
    for (const code of allCodes) {
      candidateUrls.push(
        { url: `https://www.makita.it/products/${code.toLowerCase()}`, domain: 'makita.it', confidence: 'high' },
        { url: `https://www.makita.com/en-us/product/${code.toLowerCase()}`, domain: 'makita.com', confidence: 'high' },
      );
    }
    candidateUrls.push(
      { url: `https://www.makita.it/catalogsearch/result/?q=${encodeURIComponent(primaryCode || title)}`, domain: 'makita.it', confidence: 'high' },
    );
  } else if (brandLower.includes('dewalt')) {
    candidateUrls.push(
      { url: `https://www.dewalt.it/product-search?q=${encodeURIComponent(primaryCode || title)}`, domain: 'dewalt.it', confidence: 'high' },
      { url: `https://www.dewalt.com/search#q=${encodeURIComponent(primaryCode || title)}&t=product`, domain: 'dewalt.com', confidence: 'high' },
    );
  } else if (brandLower.includes('bosch')) {
    candidateUrls.push(
      { url: `https://www.bosch-professional.com/it/it/search/${encodeURIComponent(primaryCode || title)}/`, domain: 'bosch-professional.com', confidence: 'high' },
    );
  }

  // Generic UK/US retailer search pages — reliable for power tools.
  if (primaryCode) {
    candidateUrls.push(
      { url: `https://www.toolstop.co.uk/search?q=${encodeURIComponent(primaryCode)}`, domain: 'toolstop.co.uk', confidence: 'medium' },
      { url: `https://www.ffx.co.uk/tools/search?q=${encodeURIComponent(primaryCode)}`, domain: 'ffx.co.uk', confidence: 'medium' },
      { url: `https://www.powertoolworld.co.uk/catalogsearch/result/?q=${encodeURIComponent(primaryCode)}`, domain: 'powertoolworld.co.uk', confidence: 'medium' },
      { url: `https://www.acmetools.com/search?q=${encodeURIComponent(primaryCode)}`, domain: 'acmetools.com', confidence: 'medium' },
    );
  }

  // Italian retailer search pages — best for EU/Italian brands (IMER, Husqvarna, Montolit,
  // Italian retailer search pages (rotopino, fixami, misterworker, etc.) are intentionally
  // NOT added here — search/listing pages return an og:image for whichever product happens
  // to be first in the results, not necessarily our product.
  // These domains are still searched via Google in searchWeb(), which finds direct product pages.

  // Try each URL — stop at the first valid og:image
  for (const candidate of candidateUrls) {
    try {
      const imageUrl = await fetchOgImageFromPage(candidate.url, brand, codes, title);
      if (imageUrl) {
        console.log(`[ImageAgent V4] ✅ Direct URL hit on ${candidate.domain}: ${imageUrl}`);
        return { found: true, imageUrl, domain: candidate.domain, confidence: candidate.confidence };
      }
    } catch {
      // Skip silently — the next candidate will be tried
    }
  }

  return { found: false, imageUrl: null, domain: null, confidence: 'low' };
}

async function searchGoldStandard(
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
  } else if (brandLower.includes('hilti')) {
    priorityDomains = ['hilti.it', 'hilti.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('metabo')) {
    priorityDomains = ['metabo.it', 'metabo.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('hikoki') || brandLower.includes('hitachi')) {
    priorityDomains = ['hikoki-powertools.it', 'hikoki-powertools.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('festool')) {
    priorityDomains = ['festool.it', 'festool.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('yanmar')) {
    // yanmar.it/yanmar.com block bot downloads (403) — use accessible distributors
    priorityDomains = ['macchineescavatori.it', 'imer.it', 'noleggiomacchine.it', 'edilatlas.it', 'yanmar.it'];
  } else if (brandLower.includes('cangini')) {
    priorityDomains = ['cangini.com', 'macchineescavatori.it'];
  } else if (brandLower.includes('hammer')) {
    priorityDomains = ['hammer-benne.it', 'macchineescavatori.it'];
  } else if (brandLower.includes('tecnogen')) {
    priorityDomains = ['tecnogen.it', 'generatoradvisor.com'];
  } else if (brandLower.includes('imer')) {
    priorityDomains = ['imer.it', 'edilportale.com'];
  } else if (brandLower.includes('montolit')) {
    priorityDomains = ['montolit.com', 'totalutensili.it'];
  } else if (brandLower.includes('husqvarna')) {
    priorityDomains = ['husqvarna.it', 'husqvarna.com', 'toolstop.co.uk'];
  } else if (brandLower.includes('nilfisk')) {
    priorityDomains = ['nilfisk.it', 'nilfisk.com'];
  } else if (brandLower.includes('vem') || brandLower.includes('dfsk')) {
    priorityDomains = ['vem-italia.it', 'autodoc.it'];
  } else {
    priorityDomains = [...GOLD_STANDARD_DOMAINS.uk.slice(0, 3), ...GOLD_STANDARD_DOMAINS.eu.slice(0, 2)];
  }
  
  const codeQuery = codes.slice(0, 2).join(' ');
  const imageSearchQuery = `${brand} ${codeQuery || title}`;

  try {
    // STEP A: Direct image search — returns actual .jpg/.png URLs (most reliable)
    const imageResults = await searchProductImages(
      imageSearchQuery,
      priorityDomains.slice(0, 4),
      5
    );

    for (const imgResult of imageResults) {
      if (isBlockedDomain(imgResult.imageUrl)) continue;
      if (!isValidImageUrl(imgResult.imageUrl)) continue;
      if (isWrongProductImage(imgResult.imageUrl, codes)) continue; // cross-code validation
      const isOfficialDomain = GOLD_STANDARD_DOMAINS.official.some(d => imgResult.domain.includes(d));
      console.log(`[ImageAgent V4] Gold Standard image search hit: ${imgResult.imageUrl}`);
      return {
        found: true,
        imageUrl: imgResult.imageUrl,
        domain: imgResult.domain,
        confidence: isOfficialDomain ? 'high' : 'medium',
      };
    }

    // STEP B: Web search + og:image extraction from product pages
    const pageSearchQuery = `${brand} ${codes.slice(0, 3).join(' ')} product`;
    const searchResults = await performWebSearch(
      pageSearchQuery,
      priorityDomains.slice(0, 4),
      { maxResults: 8 }
    );

    for (const result of searchResults) {
      if (isBlockedDomain(result.link)) continue;
      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes, title);
      if (imageUrl) {
        if (isWrongProductImage(imageUrl, codes)) {
          console.log(`[ImageAgent V4] Cross-code mismatch, skipping: ${imageUrl}`);
          continue;
        }
        const domain = extractDomain(result.link);
        const isOfficialDomain = GOLD_STANDARD_DOMAINS.official.some(d => domain.includes(d));
        console.log(`[ImageAgent V4] og:image extracted from ${domain}: ${imageUrl}`);
        return {
          found: true,
          imageUrl,
          domain,
          confidence: isOfficialDomain ? 'high' : 'medium',
        };
      }
    }

    // STEP C: Gemini knowledge-based URL generation — always runs as no-API fallback.
    // Gemini knows product image CDN patterns from training data and can suggest
    // real URLs for well-known brands. Each candidate is validated by HTTP fetch.
    const geminiResult = await findImageViaGeminiKnowledge(title, brand, codes);
    if (geminiResult.found && geminiResult.imageUrl) {
      return { found: true, imageUrl: geminiResult.imageUrl, domain: geminiResult.domain || 'unknown', confidence: 'medium' };
    }

  } catch (e) {
    console.log(`[ImageAgent V4] Gold Standard search error: ${e}`);
  }

  return { found: false, imageUrl: null, domain: null, confidence: 'low' };
}

/**
 * Uses Gemini's training knowledge to suggest direct product image URLs,
 * then validates each by HTTP HEAD request.
 * Works without any search API credits.
 */
async function findImageViaGeminiKnowledge(
  title: string,
  brand: string,
  codes: string[]
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null }> {
  try {
    const aiResult = await generateTextSafe({
      system: 'You are a product image expert for professional power tools. Use your training knowledge of real CDN and retailer URLs. Return ONLY valid JSON.',
      prompt: `Find the direct product image URL for this professional power tool using your training knowledge.

Brand: ${brand}
Product: ${title}
Product codes: ${codes.join(', ')}

Based on your knowledge, provide up to 4 candidate direct image URLs (.jpg, .png, or .webp) from:
- Official brand CDNs (e.g. cdn.milwaukeetool.eu, cdn.makita.it, images.dewalt.com)
- UK retailers: toolstop.co.uk, ffx.co.uk, screwfix.com, powertoolworld.co.uk
- US retailers: acmetools.com, ohiopowertool.com, toolnut.com

IMPORTANT: Provide REAL URLs you are confident exist based on your training data.
Do NOT invent URLs — only include URLs you have strong confidence about.

Return JSON:
{
  "candidates": [
    { "url": "https://example.com/path/image.jpg", "domain": "example.com", "confidence": "high/medium" }
  ]
}`,
      maxTokens: 600,
      temperature: 0.1,
      useLiteModel: false,
    });

    const jsonMatch = aiResult.text.match(/\{[\s\S]*?"candidates"[\s\S]*?\}/);
    if (!jsonMatch) return { found: false, imageUrl: null, domain: null };

    const parsed = JSON.parse(jsonMatch[0]);
    const candidates: Array<{ url: string; domain: string }> = parsed.candidates || [];

    for (const candidate of candidates) {
      if (!candidate.url || !isValidImageUrl(candidate.url)) continue;
      if (isBlockedDomain(candidate.url)) continue;
      if (isWrongProductImage(candidate.url, codes)) continue;

      try {
        const check = await fetch(candidate.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8' },
        });
        const contentType = check.headers.get('content-type') || '';
        if (check.ok && contentType.startsWith('image/')) {
          console.log(`[ImageAgent V4] ✅ Gemini knowledge image validated: ${candidate.url}`);
          return {
            found: true,
            imageUrl: candidate.url,
            domain: candidate.domain || extractDomain(candidate.url),
          };
        }
      } catch {
        // URL doesn't exist or times out — try next candidate
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Gemini knowledge search failed: ${e}`);
  }

  return { found: false, imageUrl: null, domain: null };
}

/**
 * HEAD check: verifies the image URL is actually downloadable (not bot-blocked).
 * Returns false if the server responds with 4xx or non-image content-type.
 * A true result means the staged upload will succeed.
 */
async function isImageAccessible(url: string): Promise<boolean> {
  // Quick format sanity
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.php') ||
      lower.endsWith('.js')   || lower.endsWith('.css')) return false;

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Autonord-Bot/1.0)' },
    });
    // Definitive 404/410 → skip; any other failure → fail-open
    if (res.status === 404 || res.status === 410) return false;
    const ct = res.headers.get('content-type') || '';
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream') && ct !== '') return false;
    return true;
  } catch {
    // Fail-open: CDNs often block HEAD; Shopify validates on upload
    return true;
  }
}

/**
 * Detects if an image URL likely belongs to a different product.
 *
 * Checks two Milwaukee code formats in the URL:
 *   EU format: 49xxxxxxxx  (10 digits, e.g. 4932430483)
 *   US format: 48-xx-xxxx  (e.g. 48-11-1850, 48-22-9140)
 *
 * If the URL contains a product code that does NOT match any of our expected
 * codes, the image belongs to a different product and must be rejected.
 */
function isWrongProductImage(imageUrl: string, expectedCodes: string[]): boolean {
  const lower = imageUrl.toLowerCase();

  // Normalize expected codes: strip dashes for uniform comparison
  const normalizedExpected = expectedCodes.map(c => c.toLowerCase().replace(/-/g, ''));

  // Milwaukee EU codes: 10 digits starting with 49 (e.g. 4932430483)
  const euCodes: string[] = lower.match(/(?<![0-9])49\d{8}(?![0-9])/g) ?? [];

  // Milwaukee US codes: 48-xx-xxxx or 49-xx-xxxx
  // Use digit-boundary lookahead/lookbehind to avoid partial matches
  const usCodesRaw: string[] = lower.match(/(?<![0-9])4[89]-\d{2}-\d{4}(?![0-9])/g) ?? [];
  const usCodes = usCodesRaw.map(c => c.replace(/-/g, '')); // normalize for comparison

  const allFoundNormalized = [...euCodes, ...usCodes];
  if (allFoundNormalized.length === 0) return false;

  // If ANY found code matches one of our expected codes → correct product
  for (const found of allFoundNormalized) {
    if (normalizedExpected.some(c => c.includes(found) || found.includes(c))) {
      return false;
    }
  }

  // All found codes differ from ours → wrong product
  console.log(`[ImageAgent V4] Cross-code mismatch: URL has [${[...euCodes, ...usCodesRaw].join(', ')}], expected [${expectedCodes.join(', ')}]`);
  return true;
}

/**
 * Vision validation — uses Gemini multimodal to verify the image
 * actually shows the expected product. Last line of defense against
 * visually plausible but wrong images.
 *
 * Only called for medium-confidence candidates to preserve API quota.
 * On error or timeout → returns true (assume valid, don't block pipeline).
 */
async function validateImageWithVision(
  imageUrl: string,
  productTitle: string,
  brand: string
): Promise<boolean> {
  try {
    const result = await generateTextSafe({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageUrl },
          {
            type: 'text',
            text: `Does this image show a "${productTitle}" manufactured by ${brand}?\n` +
                  `Reply with exactly one word: MATCH or NO_MATCH.`,
          },
        ],
      }],
      maxTokens: 10,
      temperature: 0.0,
      useLiteModel: true,
    });
    const answer = result.text.trim().toUpperCase();
    const valid = answer.includes('MATCH') && !answer.includes('NO_MATCH');
    if (!valid) {
      console.log(`[ImageAgent V4] Vision validation failed: "${result.text.trim()}" for ${productTitle}`);
    }
    return valid;
  } catch (err) {
    console.log(`[ImageAgent V4] Vision validation error (assuming valid): ${err}`);
    return true; // fail open — don't block the pipeline
  }
}

/**
 * Checks whether a page title indicates that the page is about the correct product.
 *
 * This prevents accepting og:image from search results pages, category pages, or
 * unrelated products returned by retailer search engines.
 *
 * Returns true  → page is plausibly about our product (accept the image).
 * Returns false → page is clearly unrelated (skip and try next candidate).
 * Returns null  → can't tell (no page title found — accept with caution).
 */
function pageMatchesProduct(
  pageTitle: string,
  brand: string,
  codes: string[],
  productTitle: string
): boolean | null {
  if (!pageTitle) return null;
  const lower = pageTitle.toLowerCase();

  // Strong positive: brand name in page title
  if (brand.length > 2 && lower.includes(brand.toLowerCase())) return true;

  // Strong positive: any product code in page title (skip 1-3 char codes — too generic)
  if (codes.some(c => c.length >= 4 && lower.includes(c.toLowerCase()))) return true;

  // Strong positive: significant word from product title (≥5 chars)
  const titleWords = productTitle.toLowerCase()
    .split(/[\s\-\/]+/)
    .filter(w => w.length >= 5 && !/^(motore|benzina|elettrico|professionale|per|con|the|and)$/i.test(w));
  if (titleWords.some(w => lower.includes(w))) return true;

  // Strong negative: page is clearly a search/category/home page
  if (/\b(search|risultati|ricerca|cerca|categoria|category|homepage|benvenuti|welcome)\b/.test(lower)) {
    return false;
  }

  // Can't determine — accept with caution
  return null;
}

/**
 * Fetches a product page HTML and extracts the og:image (or twitter:image) meta tag.
 *
 * Before returning a URL:
 * 1. Checks that the page title matches the product (rejects search results pages
 *    and unrelated products fetched by overly broad retailer searches).
 * 2. Validates the image URL is a downloadable binary (content-type: image/*).
 *
 * Returns null if the fetch fails, times out, page is wrong product, or no valid image found.
 */
async function fetchOgImageFromPage(
  pageUrl: string,
  brand: string,
  codes: string[],
  productTitle?: string
): Promise<string | null> {
  // If the URL itself is already a direct image, use it
  if (/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(pageUrl)) {
    return isValidImageUrl(pageUrl) ? pageUrl : null;
  }

  // Reject search/category/listing pages — their og:image reflects whatever product
  // happened to be first in the results, not our specific product.
  try {
    const parsed = new URL(pageUrl);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    if (
      path.includes('/search') || path.includes('/cerca') || path.includes('/ricerca') ||
      path.includes('/category') || path.includes('/categoria') || path.includes('/listing') ||
      query.includes('?q=') || query.includes('&q=') || query.includes('?query=') ||
      query.includes('search=') || query.includes('keyword=')
    ) {
      console.log(`[ImageAgent V4] Skipping search/category page: ${pageUrl.substring(0, 80)}`);
      return null;
    }
  } catch { /* invalid URL — let fetch handle it */ }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        // Identify as Googlebot so retailers don't block the request
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        // Prefer Italian/English content to avoid non-Italian locale redirects (e.g. hu.milwaukeetool.eu)
        'Accept-Language': 'it-IT,it;q=0.9,en-GB;q=0.7,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    // Stream only the first 50KB — <head> with og:image is always near the top
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    let bytesRead = 0;
    while (bytesRead < 51200) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytesRead += value.byteLength;
      // Stop reading once we have </head> — no need for the full page
      if (html.includes('</head>')) break;
    }
    reader.cancel();

    // --- Page relevance check ---
    // Extract og:title first, fall back to <title> tag
    const ogTitleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const htmlTitleMatch = html.match(/<title[^>]*>([^<]{3,120})<\/title>/i);
    const pageTitle = decodeHtmlEntities(
      (ogTitleMatch?.[1] || htmlTitleMatch?.[1] || '').trim()
    );

    if (productTitle && pageTitle) {
      const match = pageMatchesProduct(pageTitle, brand, codes, productTitle);
      if (match === false) {
        console.log(`[ImageAgent V4] Page rejected (title mismatch): "${pageTitle.substring(0, 70)}" — expected: ${brand} ${codes[0] || productTitle.substring(0, 30)}`);
        return null;
      }
    }

    // 1. og:image — highest priority (canonical product image)
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const url = maximizeImageUrl(decodeHtmlEntities(ogMatch[1].trim()));
      if (isValidImageUrl(url) && await validateImageDownloadable(url)) return url;
    }

    // 2. twitter:image — same purpose, equally reliable
    const twitterMatch =
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twitterMatch?.[1]) {
      const url = maximizeImageUrl(decodeHtmlEntities(twitterMatch[1].trim()));
      if (isValidImageUrl(url) && await validateImageDownloadable(url)) return url;
    }

    return null;
  } catch {
    // Timeout, DNS failure, or bot-blocked — silently skip this page
    return null;
  }
}

/**
 * Decodes HTML entities in URLs extracted from HTML attributes.
 * e.g. "https://example.com/img?a=1&amp;b=2" → "https://example.com/img?a=1&b=2"
 */
function decodeHtmlEntities(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Removes small resize parameters from CDN image URLs.
 * Many CDNs accept w=/h= query params to resize on-the-fly.
 * If values are small (< 400), remove them to get full resolution.
 *
 * Examples:
 *   milwaukeetool.com: ?hash=...&w=200&h=200  → strip w/h
 *   toolstop.co.uk:    ?width=265&height=265   → strip width/height
 *   makita CDN:        ?$maxi-product$          → leave unchanged
 */
function maximizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    const w = parseInt(u.searchParams.get('w') || u.searchParams.get('width') || '9999');
    const h = parseInt(u.searchParams.get('h') || u.searchParams.get('height') || '9999');
    // Only strip if the requested size is too small for a product image
    if (w < 400 || h < 400) {
      u.searchParams.delete('w');
      u.searchParams.delete('h');
      u.searchParams.delete('width');
      u.searchParams.delete('height');
      // Also remove CDN-specific resize/optimize params
      u.searchParams.delete('optimize');
      u.searchParams.delete('fit');
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Verifies that an image URL actually serves binary image data.
 * Performs a HEAD request and checks that Content-Type starts with "image/".
 * This catches bot-protection pages that return HTML with HTTP 200, which
 * would be silently accepted without this check and cause Shopify FAILED media.
 *
 * Uses a short timeout (4s) so it fails fast for blocked/slow sources.
 */
async function validateImageDownloadable(url: string): Promise<boolean> {
  // Quick format sanity — reject non-image extensions without any HTTP round-trip
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.php') ||
      lower.endsWith('.js')   || lower.endsWith('.css')) return false;

  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });
    // Definitive 404/410 → skip; any other failure → fail-open (let Shopify validate on upload)
    if (resp.status === 404 || resp.status === 410) return false;
    const ct = resp.headers.get('content-type') || '';
    // If Content-Type says it's definitely NOT an image, skip it
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream') && ct !== '') {
      console.log(`[ImageAgent V4] HEAD check: ${url.substring(0, 80)} → not image (${ct.split(';')[0]})`);
      return false;
    }
    return true;
  } catch {
    // Network error / timeout / CDN blocking HEAD → fail-open
    // Shopify will validate the URL when we try to upload it
    return true;
  }
}

/**
 * Validates that a URL points to a usable product image.
 * Rejects placeholders, logos, banners, and blocked domains.
 */
function isValidImageUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  if (isBlockedDomain(url)) return false;
  const lower = url.toLowerCase();
  // Reject SVG — almost always logos or icons, never product photos
  if (lower.endsWith('.svg') || lower.includes('.svg?')) return false;
  if (
    lower.includes('placeholder') ||
    lower.includes('no-image') ||
    lower.includes('noimage') ||
    lower.includes('default') ||
    lower.includes('/logo') ||
    lower.includes('-logo') ||
    lower.includes('_logo') ||
    lower.includes('/icon') ||
    lower.includes('-icon') ||
    lower.includes('halo') ||
    lower.includes('banner') ||
    lower.includes('sprite') ||
    // Reject social media tiles hosted on brand CDNs (e.g. /MediaLibrary/Facebook/tile.jpg)
    lower.includes('/facebook/') ||
    lower.includes('/twitter/') ||
    lower.includes('/instagram/') ||
    lower.includes('/linkedin/') ||
    lower.includes('social-tile') ||
    lower.includes('facebook-tile') ||
    lower.includes('-tile.jpg') ||
    lower.includes('-tile.png') ||
    lower.includes('-tile.webp')
  ) return false;
  // Reject locale-specific images (e.g. _hu-hu.png, -de-de.jpg, _pl-pl.webp).
  // These come from country-redirected brand sites and may show the wrong product
  // variant or carry locale-specific text overlays irrelevant for Italian e-commerce.
  const localeMarkers = [
    '-hu-hu', '_hu-hu', '-de-de', '_de-de', '-pl-pl', '_pl-pl',
    '-fr-fr', '_fr-fr', '-ru-ru', '_ru-ru', '-cs-cz', '_cs-cz',
    '-nl-nl', '_nl-nl', '-sk-sk', '_sk-sk', '-ro-ro', '_ro-ro',
    '-pt-pt', '_pt-pt', '-es-es', '_es-es', '-sv-se', '_sv-se',
  ];
  if (localeMarkers.some(m => lower.includes(m))) return false;
  // Must have a recognizable image extension
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(lower)) return false;
  return true;
}

async function searchOfficialSite(
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
    'metabo': ['metabo.it', 'metabo.com'],
    'hikoki': ['hikoki-powertools.it', 'hikoki-powertools.com'],
    'hitachi': ['hikoki-powertools.it', 'hikoki-powertools.com'],
    'festool': ['festool.it', 'festool.com'],
    'yanmar': ['yanmar.it', 'yanmar.com'],
    'cangini': ['cangini.com'],
    'hammer': ['hammer-benne.it'],
    'tmbenne': ['tmbenne.com'],
    'tecnogen': ['tecnogen.it'],
    'imer': ['imer.it'],
    'montolit': ['montolit.com'],
    'husqvarna': ['husqvarna.it', 'husqvarna.com'],
    'nilfisk': ['nilfisk.it', 'nilfisk.com'],
    'vem': ['vem-italia.it'],
    'dfsk': ['vem-italia.it'],
  };
  
  const brandLower = brand.toLowerCase();
  const domains = Object.entries(brandDomains).find(([b]) => brandLower.includes(b))?.[1] || [];
  
  if (domains.length === 0) {
    return { found: false, imageUrl: null, domain: null };
  }
  
  const codeQuery = codes.slice(0, 2).join(' ');

  try {
    // STEP A: Direct image search on official brand domains
    const imageResults = await searchProductImages(
      `${brand} ${codeQuery || title}`,
      domains,
      3
    );

    for (const imgResult of imageResults) {
      if (!isValidImageUrl(imgResult.imageUrl)) continue;
      if (isBlockedDomain(imgResult.imageUrl)) continue;
      console.log(`[ImageAgent V4] Official site image search hit: ${imgResult.imageUrl}`);
      return {
        found: true,
        imageUrl: imgResult.imageUrl,
        domain: imgResult.domain,
      };
    }

    // STEP B: Web search + og:image extraction
    const searchQuery = `${brand} ${codeQuery} product`;
    const searchResults = await performWebSearch(searchQuery, domains, { maxResults: 5 });

    for (const result of searchResults) {
      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes, title);
      if (imageUrl) {
        console.log(`[ImageAgent V4] og:image from official site ${extractDomain(result.link)}: ${imageUrl}`);
        return {
          found: true,
          imageUrl,
          domain: extractDomain(result.link),
        };
      }
    }

    // STEP C: Gemini fallback
    if (searchResults.length > 0) {
      const resultsSummary = searchResults.slice(0, 3).map(r =>
        `- ${r.title}: ${r.link}`
      ).join('\n');

      const aiResult = await generateTextSafe({
        system: 'Find the direct product image URL from these official brand pages. Return ONLY valid JSON.',
        prompt: `Find product image for ${brand} ${codes[0] || title} from these official pages:
${resultsSummary}

Return JSON: {"found": true/false, "imageUrl": "direct URL", "domain": "domain"}`,
        maxTokens: 500,
        temperature: 0.2,
        useLiteModel: true,
      });

      const jsonMatch = aiResult.text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.found && parsed.imageUrl && isValidImageUrl(parsed.imageUrl)) {
          return {
            found: true,
            imageUrl: parsed.imageUrl,
            domain: parsed.domain || extractDomain(parsed.imageUrl),
          };
        }
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Official site search error: ${e}`);
  }

  return { found: false, imageUrl: null, domain: null };
}

// Flat set of all trusted domains — images outside this list are rejected in searchWeb
const ALL_TRUSTED_DOMAINS = new Set([
  ...GOLD_STANDARD_DOMAINS.official,
  ...GOLD_STANDARD_DOMAINS.uk,
  ...GOLD_STANDARD_DOMAINS.usa,
  ...GOLD_STANDARD_DOMAINS.eu,
]);

const ALL_TRUSTED_DOMAINS_ARRAY = Array.from(ALL_TRUSTED_DOMAINS);

function isTrustedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ALL_TRUSTED_DOMAINS.has(hostname) ||
      ALL_TRUSTED_DOMAINS_ARRAY.some(d => hostname.endsWith('.' + d) || hostname === d);
  } catch {
    return false;
  }
}

async function searchWeb(
  title: string,
  brand: string,
  codes: string[],
  category: string | null
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null }> {

  const searchQuery = codes[0]
    ? `${brand} ${codes[0]} product image site:toolstop.co.uk OR site:ffx.co.uk OR site:acmetools.com OR site:rotopino.it OR site:fixami.it OR site:totalutensili.it OR site:manomano.it`
    : `${brand} ${title} product image site:toolstop.co.uk OR site:ffx.co.uk OR site:rotopino.it OR site:fixami.it OR site:manomano.it`;

  try {
    // STEP A: Direct image search — restricted to trusted domains only
    const imageResults = await searchProductImages(searchQuery, undefined, 5);

    for (const imgResult of imageResults) {
      if (isBlockedDomain(imgResult.imageUrl)) continue;
      if (!isValidImageUrl(imgResult.imageUrl)) continue;
      if (!isTrustedDomain(imgResult.imageUrl)) continue;
      if (isWrongProductImage(imgResult.imageUrl, codes)) continue;
      // Skip images from blog/news/article pages — editorial images, not product photos
      const urlLower = imgResult.imageUrl.toLowerCase();
      if (urlLower.includes('/blog/') || urlLower.includes('blog.') ||
          urlLower.includes('/news/') || urlLower.includes('/post/') ||
          urlLower.includes('/article/') || urlLower.includes('/wp-content/uploads/')) {
        console.log(`[ImageAgent V4] STEP A: skipping blog/editorial image: ${imgResult.imageUrl.substring(0, 80)}`);
        continue;
      }
      // Validate downloadability (same check as staged upload)
      if (!(await validateImageDownloadable(imgResult.imageUrl))) continue;
      console.log(`[ImageAgent V4] Web image search hit: ${imgResult.imageUrl}`);
      return {
        found: true,
        imageUrl: imgResult.imageUrl,
        domain: imgResult.domain,
      };
    }

    // STEP B: Web search + og:image extraction — only from trusted domains.
    // Strict mode: pre-filter by Google's title+snippet before fetching the page.
    // This prevents accepting og:image from unrelated products returned by broad
    // retailer searches (e.g. misterworker returning a chainsaw for a vibratory plate).
    const searchResults = await performWebSearch(searchQuery, undefined, { maxResults: 10 });
    const validResults = searchResults.filter(r =>
      !isBlockedDomain(r.link) && isTrustedDomain(r.link)
    );

    for (const result of validResults) {
      // Pre-filter: check Google's title+snippet — more reliable than the page's own og:title
      // because it reflects what Google indexed (actual product content), not JS-rendered metadata.
      const googleContext = `${result.title || ''} ${result.snippet || ''}`;
      const titleMatch = pageMatchesProduct(googleContext, brand, codes, title);
      if (titleMatch === false) {
        console.log(`[ImageAgent V4] Web result skipped (mismatch): "${result.title?.substring(0, 60)}"`);
        continue;
      }
      // For generic web search (last fallback), require positive confirmation —
      // not just absence of mismatch — to avoid accepting unrelated images.
      if (titleMatch === null) {
        console.log(`[ImageAgent V4] Web result skipped (no confirmation): "${result.title?.substring(0, 60)}"`);
        continue;
      }

      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes, title);
      if (imageUrl && !isWrongProductImage(imageUrl, codes)) {
        console.log(`[ImageAgent V4] og:image from web search ${extractDomain(result.link)}: ${imageUrl}`);
        return {
          found: true,
          imageUrl,
          domain: extractDomain(result.link),
        };
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Web search error: ${e}`);
  }

  return { found: false, imageUrl: null, domain: null };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function normalizeBrand(vendor: string): string {
  const brandMap: Record<string, string> = {
    'milwaukee tool': 'Milwaukee',
    'milwaukee electric tool': 'Milwaukee',
    'techtronic industries': 'Milwaukee', // TTI owns Milwaukee brand
    'techtronic': 'Milwaukee',
    'makita corporation': 'Makita',
    'dewalt industrial': 'DeWalt',
    'robert bosch': 'Bosch',
    'stanley black & decker': 'DeWalt',
    'imer international': 'IMER',
    'hikoki power tools': 'HiKOKI',
    'hikoki power tools italia': 'HiKOKI',
    'metabo italia': 'Metabo',
    'husqvarna italia': 'Husqvarna',
    'nilfisk italia': 'Nilfisk',
    'cangini benne': 'Cangini',
    'hammer benne': 'Hammer',
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

