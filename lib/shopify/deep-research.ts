/**
 * Deep Research Module - "Investigatore Privato" Level
 * 
 * Strategie avanzate per trovare dati VERIFICATI:
 * 1. PDF Hunter - Cerca PDF tecnici come "Ground Truth"
 * 2. Cross-Code - Trova codici alternativi internazionali
 * 3. Gold Standard Domains - Cataloghi grossisti affidabili
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// =============================================================================
// GOLD STANDARD DOMAINS - Cataloghi con foto pulite e dati affidabili
// =============================================================================

export const GOLD_STANDARD_DOMAINS = {
  // UK - Foto professionali, dati accurati
  uk: [
    'toolstop.co.uk',
    'ffx.co.uk',
    'toolstation.com',
    'screwfix.com',
    'mytoolshed.co.uk',
    'powertoolworld.co.uk',
  ],
  // USA - Spesso hanno codici diversi ma foto migliori
  usa: [
    'acmetools.com',
    'toolnut.com',
    'cpooutlets.com',
    'toolbarn.com',
    'ohiopowertool.com',
    'internationaltool.com',
  ],
  // Europa - Buona qualità
  eu: [
    'svh24.de',
    'contorion.de',
    'toolnation.nl',
    'rotopino.it',
    'fixami.it',
    'manomano.it',
    'manomano.fr',
    'manomano.de',
  ],
  // Distributori ufficiali
  distributors: [
    'milwaukeetool.eu',
    'milwaukeetool.com',
    'makita.it',
    'makita.com',
    'dewalt.com',
    'bosch-professional.com',
  ],
};

// Mapping codici regionali noti
export const REGIONAL_CODE_PATTERNS: Record<string, {
  eu: RegExp;
  us: RegExp;
  description: string;
}> = {
  milwaukee: {
    eu: /\b(4932\d{6})\b/,  // EU: 4932XXXXXX
    us: /\b(48-\d{2}-\d{4})\b/,  // US: 48-XX-XXXX
    description: 'Milwaukee EU vs US codes',
  },
};

// =============================================================================
// TYPES
// =============================================================================

export interface PDFResearchResult {
  found: boolean;
  pdfUrl: string | null;
  specs: {
    field: string;
    value: string;
    unit?: string;
    page?: number;
  }[];
  source: string;
  confidence: 'ground_truth' | 'high' | 'medium';
}

export interface CrossCodeResult {
  originalCode: string;
  alternativeCodes: {
    code: string;
    region: 'EU' | 'US' | 'UK' | 'DE';
    source: string;
  }[];
  productName: string;
}

export interface GoldStandardImageResult {
  found: boolean;
  imageUrl: string | null;
  source: string;
  domain: string;
  confidence: 'high' | 'medium' | 'low';
}

// =============================================================================
// 1. PDF HUNTER - Cerca PDF tecnici come "Ground Truth"
// =============================================================================

/**
 * Cerca PDF tecnici per il prodotto - I PDF non mentono!
 * Priorità: Schede tecniche ufficiali > Manuali > Cataloghi
 */
export async function huntPDFSpecs(
  productName: string,
  brand: string,
  sku: string | null,
  mpn: string | null
): Promise<PDFResearchResult> {
  const anthropic = new Anthropic();
  
  const searchCode = mpn || sku || '';
  
  const prompt = `Sei un investigatore tecnico. CERCA PDF con specifiche tecniche per:

PRODOTTO: ${productName}
BRAND: ${brand}
CODICE: ${searchCode}

STRATEGIA DI RICERCA:
1. Cerca "filetype:pdf ${brand} ${searchCode}" 
2. Cerca "filetype:pdf ${brand} ${productName} datasheet"
3. Cerca "filetype:pdf ${brand} ${searchCode} specifications"
4. Cerca sul sito ufficiale ${brand} nella sezione download/documenti

TIPI DI PDF DA CERCARE (in ordine di priorità):
1. Scheda tecnica ufficiale (datasheet) - GROUND TRUTH
2. Manuale utente con specifiche
3. Catalogo prodotti con tabella specifiche
4. Certificazioni (CE, UL) con dati tecnici

ESTRAI DAL PDF:
- Specifiche tecniche ESATTE (coppia, voltaggio, peso, dimensioni, RPM, etc.)
- Numero di pagina dove hai trovato il dato
- URL del PDF

IMPORTANTE: I dati da PDF ufficiali sono "Ground Truth" - la fonte più affidabile.

Rispondi in JSON:
{
  "found": true/false,
  "pdfUrl": "URL del PDF trovato",
  "pdfType": "datasheet|manual|catalog|certification",
  "specs": [
    {
      "field": "Coppia massima",
      "value": "135",
      "unit": "Nm",
      "page": 2,
      "exactQuote": "Max Torque: 135 Nm"
    }
  ],
  "source": "nome del documento",
  "language": "it|en|de"
}`;

  try {
    log.info(`[PDFHunter] Searching PDFs for ${brand} ${searchCode}`);
    
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 3000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10,
      }],
      messages: [{ role: 'user', content: prompt }],
    });

    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      if (data.found && data.specs?.length > 0) {
        log.info(`[PDFHunter] ✅ Found PDF with ${data.specs.length} specs: ${data.source}`);
        
        return {
          found: true,
          pdfUrl: data.pdfUrl,
          specs: data.specs.map((s: any) => ({
            field: s.field,
            value: s.value,
            unit: s.unit,
            page: s.page,
          })),
          source: data.source || 'PDF Document',
          confidence: data.pdfType === 'datasheet' ? 'ground_truth' : 'high',
        };
      }
    }
    
    log.info(`[PDFHunter] No PDF found for ${searchCode}`);
    
  } catch (error) {
    log.error('[PDFHunter] Error:', error);
  }

  return {
    found: false,
    pdfUrl: null,
    specs: [],
    source: '',
    confidence: 'medium',
  };
}

