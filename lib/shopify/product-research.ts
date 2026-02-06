/**
 * Product Enrichment - Research Module
 * 
 * Extracts data from official sources, reviews, and competitors
 * following the source hierarchy for reliable product information.
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;
import {
  getBrandConfig,
  getBalancedReviewQueries,
  getAccessoryQueries,
  resolveDataConflict,
  validateSpecValue,
  DataConflict,
  EnrichmentSource,
  SPEC_SOURCE_HIERARCHY,
} from './product-sources';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductResearchResult {
  productName: string;
  brand: string;
  sku: string;
  
  // Technical specs from hierarchical sources
  technicalSpecs: {
    field: string;
    value: string;
    unit?: string;
    source: string;
    priority: number;
    verified: boolean;
  }[];
  
  // Real-world feedback
  realWorldFeedback: {
    positives: string[];
    negatives: string[];
    commonProblems: string[];
    quotes: { text: string; source: string; rating?: number }[];
  };
  
  // Accessory recommendations
  accessories: {
    name: string;
    reason: string;
    source: string;
  }[];
  
  // Data quality
  conflicts: DataConflict[];
  uncertainData: string[];
  manualCheckRequired: string[];
  
  // Sources used
  sourcesUsed: EnrichmentSource[];
}

export interface ReviewAnalysis {
  positives: string[];
  negatives: string[];
  commonProblems: string[];
  quotes: { text: string; source: string; rating?: number }[];
  overallSentiment: 'positive' | 'negative' | 'mixed';
}

// =============================================================================
// MANUFACTURER DATA EXTRACTION
// =============================================================================

/**
 * Extract technical specs from manufacturer sources using Claude
 */
async function extractManufacturerSpecs(
  productName: string,
  brand: string,
  model: string
): Promise<{
  specs: ProductResearchResult['technicalSpecs'];
  source: EnrichmentSource;
}> {
  const brandConfig = getBrandConfig(brand);
  
  const prompt = `Sei un ricercatore tecnico. CERCA SUL WEB e estrai le specifiche tecniche UFFICIALI per:

Prodotto: ${productName}
Brand: ${brand}
Modello: ${model}
${brandConfig ? `Sito ufficiale da consultare: ${brandConfig.officialSite}` : ''}

ISTRUZIONI:
1. USA LA RICERCA WEB per trovare le specifiche sul sito ufficiale del produttore
2. Cerca anche su siti di distributori autorizzati se necessario
3. NON inventare dati - cerca fonti reali

IMPORTANTE:
- Se non trovi un dato, indica "N/D"
- Usa le unità di misura standard (Nm, RPM, V, Ah, kg, mm)
- Indica la fonte da cui hai estratto ogni dato

Rispondi in JSON:
{
  "specs": [
    {
      "field": "Coppia massima",
      "value": "135",
      "unit": "Nm",
      "confidence": "high|medium|low",
      "sourceUrl": "URL della fonte"
    }
  ],
  "productType": "avvitatore|trapano|smerigliatrice|altro",
  "officialUrl": "URL pagina prodotto ufficiale"
}`;

  try {
    const response = await generateTextSafe({
      prompt,
      maxTokens: 3000,
      temperature: 0.5,
    });
    const content = response.text;
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    const specs: ProductResearchResult['technicalSpecs'] = [];
    
    for (const spec of data.specs || []) {
      if (spec.value && spec.value !== 'N/D') {
        // Validate the spec value
        const validation = validateSpecValue(
          spec.field,
          spec.value,
          data.productType || 'altro'
        );
        
        specs.push({
          field: spec.field,
          value: spec.value,
          unit: spec.unit,
          source: 'Sito Ufficiale Produttore',
          priority: 10,
          verified: validation.valid && spec.confidence === 'high',
        });
      }
    }
    
    const source: EnrichmentSource = {
      name: `${brand} Official`,
      url: data.officialUrl || brandConfig?.officialSite || '',
      dataType: 'specs',
      reliability: 0.95,
      extractedData: data,
      conflicts: [],
    };
    
    return { specs, source };
    
  } catch (error) {
    log.error('[ProductResearch] Error extracting manufacturer specs:', error);
    return {
      specs: [],
      source: {
        name: `${brand} Official`,
        url: '',
        dataType: 'specs',
        reliability: 0,
        extractedData: {},
        conflicts: [],
      },
    };
  }
}

