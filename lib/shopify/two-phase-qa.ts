/**
 * Two-Phase QA Module (CLaRa-Inspired)
 * 
 * Implements the Simple QA + Complex QA pattern from the CLaRa paper:
 * - Phase 1 (Simple QA): Extract atomic facts with single-fact questions
 * - Phase 2 (Complex QA): Relational reasoning for insights and recommendations
 * 
 * Benefits:
 * - More precise and verifiable content
 * - Reduced hallucinations
 * - Better structured data extraction
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// ============================================================================
// Types
// ============================================================================

export interface AtomicFact {
  question: string;
  answer: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  verified: boolean;
}

export interface SimpleQAResult {
  specs: {
    torque?: AtomicFact;
    weight?: AtomicFact;
    rpm?: AtomicFact;
    voltage?: AtomicFact;
    batteryCapacity?: AtomicFact;
    chuckSize?: AtomicFact;
    impactRate?: AtomicFact;
    noiseLevel?: AtomicFact;
    vibration?: AtomicFact;
    warranty?: AtomicFact;
  };
  rawFacts: AtomicFact[];
  extractionTime: number;
}

export interface ComplexQAResult {
  suitability: {
    idealFor: string[];
    notIdealFor: string[];
    reasoning: string;
  };
  comparison: {
    vsCategory: string;
    strengths: string[];
    weaknesses: string[];
  };
  recommendation: {
    verdict: string;
    confidence: 'high' | 'medium' | 'low';
    caveats: string[];
  };
  reasoningTime: number;
}

export interface TwoPhaseQAResult {
  simpleQA: SimpleQAResult;
  complexQA: ComplexQAResult;
  totalTime: number;
}

// ============================================================================
// Simple QA Questions (Atomic Fact Extraction)
// ============================================================================

const SIMPLE_QA_QUESTIONS = {
  // Technical Specs
  torque: "Qual è la coppia massima in Nm (Newton-metri)?",
  weight: "Qual è il peso in kg senza batteria?",
  rpm: "Quanti giri al minuto (RPM) a vuoto?",
  voltage: "Qual è il voltaggio del sistema (V)?",
  batteryCapacity: "Qual è la capacità della batteria in Ah?",
  chuckSize: "Qual è la dimensione del mandrino/attacco?",
  impactRate: "Quanti colpi al minuto (IPM/BPM)?",
  noiseLevel: "Qual è il livello di rumore in dB?",
  vibration: "Qual è il livello di vibrazione in m/s²?",
  warranty: "Quanti anni di garanzia?",
  
  // Additional Facts
  motorType: "È brushless o con spazzole?",
  ledLight: "Ha luce LED integrata?",
  speedSettings: "Quante velocità/marce ha?",
  madeIn: "Dove è prodotto?",
  releaseYear: "In che anno è stato lanciato?",
};

// ============================================================================
// Simple QA Extraction
// ============================================================================

export async function extractAtomicFacts(
  productData: {
    title: string;
    description: string;
    brand: string;
    sku: string;
    sourceData?: string; // Raw data from research
  },
  anthropic: Anthropic
): Promise<SimpleQAResult> {
  const startTime = Date.now();
  
  const prompt = `Sei un tecnico esperto di elettroutensili. Devi estrarre SOLO fatti verificabili da questi dati.

PRODOTTO: ${productData.title}
BRAND: ${productData.brand}
SKU: ${productData.sku}

DATI DISPONIBILI:
${productData.description}
${productData.sourceData || ''}

---

Per ogni domanda, rispondi con:
- Il valore esatto (numero + unità)
- La fonte (es. "scheda tecnica ufficiale", "manuale", "non trovato")
- Confidence: high (dato verificato da fonte ufficiale), medium (dato da retailer), low (dato incerto)

Se il dato NON è presente o è ambiguo, rispondi "NON TROVATO".

DOMANDE:
1. ${SIMPLE_QA_QUESTIONS.torque}
2. ${SIMPLE_QA_QUESTIONS.weight}
3. ${SIMPLE_QA_QUESTIONS.rpm}
4. ${SIMPLE_QA_QUESTIONS.voltage}
5. ${SIMPLE_QA_QUESTIONS.batteryCapacity}
6. ${SIMPLE_QA_QUESTIONS.chuckSize}
7. ${SIMPLE_QA_QUESTIONS.impactRate}
8. ${SIMPLE_QA_QUESTIONS.motorType}
9. ${SIMPLE_QA_QUESTIONS.warranty}
10. ${SIMPLE_QA_QUESTIONS.speedSettings}

Rispondi in formato JSON:
{
  "facts": [
    {
      "question": "domanda",
      "answer": "valore esatto o NON TROVATO",
      "source": "fonte del dato",
      "confidence": "high|medium|low"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  let parsed: { facts: Array<{ question: string; answer: string; source: string; confidence: string }> };
  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    log.error('Failed to parse Simple QA response:', content.text);
    parsed = { facts: [] };
  }

  // Convert to structured format
  const rawFacts: AtomicFact[] = parsed.facts.map(f => ({
    question: f.question,
    answer: f.answer,
    source: f.source,
    confidence: f.confidence as 'high' | 'medium' | 'low',
    verified: f.answer !== 'NON TROVATO' && f.confidence === 'high',
  }));

  // Map to specs object
  const specs: SimpleQAResult['specs'] = {};
  const specMapping: Record<string, keyof SimpleQAResult['specs']> = {
    'coppia': 'torque',
    'peso': 'weight',
    'giri': 'rpm',
    'voltaggio': 'voltage',
    'batteria': 'batteryCapacity',
    'mandrino': 'chuckSize',
    'colpi': 'impactRate',
    'rumore': 'noiseLevel',
    'vibrazione': 'vibration',
    'garanzia': 'warranty',
  };

  for (const fact of rawFacts) {
    for (const [keyword, specKey] of Object.entries(specMapping)) {
      if (fact.question.toLowerCase().includes(keyword) && fact.answer !== 'NON TROVATO') {
        specs[specKey] = fact;
        break;
      }
    }
  }

  return {
    specs,
    rawFacts,
    extractionTime: Date.now() - startTime,
  };
}

// ============================================================================
// Complex QA Reasoning
// ============================================================================

export async function performComplexReasoning(
  productData: {
    title: string;
    brand: string;
    category: string;
  },
  simpleQA: SimpleQAResult,
  anthropic: Anthropic
): Promise<ComplexQAResult> {
  const startTime = Date.now();

  // Build facts summary for context
  const factsSummary = simpleQA.rawFacts
    .filter(f => f.answer !== 'NON TROVATO')
    .map(f => `- ${f.question}: ${f.answer} (${f.confidence})`)
    .join('\n');

  const prompt = `Siete il Team Tecnico di Autonord Service, con oltre 40 anni di esperienza combinata nel settore elettroutensili.
Basandovi SOLO sui fatti verificati, fate un ragionamento approfondito.

PRODOTTO: ${productData.title}
BRAND: ${productData.brand}
CATEGORIA: ${productData.category}

FATTI VERIFICATI:
${factsSummary}

---

ANALISI RICHIESTA:

1. SUITABILITY (Per chi è / Per chi NON è)
Considerando i dati tecnici, ragiona su:
- Quali professionisti beneficerebbero di più da queste specifiche?
- Per quali usi NON è adatto (e perché, basandoti sui numeri)?

2. COMPARISON (vs Media Categoria)
Confronta i numeri con la media della categoria:
- Dove eccelle rispetto alla concorrenza?
- Dove è sotto la media?

3. RECOMMENDATION (Verdetto Onesto)
Dai un verdetto chiaro e sbilanciato:
- Consigliato o sconsigliato?
- Con quali caveats/avvertenze?

Rispondi in formato JSON:
{
  "suitability": {
    "idealFor": ["tipo utente 1", "tipo utente 2"],
    "notIdealFor": ["tipo utente 1", "tipo utente 2"],
    "reasoning": "spiegazione basata sui numeri"
  },
  "comparison": {
    "vsCategory": "sopra media | nella media | sotto media",
    "strengths": ["punto di forza 1 con dato", "punto di forza 2 con dato"],
    "weaknesses": ["debolezza 1 con dato", "debolezza 2 con dato"]
  },
  "recommendation": {
    "verdict": "verdetto chiaro in una frase",
    "confidence": "high|medium|low",
    "caveats": ["avvertenza 1", "avvertenza 2"]
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  let parsed: ComplexQAResult['suitability'] & ComplexQAResult['comparison'] & ComplexQAResult['recommendation'];
  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const raw = JSON.parse(jsonMatch[0]);
    parsed = {
      ...raw.suitability,
      ...raw.comparison,
      ...raw.recommendation,
    };
  } catch {
    log.error('Failed to parse Complex QA response:', content.text);
    // Return defaults
    return {
      suitability: {
        idealFor: ['Professionisti del settore'],
        notIdealFor: ['Hobbisti occasionali'],
        reasoning: 'Analisi non disponibile',
      },
      comparison: {
        vsCategory: 'nella media',
        strengths: [],
        weaknesses: [],
      },
      recommendation: {
        verdict: 'Valutazione in corso',
        confidence: 'low',
        caveats: ['Dati insufficienti per una valutazione completa'],
      },
      reasoningTime: Date.now() - startTime,
    };
  }

  return {
    suitability: {
      idealFor: parsed.idealFor || [],
      notIdealFor: parsed.notIdealFor || [],
      reasoning: parsed.reasoning || '',
    },
    comparison: {
      vsCategory: parsed.vsCategory || 'nella media',
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
    },
    recommendation: {
      verdict: parsed.verdict || '',
      confidence: (parsed.confidence as 'high' | 'medium' | 'low') || 'medium',
      caveats: parsed.caveats || [],
    },
    reasoningTime: Date.now() - startTime,
  };
}

// ============================================================================
// Main Two-Phase QA Function
// ============================================================================

export async function runTwoPhaseQA(
  productData: {
    title: string;
    description: string;
    brand: string;
    sku: string;
    category: string;
    sourceData?: string;
  },
  anthropic: Anthropic
): Promise<TwoPhaseQAResult> {
  const totalStartTime = Date.now();

  log.info(`[TwoPhaseQA] Starting for ${productData.sku}`);

  // Phase 1: Simple QA - Extract atomic facts
  log.info(`[TwoPhaseQA] Phase 1: Extracting atomic facts...`);
  const simpleQA = await extractAtomicFacts(productData, anthropic);
  log.info(`[TwoPhaseQA] Phase 1 complete: ${simpleQA.rawFacts.filter(f => f.verified).length} verified facts`);

  // Phase 2: Complex QA - Relational reasoning
  log.info(`[TwoPhaseQA] Phase 2: Performing complex reasoning...`);
  const complexQA = await performComplexReasoning(productData, simpleQA, anthropic);
  log.info(`[TwoPhaseQA] Phase 2 complete: confidence=${complexQA.recommendation.confidence}`);

  return {
    simpleQA,
    complexQA,
    totalTime: Date.now() - totalStartTime,
  };
}

// ============================================================================
// Utility: Convert Two-Phase QA to Product Content
// ============================================================================

export function twoPhaseQAToProductContent(result: TwoPhaseQAResult): {
  pros: string[];
  cons: string[];
  idealFor: string[];
  notIdealFor: string[];
  verdict: string;
  specs: Record<string, string>;
} {
  const { simpleQA, complexQA } = result;

  // Build specs from verified facts
  const specs: Record<string, string> = {};
  for (const fact of simpleQA.rawFacts) {
    if (fact.verified && fact.answer !== 'NON TROVATO') {
      // Extract key from question
      const key = fact.question
        .replace(/\?/g, '')
        .replace(/Qual è |Quanti |Quante /gi, '')
        .trim();
      specs[key] = fact.answer;
    }
  }

  // Build pros from strengths
  const pros = complexQA.comparison.strengths.map(s => {
    // Add checkmark prefix for consistency
    return s.startsWith('✓') ? s : `✓ ${s}`;
  });

  // Build cons from weaknesses
  const cons = complexQA.comparison.weaknesses.map(w => {
    // Add warning prefix for consistency
    return w.startsWith('⚠') ? w : `⚠ ${w}`;
  });

  return {
    pros,
    cons,
    idealFor: complexQA.suitability.idealFor,
    notIdealFor: complexQA.suitability.notIdealFor,
    verdict: complexQA.recommendation.verdict,
    specs,
  };
}
