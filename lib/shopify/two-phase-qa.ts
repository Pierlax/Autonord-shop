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
 * 
 * AI Engine: Google Gemini via ai-client.ts (rate-limited, auto-retry)
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
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
// Dynamic QA Questions by Product Category
// ============================================================================

/**
 * Maps a productType/category string to a set of category-specific questions.
 * Returns a list of question strings tailored to the product family.
 */
function getQuestionsForCategory(category: string): string[] {
  const cat = category.toLowerCase();

  // --- Generatori / Gruppi Elettrogeni ---
  if (cat.includes('generato') || cat.includes('gruppo') || cat.includes('elettroge') || cat.includes('avr')) {
    return [
      "Qual è la potenza nominale in kVA o kW?",
      "Qual è la potenza di picco in kVA o kW?",
      "Qual è il tipo e la marca del motore (es. Honda GX390)?",
      "Qual è la cilindrata del motore in cc?",
      "Qual è la capacità del serbatoio carburante in litri?",
      "Qual è l'autonomia a pieno carico in ore?",
      "Qual è la tensione di uscita in Volt (V)?",
      "Qual è la frequenza di uscita in Hz?",
      "Qual è il peso in kg?",
      "Qual è il livello di rumore in dB a 7 metri?",
      "Ha regolatore di tensione automatico (AVR)?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Aspiratori / Vacuum ---
  if (cat.includes('aspirato') || cat.includes('vacuum') || cat.includes('pulizia')) {
    return [
      "Qual è la potenza del motore in Watt (W)?",
      "Qual è la capacità del serbatoio in litri?",
      "Qual è la depressione massima in mbar o mmH2O?",
      "Qual è la portata d'aria in l/s o m³/h?",
      "Ha filtro HEPA?",
      "Qual è il peso in kg?",
      "Qual è il livello di rumore in dB?",
      "È adatto per liquidi oltre che polveri (wet & dry)?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Compressori ---
  if (cat.includes('compressor') || cat.includes('compressa')) {
    return [
      "Qual è la pressione massima in bar?",
      "Qual è la portata in l/min?",
      "Qual è la capacità del serbatoio in litri?",
      "Qual è la potenza del motore in W o HP?",
      "Qual è il peso in kg?",
      "Qual è il livello di rumore in dB?",
      "È oil-free (senza olio)?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Saldatrici ---
  if (cat.includes('saldatri') || cat.includes('saldatur') || cat.includes('mig') || cat.includes('tig') || cat.includes('mma')) {
    return [
      "Qual è la corrente massima di saldatura in Ampere (A)?",
      "Qual è la tensione di alimentazione in V?",
      "Qual è il ciclo di lavoro (duty cycle) a corrente max?",
      "Quali processi supporta (MIG/MAG, TIG, MMA)?",
      "Qual è il peso in kg?",
      "Qual è il diametro massimo dell'elettrodo in mm?",
      "Ha inverter?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Smerigliatrici angolari ---
  if (cat.includes('smerigliatori') || cat.includes('smerigliatri') || cat.includes('flex') || cat.includes('angolari')) {
    return [
      "Qual è la potenza in Watt (W)?",
      "Qual è il diametro del disco in mm?",
      "Quanti giri al minuto (RPM) a vuoto?",
      "Qual è il peso in kg?",
      "Qual è il livello di vibrazione in m/s²?",
      "Qual è il livello di rumore in dB?",
      "Ha sistema di protezione da riavvio accidentale?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Idropulitrici / Lavaggio a pressione ---
  if (cat.includes('idropulitri') || cat.includes('lavaggio') || cat.includes('pressione') || cat.includes('karcher')) {
    return [
      "Qual è la pressione massima in bar?",
      "Qual è la portata d'acqua in l/h?",
      "Qual è la potenza del motore in W?",
      "Qual è il peso in kg?",
      "Ha serbatoio detergente integrato?",
      "Qual è la lunghezza del tubo flessibile in metri?",
      "Quanti anni di garanzia?",
    ];
  }

  // --- Trapani, Avvitatori, Percussori (default power tool) ---
  return [
    "Qual è la coppia massima in Nm (Newton-metri)?",
    "Qual è il peso in kg senza batteria?",
    "Quanti giri al minuto (RPM) a vuoto?",
    "Qual è il voltaggio del sistema (V)?",
    "Qual è la capacità della batteria in Ah?",
    "Qual è la dimensione del mandrino/attacco?",
    "Quanti colpi al minuto (IPM/BPM)?",
    "È brushless o con spazzole?",
    "Quante velocità/marce ha?",
    "Quanti anni di garanzia?",
  ];
}

// ============================================================================
// Simple QA Extraction
// ============================================================================

export async function extractAtomicFacts(
  productData: {
    title: string;
    description: string;
    brand: string;
    sku: string;
    category?: string;
    sourceData?: string; // Raw data from research
  }
): Promise<SimpleQAResult> {
  const startTime = Date.now();

  // Use category for question selection, but fall back to product title when
  // category is generic ('Elettroutensile') or absent — prevents asking drill
  // questions for a generator, welder, etc.
  const GENERIC_CATEGORIES = ['elettroutensile', 'attrezzatura professionale', ''];
  const categoryHint = (productData.category || '').toLowerCase().trim();
  const effectiveCategory = GENERIC_CATEGORIES.includes(categoryHint)
    ? `${productData.title} ${productData.category || ''}`
    : productData.category || '';
  const questions = getQuestionsForCategory(effectiveCategory);
  const numberedQuestions = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const prompt = `Sei un tecnico esperto di attrezzature professionali. Estrai SOLO fatti verificabili dai dati forniti.

PRODOTTO: ${productData.title}
BRAND: ${productData.brand}
SKU: ${productData.sku}
CATEGORIA: ${productData.category || 'Attrezzatura professionale'}

DATI DISPONIBILI:
${productData.description}
${productData.sourceData || ''}

---

Per ogni domanda, rispondi con:
- Il valore esatto (numero + unità di misura)
- La fonte (es. "scheda tecnica ufficiale", "scheda prodotto retailer", "non trovato")
- Confidence: high (dato da scheda tecnica ufficiale o manuale), medium (dato da retailer o e-commerce), low (dato incerto o stimato)

Se il dato NON è presente nei dati forniti, rispondi esattamente "NON TROVATO".

DOMANDE:
${numberedQuestions}

Rispondi SOLO con JSON valido, senza testo prima o dopo:
{
  "facts": [
    {
      "question": "testo della domanda",
      "answer": "valore esatto o NON TROVATO",
      "source": "fonte del dato",
      "confidence": "high|medium|low"
    }
  ]
}`;

  let resultText = '';
  try {
    const result = await generateTextSafe({
      system: 'Sei un tecnico esperto di attrezzature e macchinari professionali. Rispondi SOLO con JSON valido, nessun testo aggiuntivo.',
      prompt,
      maxTokens: 2000,
      temperature: 0.1,
      useLiteModel: true,
    });
    resultText = result.text;
  } catch (err) {
    log.error('[TwoPhaseQA] Phase 1 generateTextSafe failed:', err);
    return { specs: {}, rawFacts: [], extractionTime: Date.now() - startTime };
  }

  // Parse JSON response
  let parsed: { facts: Array<{ question: string; answer: string; source: string; confidence: string }> };
  try {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    log.error('Failed to parse Simple QA response:', resultText);
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

  // Map to specs object using flexible keyword matching
  const specs: SimpleQAResult['specs'] = {};
  const specMapping: Record<string, keyof SimpleQAResult['specs']> = {
    'coppia': 'torque',
    'peso': 'weight',
    'giri': 'rpm',
    'potenza nominale': 'rpm',       // generators: map kVA to rpm slot for display
    'voltaggio': 'voltage',
    'tensione di uscita': 'voltage',
    'batteria': 'batteryCapacity',
    'serbatoio carburante': 'batteryCapacity', // generators: fuel tank → battery slot
    'capacità del serbatoio': 'batteryCapacity',
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
    sourceData?: string; // RAG text — used when Phase 1 found no structured facts
  },
  simpleQA: SimpleQAResult
): Promise<ComplexQAResult> {
  const startTime = Date.now();

  // Build facts summary for context
  const factsSummary = simpleQA.rawFacts
    .filter(f => f.answer !== 'NON TROVATO')
    .map(f => `- ${f.question}: ${f.answer} (${f.confidence})`)
    .join('\n');

  // When Phase 1 found no structured facts, include a truncated snippet of the
  // raw RAG text so Phase 2 can still reason about real retrieved content
  const hasNoFacts = factsSummary.trim().length === 0;
  const sourceDataSection = hasNoFacts && productData.sourceData
    ? `\nDATI AGGIUNTIVI DA RICERCA WEB (usa per contestualizzare):\n${productData.sourceData.slice(0, 3000)}`
    : '';

  const prompt = `Siete il Team Tecnico di Autonord Service, con oltre 40 anni di esperienza combinata nel settore elettroutensili.
Basandovi sui fatti verificati (e sui dati aggiuntivi se presenti), fate un ragionamento approfondito.

PRODOTTO: ${productData.title}
BRAND: ${productData.brand}
CATEGORIA: ${productData.category}

FATTI VERIFICATI:
${factsSummary || '(nessun fatto strutturato disponibile — usa i dati aggiuntivi sotto)'}${sourceDataSection}

---

ANALISI RICHIESTA:

1. SUITABILITY (Per chi è / Per chi NON è)
Considerando i dati tecnici, ragiona su:
- Quali professionisti beneficerebbero di più da queste specifiche?
- Per quali usi NON è adatto (e perché, basandoti sui numeri)?

2. COMPARISON (vs Media Categoria)
Confronta i numeri SOLO se hai dati verificati da fonti (non inventare medie):
- Dove eccelle rispetto alla concorrenza (basandoti sui fatti verificati sopra)?
- Dove è sotto la media (solo se puoi supportarlo con un dato concreto)?
- Se non hai dati di confronto, lascia i campi vuoti — NON inventare medie di categoria

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

  let resultText = '';
  try {
    const result = await generateTextSafe({
      system: 'Sei un esperto tecnico di attrezzature e macchinari professionali. Rispondi SOLO con JSON valido, nessun testo aggiuntivo.',
      prompt,
      maxTokens: 2000,
      temperature: 0.4,
      useLiteModel: true,
    });
    resultText = result.text;
  } catch (err) {
    log.error('[TwoPhaseQA] Phase 2 generateTextSafe failed:', err);
    return {
      suitability: { idealFor: [], notIdealFor: [], reasoning: '' },
      comparison: { vsCategory: 'nella media', strengths: [], weaknesses: [] },
      recommendation: { verdict: '', confidence: 'low', caveats: [] },
      reasoningTime: Date.now() - startTime,
    };
  }

  // Parse JSON response
  let parsed: any;
  try {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const raw = JSON.parse(jsonMatch[0]);
    parsed = {
      ...raw.suitability,
      ...raw.comparison,
      ...raw.recommendation,
    };
  } catch {
    log.error('Failed to parse Complex QA response:', resultText);
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
// Main Two-Phase QA Function — single merged Gemini call
// ============================================================================

const SOURCE_DATA_MAX_CHARS = 30_000;

/**
 * Run both Phase 1 (atomic fact extraction) and Phase 2 (complex reasoning)
 * in a **single** Gemini call instead of two sequential calls.
 * This reduces AI cost by ~17% (1 call saved per product).
 *
 * The external API and return type are identical to the previous implementation.
 */
export async function runTwoPhaseQA(
  productData: {
    title: string;
    description: string;
    brand: string;
    sku: string;
    category: string;
    sourceData?: string;
  }
): Promise<TwoPhaseQAResult> {
  const totalStartTime = Date.now();

  const truncatedSourceData = productData.sourceData
    ? productData.sourceData.slice(0, SOURCE_DATA_MAX_CHARS)
    : undefined;

  log.info(`[TwoPhaseQA] Starting merged call for ${productData.sku} (sourceData: ${productData.sourceData?.length ?? 0} chars → truncated to ${truncatedSourceData?.length ?? 0})`);

  const GENERIC_CATEGORIES = ['elettroutensile', 'attrezzatura professionale', ''];
  const categoryHint = (productData.category || '').toLowerCase().trim();
  const effectiveCategory = GENERIC_CATEGORIES.includes(categoryHint)
    ? `${productData.title} ${productData.category || ''}`
    : productData.category || '';
  const questions = getQuestionsForCategory(effectiveCategory);
  const numberedQuestions = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const prompt = `Sei il Team Tecnico di Autonord Service. Analizza il prodotto e rispondi con UN UNICO JSON valido che include entrambi i blocchi richiesti.

PRODOTTO: ${productData.title}
BRAND: ${productData.brand}
SKU: ${productData.sku}
CATEGORIA: ${productData.category || 'Attrezzatura professionale'}

DATI DISPONIBILI:
${productData.description}
${truncatedSourceData || ''}

---

BLOCCO 1 — FATTI ATOMICI
Per ogni domanda rispondi con il valore esatto (numero + unità), la fonte e la confidence.
Se il dato NON è presente, rispondi "NON TROVATO".

DOMANDE:
${numberedQuestions}

---

BLOCCO 2 — ANALISI TECNICA
Basandoti sui fatti estratti (e sui dati disponibili se i fatti sono scarsi):

1. SUITABILITY: per chi è ideale e per chi NON è adatto (motivato dai numeri)
2. COMPARISON: confronto con la media della categoria (punti di forza e debolezze)
3. RECOMMENDATION: verdetto onesto in una frase + caveats

---

Rispondi SOLO con questo JSON (nessun testo fuori dal JSON):
{
  "phase1": {
    "facts": [
      {
        "question": "testo della domanda",
        "answer": "valore esatto o NON TROVATO",
        "source": "fonte del dato",
        "confidence": "high|medium|low"
      }
    ]
  },
  "phase2": {
    "suitability": {
      "idealFor": ["tipo utente 1"],
      "notIdealFor": ["tipo utente 1"],
      "reasoning": "spiegazione basata sui numeri"
    },
    "comparison": {
      "vsCategory": "sopra media | nella media | sotto media",
      "strengths": ["punto di forza con dato"],
      "weaknesses": ["debolezza con dato"]
    },
    "recommendation": {
      "verdict": "verdetto chiaro in una frase",
      "confidence": "high|medium|low",
      "caveats": ["avvertenza 1"]
    }
  }
}`;

  let simpleQA: SimpleQAResult = { specs: {}, rawFacts: [], extractionTime: 0 };
  let complexQA: ComplexQAResult = {
    suitability: { idealFor: [], notIdealFor: [], reasoning: '' },
    comparison: { vsCategory: 'nella media', strengths: [], weaknesses: [] },
    recommendation: { verdict: '', confidence: 'low', caveats: [] },
    reasoningTime: 0,
  };

  try {
    const result = await generateTextSafe({
      system: 'Sei un tecnico esperto di attrezzature e macchinari professionali. Rispondi SOLO con JSON valido, nessun testo aggiuntivo.',
      prompt,
      maxTokens: 4096,
      temperature: 0.2,
      useLiteModel: true,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in merged response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      phase1?: { facts?: Array<{ question: string; answer: string; source: string; confidence: string }> };
      phase2?: {
        suitability?: { idealFor?: string[]; notIdealFor?: string[]; reasoning?: string };
        comparison?: { vsCategory?: string; strengths?: string[]; weaknesses?: string[] };
        recommendation?: { verdict?: string; confidence?: string; caveats?: string[] };
      };
    };

    // --- Parse Phase 1 ---
    const p1Start = Date.now();
    const rawFacts: AtomicFact[] = (parsed.phase1?.facts ?? []).map(f => ({
      question: f.question,
      answer: f.answer,
      source: f.source,
      confidence: f.confidence as 'high' | 'medium' | 'low',
      verified: f.answer !== 'NON TROVATO' && f.confidence === 'high',
    }));

    const specs: SimpleQAResult['specs'] = {};
    const specMapping: Record<string, keyof SimpleQAResult['specs']> = {
      'coppia': 'torque',
      'peso': 'weight',
      'giri': 'rpm',
      'potenza nominale': 'rpm',
      'voltaggio': 'voltage',
      'tensione di uscita': 'voltage',
      'batteria': 'batteryCapacity',
      'serbatoio carburante': 'batteryCapacity',
      'capacità del serbatoio': 'batteryCapacity',
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

    simpleQA = { specs, rawFacts, extractionTime: Date.now() - p1Start };
    log.info(`[TwoPhaseQA] Merged: ${rawFacts.filter(f => f.verified).length} verified facts`);

    // --- Parse Phase 2 ---
    const p2 = parsed.phase2 ?? {};
    complexQA = {
      suitability: {
        idealFor: p2.suitability?.idealFor ?? [],
        notIdealFor: p2.suitability?.notIdealFor ?? [],
        reasoning: p2.suitability?.reasoning ?? '',
      },
      comparison: {
        vsCategory: p2.comparison?.vsCategory ?? 'nella media',
        strengths: p2.comparison?.strengths ?? [],
        weaknesses: p2.comparison?.weaknesses ?? [],
      },
      recommendation: {
        verdict: p2.recommendation?.verdict ?? '',
        confidence: (p2.recommendation?.confidence as 'high' | 'medium' | 'low') ?? 'medium',
        caveats: p2.recommendation?.caveats ?? [],
      },
      reasoningTime: 0,
    };
    log.info(`[TwoPhaseQA] Merged: confidence=${complexQA.recommendation.confidence}`);

  } catch (err) {
    log.error(`[TwoPhaseQA] Merged call failed for ${productData.sku}, falling back to sequential:`, err);

    // Graceful fallback: run the two phases sequentially (original behaviour)
    try {
      const truncatedData = { ...productData, sourceData: truncatedSourceData };
      simpleQA = await extractAtomicFacts(truncatedData);
      complexQA = await performComplexReasoning(
        { title: productData.title, brand: productData.brand, category: productData.category, sourceData: truncatedSourceData },
        simpleQA,
      );
    } catch (fallbackErr) {
      log.error(`[TwoPhaseQA] Sequential fallback also failed for ${productData.sku}:`, fallbackErr);
    }
  }

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