/**
 * Extract specs from retailer sources for cross-validation
 */
async function extractRetailerSpecs(
  productName: string,
  sku: string
): Promise<{
  specs: ProductResearchResult['technicalSpecs'];
  sources: EnrichmentSource[];
}> {
  const prompt = `Sei un ricercatore tecnico. USA LA RICERCA WEB per trovare le specifiche tecniche per:

Prodotto: ${productName}
SKU: ${sku}

Cerca su retailer italiani affidabili come:
- Amazon.it
- Fixami.it  
- Rotopino.it
- Toolnation.it

Estrai le specifiche tecniche che trovi, indicando la fonte e l'URL.

Rispondi in JSON:
{
  "retailers": [
    {
      "name": "Amazon.it",
      "url": "URL della pagina",
      "specs": [
        { "field": "Coppia", "value": "135", "unit": "Nm" }
      ]
    }
  ]
}`;

  try {
    const response = await generateTextSafe({
      prompt,
      maxTokens: 2500,
      temperature: 0.5,
    });
    const content = response.text;
    if (content.type !== 'text') return { specs: [], sources: [] };
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { specs: [], sources: [] };
    
    const data = JSON.parse(jsonMatch[0]);
    
    const specs: ProductResearchResult['technicalSpecs'] = [];
    const sources: EnrichmentSource[] = [];
    
    for (const retailer of data.retailers || []) {
      const priority = retailer.name.toLowerCase().includes('amazon') ? 8 : 7;
      
      for (const spec of retailer.specs || []) {
        specs.push({
          field: spec.field,
          value: spec.value,
          unit: spec.unit,
          source: retailer.name,
          priority,
          verified: false,
        });
      }
      
      sources.push({
        name: retailer.name,
        url: '',
        dataType: 'specs',
        reliability: priority / 10,
        extractedData: retailer.specs,
        conflicts: [],
      });
    }
    
    return { specs, sources };
    
  } catch (error) {
    log.error('[ProductResearch] Error extracting retailer specs:', error);
    return { specs: [], sources: [] };
  }
}

// =============================================================================
// BALANCED REVIEW ANALYSIS
// =============================================================================

/**
 * Analyze balanced reviews (3-4 stars) from Amazon and Reddit
 */
async function analyzeBalancedReviews(
  productName: string,
  brand: string
): Promise<ReviewAnalysis> {
  const queries = getBalancedReviewQueries(productName, brand);
  
  const prompt = `Sei un analista di recensioni. USA LA RICERCA WEB per analizzare le opinioni reali su:

Prodotto: ${productName}
Brand: ${brand}

FOCUS: Cerca recensioni BILANCIATE (3-4 stelle) che sono le più utili perché:
- Non sono né troppo entusiaste né troppo negative
- Evidenziano pro E contro reali
- Sono scritte da utenti che hanno usato il prodotto

Cerca su:
1. Amazon.it - recensioni 3-4 stelle
2. Reddit r/Tools - thread con "problem", "issue", "disappointed"
3. Forum italiani - discussioni su problemi

IMPORTANTE: 
- USA LA RICERCA WEB per trovare recensioni reali
- Cerca problemi REALI e RICORRENTI, non lamentele isolate
- Cita fonti specifiche con URL

Rispondi in JSON:
{
  "positives": ["punto positivo 1", "punto positivo 2"],
  "negatives": ["punto negativo 1", "punto negativo 2"],
  "commonProblems": [
    {
      "problem": "descrizione problema",
      "frequency": "comune|raro|isolato",
      "workaround": "soluzione se esiste",
      "sourceUrl": "URL fonte"
    }
  ],
  "quotes": [
    {
      "text": "citazione esatta",
      "source": "Amazon 3 stelle",
      "rating": 3,
      "url": "URL recensione"
    }
  ],
  "overallSentiment": "positive|negative|mixed"
}`;

  try {
    const response = await generateTextSafe({
      prompt,
      maxTokens: 3000,
      temperature: 0.5,
    });
    const content = response.text;
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    return {
      positives: data.positives || [],
      negatives: data.negatives || [],
      commonProblems: (data.commonProblems || []).map((p: any) => 
        typeof p === 'string' ? p : p.problem
      ),
      quotes: data.quotes || [],
      overallSentiment: data.overallSentiment || 'mixed',
    };
    
  } catch (error) {
    log.error('[ProductResearch] Error analyzing reviews:', error);
    return {
      positives: [],
      negatives: [],
      commonProblems: [],
      quotes: [],
      overallSentiment: 'mixed',
    };
  }
}

