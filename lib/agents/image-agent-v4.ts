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
import { performWebSearch } from '@/lib/shopify/search-client';

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
  // STEP 3: Cerca su Gold Standard (con tutti i codici)
  // ===========================================
  searchAttempts++;
  const goldResult = await searchGoldStandard(
    title, 
    brand, 
    identifiers.allCodes,
    identifiers.category
  );
  
  if (goldResult.found && goldResult.imageUrl) {
    console.log(`[ImageAgent V4] ✅ Gold Standard image found: ${goldResult.domain}`);
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
  
  // Cerca con search-client sui domini Gold Standard
  const codesQuery = codes.slice(0, 3).join(' OR ');
  const searchQuery = `${brand} ${codesQuery} product image`;
  
  try {
    const searchResults = await performWebSearch(
      searchQuery,
      priorityDomains.slice(0, 4),
      { maxResults: 10 }
    );
    
    // Filtra risultati per trovare URL immagine
    for (const result of searchResults) {
      if (isBlockedDomain(result.link)) continue;
      
      // Cerca URL immagine nel link o snippet
      const imageUrl = await extractImageUrlFromPage(result.link, title, brand, codes);
      if (imageUrl) {
        const domain = extractDomain(result.link);
        const isOfficialDomain = GOLD_STANDARD_DOMAINS.official.some(d => domain.includes(d));
        
        return {
          found: true,
          imageUrl,
          domain,
          confidence: isOfficialDomain ? 'high' : 'medium',
        };
      }
    }
    
    // Se non troviamo URL immagine diretti, usa Gemini per analizzare i risultati
    if (searchResults.length > 0) {
      const resultsSummary = searchResults.slice(0, 5).map(r => 
        `- ${r.title}: ${r.link} (${r.snippet})`
      ).join('\n');
      
      const aiResult = await generateTextSafe({
        system: 'You are an expert at finding product images from search results. Return ONLY valid JSON.',
        prompt: `From these search results, find the best direct image URL for: ${brand} ${codes[0] || title}

SEARCH RESULTS:
${resultsSummary}

RULES:
1. The image URL must end in .jpg, .png, or .webp
2. Prefer official brand sites and trusted retailers
3. NO Amazon, eBay, or social media images

Return JSON:
{
  "found": true/false,
  "imageUrl": "direct image URL or null",
  "domain": "source domain",
  "confidence": "high/medium/low"
}`,
        maxTokens: 500,
        temperature: 0.2,
        useLiteModel: true,
      });
      
      const jsonMatch = aiResult.text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.found && parsed.imageUrl && !isBlockedDomain(parsed.imageUrl)) {
          return {
            found: true,
            imageUrl: parsed.imageUrl,
            domain: parsed.domain || extractDomain(parsed.imageUrl),
            confidence: parsed.confidence || 'medium',
          };
        }
      }
    }
  } catch (e) {
    console.log(`[ImageAgent V4] Gold Standard search error: ${e}`);
  }
  
  return { found: false, imageUrl: null, domain: null, confidence: 'low' };
}

/**
 * Try to extract a direct image URL from a product page URL.
 * Uses common patterns for known e-commerce sites.
 */
async function extractImageUrlFromPage(
  pageUrl: string,
  title: string,
  brand: string,
  codes: string[]
): Promise<string | null> {
  // Check if the URL itself is an image
  if (/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(pageUrl)) {
    return pageUrl;
  }
  
  // Known image URL patterns for Gold Standard domains
  const domain = extractDomain(pageUrl);
  
  // For toolstop.co.uk - images often at /images/products/
  if (domain.includes('toolstop')) {
    const codeMatch = codes.find(c => pageUrl.toLowerCase().includes(c.toLowerCase()));
    if (codeMatch) {
      return `https://www.toolstop.co.uk/media/catalog/product/cache/image/${codeMatch.toLowerCase()}.jpg`;
    }
  }
  
  return null;
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
  
  const searchQuery = `${brand} ${codes.slice(0, 2).join(' ')} product`;
  
  try {
    const searchResults = await performWebSearch(searchQuery, domains, { maxResults: 5 });
    
    for (const result of searchResults) {
      const imageUrl = await extractImageUrlFromPage(result.link, title, brand, codes);
      if (imageUrl) {
        return {
          found: true,
          imageUrl,
          domain: extractDomain(result.link),
        };
      }
    }
    
    // Use Gemini to analyze results
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
        if (parsed.found && parsed.imageUrl) {
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

async function searchWeb(
  title: string,
  brand: string,
  codes: string[],
  category: string | null
): Promise<{ found: boolean; imageUrl: string | null; domain: string | null }> {
  
  const searchQuery = codes[0] 
    ? `${brand} ${codes[0]} product image`
    : `${brand} ${title} product image`;
  
  try {
    const searchResults = await performWebSearch(searchQuery, undefined, { maxResults: 10 });
    
    // Filter out blocked domains
    const validResults = searchResults.filter(r => !isBlockedDomain(r.link));
    
    for (const result of validResults) {
      const imageUrl = await extractImageUrlFromPage(result.link, title, brand, codes);
      if (imageUrl) {
        return {
          found: true,
          imageUrl,
          domain: extractDomain(result.link),
        };
      }
    }
    
    // Use Gemini to find image URLs from results
    if (validResults.length > 0) {
      const resultsSummary = validResults.slice(0, 5).map(r => 
        `- ${r.title}: ${r.link} (${r.snippet})`
      ).join('\n');
      
      const aiResult = await generateTextSafe({
        system: 'Find direct product image URLs from search results. Avoid Amazon, eBay, social media. Return ONLY valid JSON.',
        prompt: `Find product image for ${brand} ${codes[0] || title} from:
${resultsSummary}

Return JSON: {"found": true/false, "imageUrl": "direct .jpg/.png/.webp URL", "domain": "domain"}`,
        maxTokens: 500,
        temperature: 0.2,
        useLiteModel: true,
      });
      
      const jsonMatch = aiResult.text.match(/\{[\s\S]*?"found"[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.found && parsed.imageUrl && !isBlockedDomain(parsed.imageUrl)) {
          return {
            found: true,
            imageUrl: parsed.imageUrl,
            domain: parsed.domain || extractDomain(parsed.imageUrl),
          };
        }
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
