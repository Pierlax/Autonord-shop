/**
 * Product Enrichment - Research Module
 * 
 * Extracts data from official sources, reviews, and competitors
 * following the source hierarchy for reliable product information.
 */

import Anthropic from '@anthropic-ai/sdk';
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
  const anthropic = new Anthropic();
  const brandConfig = getBrandConfig(brand);
  
  const prompt = `Sei un ricercatore tecnico. Estrai le specifiche tecniche UFFICIALI per:

Prodotto: ${productName}
Brand: ${brand}
Modello: ${model}
${brandConfig ? `Sito ufficiale: ${brandConfig.officialSite}` : ''}

Cerca le specifiche che un produttore tipicamente fornisce per questo tipo di prodotto.
Sii PRECISO e usa solo dati realistici per elettroutensili professionali.

IMPORTANTE:
- Se non sei sicuro di un dato, NON inventarlo
- Indica "N/D" per dati non disponibili
- Usa le unità di misura standard (Nm, RPM, V, Ah, kg, mm)

Rispondi in JSON:
{
  "specs": [
    {
      "field": "Coppia massima",
      "value": "135",
      "unit": "Nm",
      "confidence": "high|medium|low"
    }
  ],
  "productType": "avvitatore|trapano|smerigliatrice|altro",
  "officialUrl": "URL se trovato"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
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
    console.error('[ProductResearch] Error extracting manufacturer specs:', error);
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
  const anthropic = new Anthropic();
  
  const prompt = `Sei un ricercatore tecnico. Cerca le specifiche tecniche per:

Prodotto: ${productName}
SKU: ${sku}

Cerca su retailer italiani affidabili come:
- Amazon.it
- Fixami.it
- Rotopino.it
- Toolnation.it

Estrai le specifiche tecniche che trovi, indicando la fonte.

Rispondi in JSON:
{
  "retailers": [
    {
      "name": "Amazon.it",
      "specs": [
        { "field": "Coppia", "value": "135", "unit": "Nm" }
      ]
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
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
    console.error('[ProductResearch] Error extracting retailer specs:', error);
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
  const anthropic = new Anthropic();
  
  const queries = getBalancedReviewQueries(productName, brand);
  
  const prompt = `Sei un analista di recensioni. Analizza le opinioni su:

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

IMPORTANTE: Cerca problemi REALI e RICORRENTI, non lamentele isolate.

Rispondi in JSON:
{
  "positives": ["punto positivo 1", "punto positivo 2"],
  "negatives": ["punto negativo 1", "punto negativo 2"],
  "commonProblems": [
    {
      "problem": "descrizione problema",
      "frequency": "comune|raro|isolato",
      "workaround": "soluzione se esiste"
    }
  ],
  "quotes": [
    {
      "text": "citazione esatta",
      "source": "Amazon 3 stelle",
      "rating": 3
    }
  ],
  "overallSentiment": "positive|negative|mixed"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
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
    console.error('[ProductResearch] Error analyzing reviews:', error);
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
  const anthropic = new Anthropic();
  
  const prompt = `Sei un esperto di elettroutensili. Per questo prodotto:

Prodotto: ${productName}
SKU: ${sku}
Brand: ${brand}

Identifica gli accessori ESSENZIALI che un professionista dovrebbe considerare.

Analizza cosa vendono i competitor insieme a questo prodotto:
- Fixami.it
- Rotopino.it
- Amazon.it

REGOLE:
1. Solo accessori COMPATIBILI e UTILI
2. Spiega PERCHÉ ogni accessorio è consigliato
3. Prioritizza accessori che risolvono problemi comuni

Rispondi in JSON:
{
  "accessories": [
    {
      "name": "Nome accessorio",
      "type": "batteria|caricatore|custodia|punta|disco|altro",
      "reason": "Perché è utile",
      "priority": "essenziale|consigliato|opzionale"
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
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
    console.error('[ProductResearch] Error finding accessories:', error);
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
  console.log(`[ProductResearch] Starting research for: ${productName}`);
  
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
  console.log('[ProductResearch] Extracting manufacturer specs...');
  const manufacturerData = await extractManufacturerSpecs(
    productName,
    brand,
    model || sku
  );
  result.technicalSpecs.push(...manufacturerData.specs);
  result.sourcesUsed.push(manufacturerData.source);
  
  // 2. Extract retailer specs for cross-validation
  console.log('[ProductResearch] Extracting retailer specs...');
  const retailerData = await extractRetailerSpecs(productName, sku);
  result.sourcesUsed.push(...retailerData.sources);
  
  // 3. Check for conflicts between sources
  console.log('[ProductResearch] Checking for data conflicts...');
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
  for (const [field, values] of specsByField) {
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
  console.log('[ProductResearch] Analyzing balanced reviews...');
  const reviewAnalysis = await analyzeBalancedReviews(productName, brand);
  result.realWorldFeedback = reviewAnalysis;
  
  // 5. Find accessory recommendations
  console.log('[ProductResearch] Finding accessory recommendations...');
  result.accessories = await findAccessoryRecommendations(productName, sku, brand);
  
  // 6. Log summary
  console.log(`[ProductResearch] Research complete:`);
  console.log(`  - Specs: ${result.technicalSpecs.length}`);
  console.log(`  - Conflicts: ${result.conflicts.length}`);
  console.log(`  - Manual checks needed: ${result.manualCheckRequired.length}`);
  console.log(`  - Positives: ${result.realWorldFeedback.positives.length}`);
  console.log(`  - Negatives: ${result.realWorldFeedback.negatives.length}`);
  console.log(`  - Accessories: ${result.accessories.length}`);
  
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