// =============================================================================
// ACCESSORY RECOMMENDATIONS
// =============================================================================

/**
 * Find recommended accessories from competitor analysis
 */
async function findAccessoryRecommendations(
  productName: string,
  sku: string,
  brand: string
): Promise<ProductResearchResult['accessories']> {
  const prompt = `Sei un esperto di elettroutensili. USA LA RICERCA WEB per questo prodotto:

Prodotto: ${productName}
SKU: ${sku}
Brand: ${brand}

Identifica gli accessori ESSENZIALI che un professionista dovrebbe considerare.

CERCA SUL WEB cosa vendono i competitor insieme a questo prodotto:
- Fixami.it
- Rotopino.it
- Amazon.it (sezione "Spesso comprati insieme")

REGOLE:
1. Solo accessori COMPATIBILI e UTILI
2. Spiega PERCHÉ ogni accessorio è consigliato
3. Prioritizza accessori che risolvono problemi comuni
4. Indica la fonte dove hai trovato la raccomandazione

Rispondi in JSON:
{
  "accessories": [
    {
      "name": "Nome accessorio",
      "type": "batteria|caricatore|custodia|punta|disco|altro",
      "reason": "Perché è utile",
      "priority": "essenziale|consigliato|opzionale",
      "sourceUrl": "URL fonte"
    }
  ]
}`;

  try {
    const response = await generateTextSafe({
      prompt,
      maxTokens: 2000,
      temperature: 0.5,
    });
    const content = response.text;
    if (content.type !== 'text') return [];
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const data = JSON.parse(jsonMatch[0]);
    
    return (data.accessories || []).map((acc: any) => ({
      name: acc.name,
      reason: acc.reason,
      source: 'Competitor Analysis',
    }));
    
  } catch (error) {
    log.error('[ProductResearch] Error finding accessories:', error);
    return [];
  }
}

// =============================================================================
// MAIN RESEARCH FUNCTION
// =============================================================================

/**
 * Conduct comprehensive product research with source hierarchy
 */
