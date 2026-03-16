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
    const altCodes = await findAlternativeCodes(identifiers.mpn, brand);
    identifiers.allCodes = Array.from(new Set([identifiers.mpn, ...altCodes]));
    console.log(`[ImageAgent V4] All codes to search: ${identifiers.allCodes.join(', ')}`);
  }
  
  // ===========================================
  // STEP 3a: Direct URL search — NO API key needed
  // Constructs retailer search/product page URLs and extracts og:image directly.
  // Always runs — falls back to title when no MPN/codes are available.
  // ===========================================
  searchAttempts++;
  const directResult = await searchDirectUrls(brand, identifiers.allCodes, title);
  if (directResult.found && directResult.imageUrl) {
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

  // ===========================================
  // STEP 3b: API-based Gold Standard (SerpAPI/Exa/Google)
  // ===========================================
  searchAttempts++;
  const goldResult = await searchGoldStandard(
    title, 
    brand, 
    identifiers.allCodes,
    identifiers.category
  );
  
  if (goldResult.found && goldResult.imageUrl) {
    console.log(`[ImageAgent V4] ✅ Gold Standard (API) image found: ${goldResult.domain}`);
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
  
  // ===========================================
  // STEP 4: Fallback - Cerca su sito ufficiale brand
  // ===========================================
  searchAttempts++;
  const officialResult = await searchOfficialSite(
    title,
    brand,
    identifiers.allCodes
  );
  
  if (officialResult.found && officialResult.imageUrl) {
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
  
  // ===========================================
  // STEP 5: Fallback - Ricerca web generica
  // ===========================================
  searchAttempts++;
  const webResult = await searchWeb(
    title,
    brand,
    identifiers.allCodes,
    identifiers.category
  );
  
  if (webResult.found && webResult.imageUrl) {
    console.log(`[ImageAgent V4] ✅ Web search image found: ${webResult.domain}`);
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
  mpn: string,
  brand: string
): Promise<string[]> {
  // Pattern di conversione noti per Milwaukee
  if (brand.toLowerCase().includes('milwaukee')) {
    const altCodes: string[] = [];
    
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
    // NOTE: milwaukeetool.eu / milwaukeetool.it are intentionally excluded.
    // Those sites geo-redirect based on server IP (Vercel → Hungarian, French, etc.)
    // producing locale-specific pages that may map the EU article number to the wrong
    // product. Milwaukee images are handled reliably by searchGoldStandard via SerpAPI
    // (toolstop.co.uk, acmetools.com, ohiopowertool.com have stable Milwaukee catalogs).
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

  // Generic UK/US retailer search pages — added as a reliable free fallback.
  // When the query is an exact product code, many retailers' search pages contain only
  // one result and their og:image IS the product image (not the site logo).
  if (primaryCode) {
    candidateUrls.push(
      { url: `https://www.toolstop.co.uk/search?q=${encodeURIComponent(primaryCode)}`, domain: 'toolstop.co.uk', confidence: 'medium' },
      { url: `https://www.ffx.co.uk/tools/search?q=${encodeURIComponent(primaryCode)}`, domain: 'ffx.co.uk', confidence: 'medium' },
      { url: `https://www.powertoolworld.co.uk/catalogsearch/result/?q=${encodeURIComponent(primaryCode)}`, domain: 'powertoolworld.co.uk', confidence: 'medium' },
      { url: `https://www.acmetools.com/search?q=${encodeURIComponent(primaryCode)}`, domain: 'acmetools.com', confidence: 'medium' },
    );
  }

  // Try each URL — stop at the first valid og:image
  for (const candidate of candidateUrls) {
    try {
      const imageUrl = await fetchOgImageFromPage(candidate.url, brand, codes);
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
  } else if (brandLower.includes('yanmar')) {
    priorityDomains = ['yanmar.com', 'yanmarce.com'];
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
      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes);
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
 * Detects if an image URL likely belongs to a different product.
 * For Milwaukee-style EU codes (10-digit starting with 49), checks if the URL
 * contains a numeric code that conflicts with all of our expected product codes.
 */
function isWrongProductImage(imageUrl: string, expectedCodes: string[]): boolean {
  const lower = imageUrl.toLowerCase();
  // Look for Milwaukee-style EU article numbers (10 digits starting with 49)
  const milwaukeeCodeMatches = lower.match(/\b49\d{8}\b/g);
  if (!milwaukeeCodeMatches) return false;

  // If ANY found code matches one of our expected codes, it's the right product
  for (const found of milwaukeeCodeMatches) {
    if (expectedCodes.some(c => c.toLowerCase().includes(found) || found.includes(c.toLowerCase()))) {
      return false;
    }
  }
  // All found codes are different from ours — likely wrong product
  console.log(`[ImageAgent V4] Cross-code mismatch: image has ${milwaukeeCodeMatches}, expected ${expectedCodes}`);
  return true;
}

/**
 * Fetches a product page HTML and extracts the og:image (or twitter:image) meta tag.
 *
 * og:image is the canonical product image set by the retailer for social sharing —
 * it is always the main product image, never a logo or placeholder.
 * Reads only the first 50KB of the response (the <head> is always near the top).
 *
 * Returns null if the fetch fails, times out, or no valid image is found.
 */
async function fetchOgImageFromPage(
  pageUrl: string,
  brand: string,
  codes: string[]
): Promise<string | null> {
  // If the URL itself is already a direct image, use it
  if (/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(pageUrl)) {
    return isValidImageUrl(pageUrl) ? pageUrl : null;
  }

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

    // 1. og:image — highest priority (canonical product image)
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const url = maximizeImageUrl(decodeHtmlEntities(ogMatch[1].trim()));
      if (isValidImageUrl(url)) return url;
    }

    // 2. twitter:image — same purpose, equally reliable
    const twitterMatch =
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twitterMatch?.[1]) {
      const url = maximizeImageUrl(decodeHtmlEntities(twitterMatch[1].trim()));
      if (isValidImageUrl(url)) return url;
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
    'yanmar': ['yanmar.com', 'yanmarce.com'],
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
      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes);
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
    ? `${brand} ${codes[0]} product image site:toolstop.co.uk OR site:ffx.co.uk OR site:screwfix.com OR site:acmetools.com OR site:rotopino.it`
    : `${brand} ${title} product image site:toolstop.co.uk OR site:ffx.co.uk OR site:acmetools.com`;

  try {
    // STEP A: Direct image search — restricted to trusted domains only
    const imageResults = await searchProductImages(searchQuery, undefined, 5);

    for (const imgResult of imageResults) {
      if (isBlockedDomain(imgResult.imageUrl)) continue;
      if (!isValidImageUrl(imgResult.imageUrl)) continue;
      if (!isTrustedDomain(imgResult.imageUrl)) continue; // reject random sites
      if (isWrongProductImage(imgResult.imageUrl, codes)) continue;
      console.log(`[ImageAgent V4] Web image search hit: ${imgResult.imageUrl}`);
      return {
        found: true,
        imageUrl: imgResult.imageUrl,
        domain: imgResult.domain,
      };
    }

    // STEP B: Web search + og:image extraction — only from trusted domains
    const searchResults = await performWebSearch(searchQuery, undefined, { maxResults: 10 });
    const validResults = searchResults.filter(r =>
      !isBlockedDomain(r.link) && isTrustedDomain(r.link)
    );

    for (const result of validResults) {
      const imageUrl = await fetchOgImageFromPage(result.link, brand, codes);
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