// =============================================================================
// 2. CROSS-CODE - Trova codici alternativi internazionali
// =============================================================================

/**
 * Cerca codici alternativi per lo stesso prodotto in diverse regioni
 * Spesso l'immagine migliore è sul sito USA con un codice diverso
 */
export async function findCrossRegionalCodes(
  productName: string,
  brand: string,
  knownCode: string
): Promise<CrossCodeResult> {
  const anthropic = new Anthropic();
  const brandLower = brand.toLowerCase();
  
  const prompt = `Sei un esperto di codici prodotto internazionali. Trova i CODICI ALTERNATIVI per:

PRODOTTO: ${productName}
BRAND: ${brand}
CODICE NOTO: ${knownCode}

CONTESTO:
- I brand usano codici DIVERSI per lo stesso prodotto in diverse regioni
- Milwaukee: EU usa 4932XXXXXX, USA usa 48-XX-XXXX o 49-XX-XXXX
- Makita: EU e USA spesso hanno suffissi diversi
- Bosch: Professional vs DIY hanno codici diversi

CERCA:
1. "${brand} ${knownCode} alternative part number"
2. "${brand} ${knownCode} US equivalent"
3. "${brand} ${knownCode} cross reference"
4. Tabelle di conversione codici sul sito ufficiale

ESEMPIO Milwaukee:
- EU: 4932352406 = US: 48-32-4006 (stesso prodotto!)

Rispondi in JSON:
{
  "originalCode": "${knownCode}",
  "originalRegion": "EU|US|UK",
  "alternativeCodes": [
    {
      "code": "codice alternativo",
      "region": "US|EU|UK|DE",
      "source": "dove hai trovato questa info",
      "confidence": "high|medium"
    }
  ],
  "productName": "nome prodotto confermato",
  "notes": "eventuali note sulla conversione"
}`;

  try {
    log.info(`[CrossCode] Searching alternative codes for ${brand} ${knownCode}`);
    
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 6,
      }],
      messages: [{ role: 'user', content: prompt }],
    });

    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      if (data.alternativeCodes?.length > 0) {
        log.info(`[CrossCode] ✅ Found ${data.alternativeCodes.length} alternative codes`);
        
        return {
          originalCode: knownCode,
          alternativeCodes: data.alternativeCodes.filter((c: any) => c.confidence !== 'low'),
          productName: data.productName || productName,
        };
      }
    }
    
  } catch (error) {
    log.error('[CrossCode] Error:', error);
  }

  return {
    originalCode: knownCode,
    alternativeCodes: [],
    productName,
  };
}

// =============================================================================
// 3. GOLD STANDARD IMAGE SEARCH - Cataloghi grossisti affidabili
// =============================================================================

/**
 * Cerca immagini specificamente sui domini "Gold Standard"
 * Questi siti hanno foto pulite e professionali
 */