export async function researchProduct(
  productName: string,
  brand: string,
  sku: string,
  model?: string
): Promise<ProductResearchResult> {
  log.info(`[ProductResearch] Starting research for: ${productName}`);
  
  const result: ProductResearchResult = {
    productName,
    brand,
    sku,
    technicalSpecs: [],
    realWorldFeedback: {
      positives: [],
      negatives: [],
      commonProblems: [],
      quotes: [],
    },
    accessories: [],
    conflicts: [],
    uncertainData: [],
    manualCheckRequired: [],
    sourcesUsed: [],
  };
  
  // 1. Extract manufacturer specs (highest priority)
  log.info('[ProductResearch] Extracting manufacturer specs...');
  const manufacturerData = await extractManufacturerSpecs(
    productName,
    brand,
    model || sku
  );
  result.technicalSpecs.push(...manufacturerData.specs);
  result.sourcesUsed.push(manufacturerData.source);
  
  // 2. Extract retailer specs for cross-validation
  log.info('[ProductResearch] Extracting retailer specs...');
  const retailerData = await extractRetailerSpecs(productName, sku);
  result.sourcesUsed.push(...retailerData.sources);
  
  // 3. Check for conflicts between sources
  log.info('[ProductResearch] Checking for data conflicts...');
  const specsByField = new Map<string, { source: string; value: string; priority: number }[]>();
  
  for (const spec of [...result.technicalSpecs, ...retailerData.specs]) {
    const key = spec.field.toLowerCase();
    if (!specsByField.has(key)) {
      specsByField.set(key, []);
    }
    specsByField.get(key)!.push({
      source: spec.source,
      value: spec.value,
      priority: spec.priority,
    });
  }
  
  // Resolve conflicts
  for (const [field, values] of Array.from(specsByField.entries())) {
    if (values.length > 1) {
      const uniqueValues = new Set(values.map(v => v.value));
      
      if (uniqueValues.size > 1) {
        // Conflict detected
        const conflict: DataConflict = {
          field,
          values,
          resolved: false,
          requiresManualCheck: false,
        };
        
        const resolved = resolveDataConflict(conflict);
        result.conflicts.push(resolved);
        
        if (resolved.requiresManualCheck) {
          result.manualCheckRequired.push(
            `${field}: ${resolved.notes}`
          );
        }
      }
    }
  }
  
  // 4. Analyze balanced reviews
  log.info('[ProductResearch] Analyzing balanced reviews...');
  const reviewAnalysis = await analyzeBalancedReviews(productName, brand);
  result.realWorldFeedback = reviewAnalysis;
  
  // 5. Find accessory recommendations
  log.info('[ProductResearch] Finding accessory recommendations...');
  result.accessories = await findAccessoryRecommendations(productName, sku, brand);
  
  // 6. Log summary
  log.info(`[ProductResearch] Research complete:`);
  log.info(`  - Specs: ${result.technicalSpecs.length}`);
  log.info(`  - Conflicts: ${result.conflicts.length}`);
  log.info(`  - Manual checks needed: ${result.manualCheckRequired.length}`);
  log.info(`  - Positives: ${result.realWorldFeedback.positives.length}`);
  log.info(`  - Negatives: ${result.realWorldFeedback.negatives.length}`);
  log.info(`  - Accessories: ${result.accessories.length}`);
  
  return result;
}

/**
 * Generate safety log for uncertain data
 */
export function generateSafetyLog(result: ProductResearchResult): string {
  const lines: string[] = [
    `=== SAFETY LOG: ${result.productName} ===`,
    `Data: ${new Date().toISOString()}`,
    `SKU: ${result.sku}`,
    '',
  ];
  
  if (result.conflicts.length > 0) {
    lines.push('## CONFLITTI DATI');
    for (const conflict of result.conflicts) {
      lines.push(`- ${conflict.field}:`);
      for (const val of conflict.values) {
        lines.push(`  * ${val.source}: ${val.value} (priority ${val.priority})`);
      }
      if (conflict.requiresManualCheck) {
        lines.push(`  ⚠️ VERIFICA MANUALE RICHIESTA`);
      }
    }
    lines.push('');
  }
  
  if (result.manualCheckRequired.length > 0) {
    lines.push('## VERIFICHE MANUALI RICHIESTE');
    for (const check of result.manualCheckRequired) {
      lines.push(`- ${check}`);
    }
    lines.push('');
  }
  
  if (result.uncertainData.length > 0) {
    lines.push('## DATI INCERTI');
    for (const data of result.uncertainData) {
      lines.push(`- ${data}`);
    }
    lines.push('');
  }
  
  lines.push('## FONTI UTILIZZATE');
  for (const source of result.sourcesUsed) {
    lines.push(`- ${source.name} (reliability: ${(source.reliability * 100).toFixed(0)}%)`);
  }
  
  return lines.join('\n');
}