export async function searchGoldStandardImage(
  productName: string,
  brand: string,
  codes: string[],  // Array di codici (originale + alternativi)
  category: string | null
): Promise<GoldStandardImageResult> {
  const anthropic = new Anthropic();
  
  // Costruisci query per ogni dominio gold standard
  const allDomains = [
    ...GOLD_STANDARD_DOMAINS.distributors,
    ...GOLD_STANDARD_DOMAINS.uk,
    ...GOLD_STANDARD_DOMAINS.usa,
    ...GOLD_STANDARD_DOMAINS.eu,
  ];
  
  // Seleziona i domini più rilevanti per il brand
  const brandLower = brand.toLowerCase();
  let priorityDomains: string[] = [];
  
  if (brandLower.includes('milwaukee')) {
    priorityDomains = [
      'milwaukeetool.eu', 'milwaukeetool.com',
      'toolstop.co.uk', 'acmetools.com', 'ohiopowertool.com',
    ];
  } else if (brandLower.includes('makita')) {
    priorityDomains = [
      'makita.it', 'makita.com',
      'toolstop.co.uk', 'ffx.co.uk', 'toolnut.com',
    ];
  } else {
    priorityDomains = GOLD_STANDARD_DOMAINS.uk.slice(0, 3);
  }

  const codesString = codes.filter(Boolean).join('" OR "');
  
  const prompt = `Trova un'immagine PROFESSIONALE del prodotto su siti AFFIDABILI.

PRODOTTO: ${productName}
BRAND: ${brand}
CODICI DA CERCARE: "${codesString}"
CATEGORIA: ${category || 'accessorio'}

STRATEGIA DI RICERCA (in ordine):
${priorityDomains.map((d, i) => `${i + 1}. site:${d} "${codes[0]}"`).join('\n')}

REQUISITI IMMAGINE:
1. Foto prodotto ISOLATO su sfondo bianco/neutro
2. NESSUN watermark visibile
3. Alta risoluzione (minimo 400x400)
4. Deve mostrare ESATTAMENTE il prodotto cercato (${category || 'accessorio'})
5. URL diretto all'immagine (.jpg, .png, .webp)

IMPORTANTE:
- Questi sono siti PROFESSIONALI con foto di qualità
- Se trovi il prodotto, l'immagine sarà quasi certamente corretta
- Preferisci immagini dai siti ufficiali del brand

Rispondi JSON:
{
  "found": true/false,
  "imageUrl": "URL diretto immagine",
  "domain": "dominio fonte",
  "productPageUrl": "URL pagina prodotto",
  "confidence": "high|medium|low",
  "matchedCode": "quale codice ha matchato"
}`;

  try {
    log.info(`[GoldStandard] Searching on priority domains for ${codes[0]}`);
    
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 8,
      }],
      messages: [{ role: 'user', content: prompt }],
    });

    let result = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        result += block.text;
      }
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      if (data.found && data.imageUrl && data.confidence !== 'low') {
        log.info(`[GoldStandard] ✅ Found image on ${data.domain}: ${data.imageUrl}`);
        
        return {
          found: true,
          imageUrl: data.imageUrl,
          source: data.productPageUrl || data.domain,
          domain: data.domain,
          confidence: data.confidence,
        };
      }
    }
    
    log.info(`[GoldStandard] No image found on gold standard domains`);
    
  } catch (error) {
    log.error('[GoldStandard] Error:', error);
  }

  return {
    found: false,
    imageUrl: null,
    source: '',
    domain: '',
    confidence: 'low',
  };
}

// =============================================================================
// COMBINED DEEP RESEARCH
// =============================================================================

export interface DeepResearchResult {
  pdfSpecs: PDFResearchResult;
  crossCodes: CrossCodeResult;
  goldStandardImage: GoldStandardImageResult;
  confidenceBoost: number;  // 0-100 punti extra per confidence
}

/**
 * Esegue tutte le strategie "Investigatore Privato"
 */
export async function conductDeepResearch(
  productName: string,
  brand: string,
  sku: string | null,
  mpn: string | null,
  barcode: string | null,
  category: string | null
): Promise<DeepResearchResult> {
  log.info(`[DeepResearch] 🔍 Starting "Investigatore Privato" research for: ${productName}`);
  
  const knownCode = mpn || sku || '';
  
  // 1. PDF Hunter - Cerca Ground Truth
  log.info('[DeepResearch] Phase 1: PDF Hunter');
  const pdfSpecs = await huntPDFSpecs(productName, brand, sku, mpn);
  
  // 2. Cross-Code - Trova codici alternativi
  log.info('[DeepResearch] Phase 2: Cross-Code');
  const crossCodes = knownCode 
    ? await findCrossRegionalCodes(productName, brand, knownCode)
    : { originalCode: '', alternativeCodes: [], productName };
  
  // 3. Gold Standard Image - Cerca su siti affidabili
  log.info('[DeepResearch] Phase 3: Gold Standard Image Search');
  const allCodes = [
    knownCode,
    ...crossCodes.alternativeCodes.map(c => c.code),
  ].filter(Boolean);
  
  const goldStandardImage = await searchGoldStandardImage(
    productName,
    brand,
    allCodes.length > 0 ? allCodes : [productName],
    category
  );
  
  // Calcola boost di confidence
  let confidenceBoost = 0;
  
  if (pdfSpecs.found) {
    confidenceBoost += pdfSpecs.confidence === 'ground_truth' ? 40 : 25;
  }
  
  if (crossCodes.alternativeCodes.length > 0) {
    confidenceBoost += 10;
  }
  
  if (goldStandardImage.found) {
    confidenceBoost += goldStandardImage.confidence === 'high' ? 25 : 15;
  }
  
  log.info(`[DeepResearch] ✅ Complete. Confidence boost: +${confidenceBoost}%`);
  log.info(`  - PDF: ${pdfSpecs.found ? `Found (${pdfSpecs.specs.length} specs)` : 'Not found'}`);
  log.info(`  - Cross-codes: ${crossCodes.alternativeCodes.length} alternatives`);
  log.info(`  - Gold image: ${goldStandardImage.found ? goldStandardImage.domain : 'Not found'}`);
  
  return {
    pdfSpecs,
    crossCodes,
    goldStandardImage,
    confidenceBoost,
  };
}
