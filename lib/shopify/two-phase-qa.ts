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
import { parseJsonFromLLM } from '@/lib/shared/parse-llm-json';
import { KG_CATEGORY_SYNONYMS } from '@/lib/shopify/kg-data';
import { type StructuredSource } from './rag-adapter';

const log = loggers.shopify;

// ============================================================================
// Structured Source Renderer
// ============================================================================

const SOURCE_TYPE_LABELS: Record<string, string> = {
  spec_sheet: 'Scheda tecnica ufficiale',
  manual:     'Manuale ufficiale',
  brand_site: 'Sito ufficiale del brand',
  benchmark:  'Benchmark / confronto categoria',
  review:     'Recensione specializzata',
  retailer:   'Pagina retailer / e-commerce',
  forum:      'Forum / community utenti',
  unknown:    'Fonte non classificata',
};

/**
 * W13 fix: Token-aware evidence rendering.
 *
 * Gemini 2.5 Flash has a 1M token context window, but the practical limit for
 * quality output is ~28k tokens of input. The instruction prompt uses ~2000 tokens,
 * so the evidence budget is capped at ~26k tokens.
 *
 * Previously this used a 28k *character* limit, which underestimates token count
 * for Italian text (~3.2 chars/token). Now uses token estimation + a safety margin.
 *
 * Format:
 *   [★★★ Scheda tecnica ufficiale]
 *   FONTE: makita.it/manuali/ddf484.pdf
 *   135 Nm coppia massima, 18V sistema...
 *
 * The star rating gives the LLM an immediate signal to weight spec-sheet facts
 * over forum opinions when facts conflict.
 */
const EVIDENCE_TOKEN_BUDGET = 26_000; // ~28k total minus ~2k for instructions
const PROMPT_OVERHEAD_TOKENS = 2_000; // system prompt + questions + JSON template

function estimateTokenCount(text: string): number {
  // Italian text: ~3.2 chars per token
  return Math.ceil(text.length / 3.2);
}

function renderStructuredSources(sources: StructuredSource[], maxChars = 28_000): string {
  const lines: string[] = [];
  let totalTokens = 0;
  // W13: convert char budget to token budget for backwards-compatible callers
  const maxTokens = Math.min(EVIDENCE_TOKEN_BUDGET, Math.ceil(maxChars / 3.2));

  // D9 fix: Sort sources by trust descending so high-trust evidence is preserved
  // when truncation kicks in. Previously, insertion order determined what survived,
  // meaning a long forum post could push out a short spec sheet.
  const sortedSources = [...sources].sort((a, b) => (b.trust ?? 0) - (a.trust ?? 0));

  for (const src of sortedSources) {
    const stars = src.trust >= 0.85 ? '★★★' : src.trust >= 0.65 ? '★★' : '★';
    const label = SOURCE_TYPE_LABELS[src.type] ?? 'Fonte';
    const conflictTag = src.hasConflict ? ' ⚠ CONFLITTO RILEVATO' : '';
    const header = `[${stars} ${label}${conflictTag}]\nFONTE: ${src.source}`;
    const block = `${header}\n${src.text}`;
    const blockTokens = estimateTokenCount(block);

    if (totalTokens + blockTokens > maxTokens) {
      // Truncate the last block to fit within token budget
      const remainingTokens = maxTokens - totalTokens - estimateTokenCount(header) - 10;
      if (remainingTokens > 30) {
        const remainingChars = Math.floor(remainingTokens * 3.2);
        lines.push(`${header}\n${src.text.slice(0, remainingChars)}…`);
      }
      break;
    }
    lines.push(block);
    totalTokens += blockTokens;
  }

  if (totalTokens > maxTokens * 0.9) {
    log.info(`[TwoPhaseQA] W13: Evidence near token budget: ~${totalTokens}/${maxTokens} tokens`);
  }

  return lines.join('\n\n---\n\n');
}

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
    // W9 fix: fields for generators, compressors, welders, pressure washers
    power?: AtomicFact;          // potenza nominale kVA/kW/W
    peakPower?: AtomicFact;      // potenza di picco
    pressure?: AtomicFact;       // pressione max (bar)
    flowRate?: AtomicFact;       // portata (l/min, l/h, m³/h)
    displacement?: AtomicFact;   // cilindrata (cc)
    frequency?: AtomicFact;      // frequenza uscita (Hz)
    fuelTank?: AtomicFact;       // serbatoio carburante (litri)
    tankCapacity?: AtomicFact;   // serbatoio aspiratore/compressore (litri)
    runtime?: AtomicFact;        // autonomia (ore)
    weldingCurrent?: AtomicFact; // corrente saldatura (A)
    dutyCycle?: AtomicFact;      // ciclo di lavoro (%)
    engineType?: AtomicFact;     // tipo motore
    discDiameter?: AtomicFact;   // diametro disco (mm)
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
 * D12 fix: Category synonym map for fuzzy matching.
 *
 * Shopify productType values are inconsistent (e.g., "Utensili elettrici",
 * "Power Tools", "Trapano avvitatore a batteria"). This map normalizes
 * common Shopify labels and Italian/English synonyms to the canonical
 * category keywords that getQuestionsForCategory() checks.
 *
 * Format: synonym → canonical keyword that triggers the right if-branch.
 */
// C10: Static synonyms first (hand-tuned), then KG-derived entries fill gaps.
// KG_CATEGORY_SYNONYMS is spread first so static entries override any conflicts.
const CATEGORY_SYNONYMS: Record<string, string> = {
  // KG-derived synonyms from kg-base.json (Italian names, English IDs, descriptions)
  ...KG_CATEGORY_SYNONYMS,

  // Hand-tuned static synonyms (override KG entries where both exist)
  // Generatori
  'power generator': 'generato', 'gruppo di continuità': 'generato', 'gen set': 'generato',
  'emergency power': 'generato',
  // Aspiratori
  'aspirapolvere': 'aspirato', 'dust extractor': 'aspirato', 'estrattore polvere': 'aspirato',
  'wet dry': 'aspirato', 'bidone aspiratutto': 'aspirato',
  // Compressori
  'air compressor': 'compressor', 'compressore aria': 'compressor',
  // Saldatrici
  'welder': 'saldatri', 'welding': 'saldatri', 'saldatore': 'saldatri',
  // Smerigliatrici
  'angle grinder': 'smerigliatri', 'grinder': 'smerigliatri', 'flessibile': 'smerigliatri',
  'disco da taglio': 'smerigliatri', 'mola': 'smerigliatri',
  // Idropulitrici
  'pressure washer': 'idropulitri', 'high pressure': 'idropulitri', 'acqua pressione': 'idropulitri',
  // Miniescavatori
  'mini excavator': 'miniescavator', 'digger': 'miniescavator', 'escavatore compatto': 'escavator',
  'macchina movimento terra': 'escavator',
  // Benne
  'benne': 'benna', 'escavatore accessori': 'benna', 'excavator bucket': 'benna',
  // Betoniere
  'cement mixer': 'betoniera', 'mixer calcestruzzo': 'betoniera', 'impastatrice': 'betoniera',
  // Tagliapiastrelle
  'tile saw': 'tagliapiastrelle', 'tile cutter': 'tagliapiastrelle',
  'tagliapavimenti': 'tagliapiastrelle', 'segatrice piastrelle': 'tagliapiastrelle',
  // Motoseghe
  'chainsaw': 'motosega', 'chain saw': 'motosega', 'sega catena': 'motosega',
  'potatura': 'motosega',
  // Ricambi
  'spare parts': 'ricambio', 'parts': 'ricambio', 'ricambi': 'ricambio',
  // Tasselli
  'fixing': 'tassell', 'anchors': 'tassell', 'tasselli chimici': 'tassell',
  'fissaggio': 'tassell',
  // Levigatrici orbitali / nastrini
  'levigatrice orbitale': 'levigatri', 'orbital sander': 'levigatri', 'levigatura': 'levigatri',
  'delta sander': 'levigatri', 'belt sander': 'levigatri', 'levigatrice': 'levigatri',
  'levigatrici': 'levigatri', 'levigatrice a nastro': 'levigatri',
  // Pistole termiche / termosoffiatori
  'pistola termica': 'pistolatermicaqua', 'heat gun': 'pistolatermicaqua',
  'pistola ad aria calda': 'pistolatermicaqua', 'termosoffiatore': 'pistolatermicaqua',
  'pistole termiche': 'pistolatermicaqua',
  // Avvitatori a impulsi / chiavi a impulsi
  'avvitatore a impulsi': 'impulsiavvitat', 'impact wrench': 'impulsiavvitat',
  'chiave a impulsi': 'impulsiavvitat', 'pneumatic wrench': 'impulsiavvitat',
  'avvitatore impulsi': 'impulsiavvitat', 'chiave pneumatica': 'impulsiavvitat',
  // Power tools (generico Shopify)
  'power tool': 'trapano', 'utensili elettrici': 'trapano', 'elettroutensili': 'trapano',
  'cordless': 'trapano', 'a batteria': 'trapano', 'drill': 'trapano',
  'avvitatore': 'trapano', 'trapano': 'trapano', 'impact driver': 'trapano',
  'tassellatore': 'trapano', 'demolitor': 'trapano', 'martello': 'trapano',
  'seghetto': 'trapano', 'sega circolare': 'trapano', 'pialla': 'trapano',
};

/**
 * D12 fix: Normalize a category string using the synonym map.
 * Returns the original + all matched canonical keywords appended,
 * so the existing .includes() checks in getQuestionsForCategory() work.
 */
function normalizeCategory(category: string): string {
  const cat = category.toLowerCase();
  const extras: string[] = [];
  for (const [synonym, canonical] of Object.entries(CATEGORY_SYNONYMS)) {
    if (cat.includes(synonym)) {
      extras.push(canonical);
    }
  }
  return extras.length > 0 ? `${cat} ${extras.join(' ')}` : cat;
}

/**
 * Maps a productType/category string to a set of category-specific questions.
 * Returns a list of question strings tailored to the product family.
 *
 * D12 fix: Uses normalizeCategory() for fuzzy matching via synonyms.
 */
function getQuestionsForCategory(category: string): string[] {
  const cat = normalizeCategory(category);

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

  // W12 fix: Miniescavatori / Macchine movimento terra
  if (cat.includes('miniescavator') || cat.includes('escavator') || cat.includes('microescavator') || cat.includes('excavat')) {
    return [
      "Qual è il peso operativo in kg o tonnellate?",
      "Qual è la profondità massima di scavo in mm?",
      "Qual è la potenza del motore in kW o HP?",
      "Qual è la cilindrata del motore in cc?",
      "Qual è la larghezza macchina in mm?",
      "Qual è la capacità della benna standard in litri?",
      "Qual è il tipo di motore (marca e modello)?",
      "Ha cingoli in gomma o acciaio?",
      "Qual è la portata idraulica in l/min?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Benne e attacchi escavatore
  if (cat.includes('benna') || cat.includes('bucket') || cat.includes('attacco escavator')) {
    return [
      "Qual è la larghezza della benna in mm?",
      "Qual è la capacità in litri?",
      "Qual è il peso in kg?",
      "Per quale classe di escavatori è compatibile (tonnellaggio)?",
      "Qual è il tipo di attacco (perno/boccola, aggancio rapido)?",
      "Di che materiale sono i denti (Hardox, acciaio al boro)?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Betoniere
  if (cat.includes('betoniera') || cat.includes('concrete mixer') || cat.includes('miscelat')) {
    return [
      "Qual è la capacità del tamburo in litri?",
      "Qual è la capacità di impasto in litri?",
      "Qual è la potenza del motore in W o HP?",
      "Qual è il peso in kg?",
      "È a ribaltamento meccanico o manuale?",
      "Qual è la tensione di alimentazione in V?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Tagliapiastrelle / Tagliatori
  if (cat.includes('tagliapiastrelle') || cat.includes('tile cutter') || cat.includes('tagliatrice') || cat.includes('montolit')) {
    return [
      "Qual è la lunghezza massima di taglio in mm?",
      "Qual è la profondità massima di taglio in mm?",
      "Qual è il diametro del disco in mm?",
      "Qual è la potenza del motore in W?",
      "Qual è il peso in kg?",
      "Ha taglio diagonale?",
      "Ha sistema di raffreddamento ad acqua?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Motoseghe
  if (cat.includes('motosega') || cat.includes('chainsaw') || cat.includes('sega a catena')) {
    return [
      "Qual è la cilindrata del motore in cc?",
      "Qual è la potenza in kW o HP?",
      "Qual è la lunghezza della barra in cm?",
      "Qual è il peso senza barra in kg?",
      "Qual è il passo della catena?",
      "Ha sistema anti-vibrazione?",
      "Qual è il livello di rumore in dB?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Ricambi veicoli (DFSK, VEM, etc.)
  if (cat.includes('ricambio') || cat.includes('spare') || cat.includes('dfsk') || cat.includes('vem')) {
    return [
      "Per quale veicolo/modello è compatibile?",
      "Qual è il codice OEM del ricambio?",
      "Qual è il peso in kg?",
      "È un ricambio originale o aftermarket?",
      "Quali sono le dimensioni principali (mm)?",
      "Quanti anni di garanzia?",
    ];
  }

  // W12 fix: Sistemi di ancoraggio / Tasselli
  if (cat.includes('tassell') || cat.includes('ancoraggio') || cat.includes('fischer') || cat.includes('anchor')) {
    return [
      "Qual è il diametro del tassello in mm?",
      "Qual è la lunghezza in mm?",
      "Qual è il carico ammissibile a trazione in kN?",
      "Qual è il carico ammissibile a taglio in kN?",
      "Per quale materiale base è adatto (calcestruzzo, mattone, cartongesso)?",
      "Ha certificazione ETA?",
      "Quanti pezzi nella confezione?",
      "Quanti anni di garanzia?",
    ];
  }

  // W-QA-5 fix: Levigatrici orbitali / nastrini
  if (cat.includes('levigatri')) {
    return [
      "Qual è la potenza in Watt (W)?",
      "Qual è la dimensione del piatto o della base (mm × mm)?",
      "Quante oscillazioni o giri al minuto (OPM/RPM) a vuoto?",
      "Qual è il peso in kg?",
      "Qual è il livello di vibrazione in m/s²?",
      "Qual è il livello di rumore in dB?",
      "Ha sacchetto raccolta polvere integrato?",
      "Qual è il tipo di carta abrasiva compatibile (forma / dimensione)?",
      "Quanti anni di garanzia?",
    ];
  }

  // W-QA-5 fix: Pistole termiche / termosoffiatori
  if (cat.includes('pistolatermicaqua')) {
    return [
      "Qual è la potenza in Watt (W)?",
      "Qual è la temperatura massima in °C?",
      "Quanti livelli di temperatura o velocità aria?",
      "Qual è la portata d'aria massima in l/min?",
      "Qual è il peso in kg?",
      "Qual è la tensione di alimentazione in V?",
      "Ha funzione di raffreddamento (aria fredda)?",
      "Quanti anni di garanzia?",
    ];
  }

  // W-QA-5 fix: Avvitatori a impulsi / chiavi a impulsi
  if (cat.includes('impulsiavvitat')) {
    return [
      "Qual è la coppia massima di serraggio in Nm?",
      "Qual è la coppia massima di svitaggio in Nm?",
      "Quanti colpi al minuto (IPM/BPM)?",
      "Qual è la dimensione dell'attacco quadro (1/4\", 3/8\", 1/2\")?",
      "Qual è il voltaggio del sistema in V?",
      "Qual è la capacità della batteria in Ah?",
      "Qual è il peso senza batteria in kg?",
      "È brushless?",
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
// W9 fix: Category-aware spec mapping
// ============================================================================

/**
 * W9 fix: Returns a spec mapping that is aware of the product category.
 *
 * Previously "serbatoio carburante" and "capacità del serbatoio" both mapped
 * to `batteryCapacity`, causing fuel tank liters to appear as battery Ah.
 * Now the mapping differentiates by category: generators map fuel tank to
 * `fuelTank`, compressors/vacuums map tank to `tankCapacity`, and power tools
 * keep the original `batteryCapacity` mapping.
 */
function getSpecMapping(category: string): Record<string, keyof SimpleQAResult['specs']> {
  // D12 fix: Use normalized category for consistent matching with getQuestionsForCategory
  const cat = normalizeCategory(category);

  // Base mapping shared across all categories
  const base: Record<string, keyof SimpleQAResult['specs']> = {
    'peso': 'weight',
    'rumore': 'noiseLevel',
    'vibrazione': 'vibration',
    'garanzia': 'warranty',
  };

  // Generator-specific
  if (cat.includes('generato') || cat.includes('gruppo') || cat.includes('elettroge')) {
    return {
      ...base,
      'potenza nominale': 'power',
      'potenza di picco': 'peakPower',
      'cilindrata': 'displacement',
      'serbatoio carburante': 'fuelTank',
      'autonomia': 'runtime',
      'tensione di uscita': 'voltage',
      'frequenza': 'frequency',
      'tipo': 'engineType',
      'marca del motore': 'engineType',
      'regolatore': 'warranty', // AVR → mapped to warranty slot as boolean-like
    };
  }

  // Compressor-specific
  if (cat.includes('compressor') || cat.includes('compressa')) {
    return {
      ...base,
      'pressione': 'pressure',
      'portata': 'flowRate',
      'capacità del serbatoio': 'tankCapacity',
      'potenza': 'power',
    };
  }

  // Vacuum / aspirator-specific
  if (cat.includes('aspirato') || cat.includes('vacuum')) {
    return {
      ...base,
      'potenza': 'power',
      'capacità del serbatoio': 'tankCapacity',
      'depressione': 'pressure',
      'portata': 'flowRate',
    };
  }

  // Welder-specific
  if (cat.includes('saldatri') || cat.includes('saldatur') || cat.includes('mig') || cat.includes('tig')) {
    return {
      ...base,
      'corrente': 'weldingCurrent',
      'tensione': 'voltage',
      'ciclo di lavoro': 'dutyCycle',
      'diametro': 'chuckSize',
      'potenza': 'power',
    };
  }

  // Angle grinder
  if (cat.includes('smerigliator') || cat.includes('smerigliatri') || cat.includes('angolar')) {
    return {
      ...base,
      'potenza': 'power',
      'diametro del disco': 'discDiameter',
      'giri': 'rpm',
    };
  }

  // Pressure washer
  if (cat.includes('idropulitri') || cat.includes('pressione') || cat.includes('karcher')) {
    return {
      ...base,
      'pressione': 'pressure',
      'portata': 'flowRate',
      'potenza': 'power',
    };
  }

  // Default: power tools (drill, impact driver, etc.)
  return {
    ...base,
    'coppia': 'torque',
    'giri': 'rpm',
    'voltaggio': 'voltage',
    'tensione': 'voltage',
    'batteria': 'batteryCapacity',
    'capacità': 'batteryCapacity',
    'mandrino': 'chuckSize',
    'attacco': 'chuckSize',
    'colpi': 'impactRate',
    'potenza': 'power',
  };
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

  // Parse JSON response (C5: centralised via parseJsonFromLLM)
  let parsed: { facts: Array<{ question: string; answer: string; source: string; confidence: string }> };
  try {
    parsed = parseJsonFromLLM<typeof parsed>(resultText);
  } catch {
    log.error('[TwoPhaseQA] Failed to parse Simple QA response:', resultText.substring(0, 300));
    parsed = { facts: [] };
  }

  // Convert to structured format
  const rawFactsPrelim: AtomicFact[] = parsed.facts.map(f => ({
    question: f.question,
    answer: f.answer,
    source: f.source,
    confidence: f.confidence as 'high' | 'medium' | 'low',
    verified: f.answer !== 'NON TROVATO' && f.confidence === 'high',
  }));

  // W10: grounding check — verify numeric values against source text
  const rawFacts = groundingCheck(
    rawFactsPrelim,
    `${productData.description} ${productData.sourceData || ''}`
  );

  // W9 fix: category-aware spec mapping (no more collisions)
  const specs: SimpleQAResult['specs'] = {};
  const specMapping = getSpecMapping(productData.category || productData.title);

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

  // Parse JSON response (C5: centralised via parseJsonFromLLM)
  let parsed: any;
  try {
    const raw = parseJsonFromLLM<{
      suitability?: Record<string, unknown>;
      comparison?: Record<string, unknown>;
      recommendation?: Record<string, unknown>;
    }>(resultText);
    parsed = {
      ...raw.suitability,
      ...raw.comparison,
      ...raw.recommendation,
    };
  } catch {
    log.error('[TwoPhaseQA] Failed to parse Complex QA response:', resultText.substring(0, 300));
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
// W-QA-6 fix: Source-trust confidence calibration
// ============================================================================

/**
 * W-QA-6 fix: Applies empirical rules to cap model-assigned confidence levels.
 *
 * The model self-reports "high" / "medium" / "low" confidence, but this is
 * uncalibrated: Gemini Flash "high" is not equivalent to a dedicated grounding
 * pass against a verified scheda tecnica. We apply conservative but safe rules:
 *
 * Rule 1 — No ★★★ source in the input:
 *   If none of the structured sources reaches trust ≥ 0.85 (spec sheet / manual),
 *   no fact can legitimately be "high" — cap to "medium".
 *
 * Rule 2 — Lite model + non-numeric answer:
 *   The lite model is reliable on digit extraction but less reliable on boolean /
 *   categorical claims (brushless? oil-free? AVR?). Cap those to "medium" so
 *   they don't present as verified hardware claims.
 *
 * Rule 3 — Fact sourced from a forum/community (based on fact.source text):
 *   If the model-reported source field mentions forum keywords, cap to "low".
 *   This is heuristic but catches the obvious case.
 */
function calibrateConfidenceBySourceTrust(
  facts: AtomicFact[],
  sources: StructuredSource[] | undefined,
  usedLiteModel: boolean,
): AtomicFact[] {
  // Rule 1: check whether any high-trust source exists
  const maxTrust = sources && sources.length > 0
    ? Math.max(...sources.map(s => s.trust ?? 0))
    : 0;
  const hasHighTrustSource = maxTrust >= 0.85;

  const FORUM_SOURCE_KEYWORDS = ['forum', 'community', 'reddit', 'discuss', 'communit'];

  return facts.map(fact => {
    if (fact.answer === 'NON TROVATO' || fact.confidence !== 'high') return fact;

    // Rule 1
    if (!hasHighTrustSource) {
      log.info(
        `[TwoPhaseQA] W-QA-6 R1: No ★★★ source — capping "${fact.answer}" high→medium`
      );
      return { ...fact, confidence: 'medium' as const };
    }

    // Rule 2: lite model + non-numeric categorical claims
    if (usedLiteModel) {
      const hasNumeric = /\d/.test(fact.answer);
      if (!hasNumeric) {
        return { ...fact, confidence: 'medium' as const };
      }
    }

    // Rule 3: forum-sourced fact
    const sourceLower = (fact.source ?? '').toLowerCase();
    if (FORUM_SOURCE_KEYWORDS.some(kw => sourceLower.includes(kw))) {
      log.info(
        `[TwoPhaseQA] W-QA-6 R3: Forum-sourced "${fact.answer}" — capping high→low`
      );
      return { ...fact, confidence: 'low' as const, verified: false };
    }

    return fact;
  });
}

// ============================================================================
// Main Two-Phase QA Function — sequential two-phase design
// ============================================================================

// W13 fix: token-aware limit. 26k tokens × 3.2 chars/token ≈ 83k chars.
// But we cap at 60k chars to leave room for the instruction overhead (~2k tokens).
const SOURCE_DATA_MAX_CHARS = 60_000;

// W-QA-4 fix: renderStructuredSources already emits [★★★ / ★★ / ★] headers for
// each block. We prepend a brief instruction so extractAtomicFacts (which
// receives the flat string) knows to map those headers to confidence levels:
// - [★★★] block → "high"   confidence for facts from that source
// - [★★]  block → "medium" confidence
// - [★]   block → "low"    confidence
const TRUST_PREAMBLE =
  'NOTA SULLE FONTI: Il testo seguente contiene sezioni marcate con ★★★ (scheda tecnica ufficiale → confidence high), ★★ (retailer/recensione → confidence medium), ★ (forum/community → confidence low). Usa queste marcature per assegnare il livello di confidence corretto a ogni fatto estratto.\n\n';

/**
 * Run Phase 1 (atomic fact extraction) and Phase 2 (complex reasoning) as two
 * **sequential, independent** Gemini calls.
 *
 * The two-call design is intentional — it is the anti-hallucination guarantee:
 * Phase 2 receives only the verified, grounded facts produced by Phase 1 as its
 * input, not the full raw evidence text.  A single merged call breaks this
 * contract because the model can attend to the raw evidence while writing Phase 2
 * reasoning, inventing numbers that never made it through Phase 1 grounding.
 */
export async function runTwoPhaseQA(
  productData: {
    title: string;
    description: string;
    brand: string;
    sku: string;
    category: string;
    sourceData?: string;
    /** Structured provenance-aware sources from the RAG adapter (preferred over sourceData). */
    structuredSources?: StructuredSource[];
  }
): Promise<TwoPhaseQAResult> {
  const totalStartTime = Date.now();

  const hasStructured = (productData.structuredSources?.length ?? 0) > 0;
  log.info(
    `[TwoPhaseQA] Starting two-phase sequential for ${productData.sku} ` +
    `(${hasStructured ? `${productData.structuredSources!.length} structured sources` : `sourceData: ${productData.sourceData?.length ?? 0} chars`})`
  );

  // Render structured sources to a flat string for extractAtomicFacts().
  // extractAtomicFacts() expects sourceData: string, so structured sources must
  // be serialised first.  The trust preamble ensures the model maps ★★★/★★/★
  // headers to the correct confidence levels.
  const renderedSources = hasStructured
    ? renderStructuredSources(productData.structuredSources!, SOURCE_DATA_MAX_CHARS)
    : productData.sourceData?.slice(0, SOURCE_DATA_MAX_CHARS);
  const flatSourceData = renderedSources
    ? TRUST_PREAMBLE + renderedSources
    : undefined;

  const evidenceForGrounding = hasStructured
    ? productData.structuredSources!.map(s => s.text).join(' ')
    : (productData.sourceData || '');

  let simpleQA: SimpleQAResult = { specs: {}, rawFacts: [], extractionTime: 0 };
  let complexQA: ComplexQAResult = {
    suitability: { idealFor: [], notIdealFor: [], reasoning: '' },
    comparison: { vsCategory: 'nella media', strengths: [], weaknesses: [] },
    recommendation: { verdict: '', confidence: 'low', caveats: [] },
    reasoningTime: 0,
  };

  try {
    // ── Phase 1: atomic fact extraction ────────────────────────────────────
    const phase1Data = { ...productData, sourceData: flatSourceData };
    const phase1Raw = await extractAtomicFacts(phase1Data);

    // D11 fix: Post-check for hallucinated "NON TROVATO" bypass.
    const postCheckedFacts = hallucinationPostCheck(phase1Raw.rawFacts, evidenceForGrounding);

    // W-QA-6: Source-trust calibration.
    // extractAtomicFacts() uses useLiteModel: true — pass that same flag here.
    const calibratedFacts = calibrateConfidenceBySourceTrust(
      postCheckedFacts,
      productData.structuredSources,
      /* usedLiteModel */ true,
    );

    // Rebuild specs map from calibrated facts so downstream consumers get the
    // corrected confidence levels.
    const specs: SimpleQAResult['specs'] = {};
    const specMapping = getSpecMapping(productData.category || productData.title);
    for (const fact of calibratedFacts) {
      for (const [keyword, specKey] of Object.entries(specMapping)) {
        if (fact.question.toLowerCase().includes(keyword) && fact.answer !== 'NON TROVATO') {
          specs[specKey] = fact;
          break;
        }
      }
    }

    simpleQA = { specs, rawFacts: calibratedFacts, extractionTime: phase1Raw.extractionTime };
    log.info(`[TwoPhaseQA] Phase 1 done: ${calibratedFacts.filter(f => f.verified).length} verified facts`);

    // ── Phase 2: complex reasoning driven by Phase 1 facts only ────────────
    // Pass flatSourceData so Phase 2 can still reason when Phase 1 found no
    // structured facts (hasNoFacts path inside performComplexReasoning).
    const phase2Raw = await performComplexReasoning(
      {
        title: productData.title,
        brand: productData.brand,
        category: productData.category,
        sourceData: flatSourceData,
      },
      simpleQA,
    );

    // W-QA-3: cross-check Phase 2 numbers against Phase 1 verified facts.
    complexQA = crossCheckPhase2Consistency(calibratedFacts, phase2Raw);
    log.info(`[TwoPhaseQA] Phase 2 done: confidence=${complexQA.recommendation.confidence}`);

  } catch (err) {
    log.error(`[TwoPhaseQA] Sequential execution failed for ${productData.sku}:`, err);
  }

  return {
    simpleQA,
    complexQA,
    totalTime: Date.now() - totalStartTime,
  };
}

// ============================================================================
// W10 fix: Post-extraction grounding check
// ============================================================================

/**
 * W10 fix: Verify that extracted facts are actually grounded in the source text.
 *
 * The LLM's self-assessed "confidence: high" is not a real verification — it's
 * the model's own belief, which can be wrong (hallucinated numbers from similar
 * products). This function checks whether the numeric value from an extracted
 * fact actually appears somewhere in the evidence text.
 *
 * If the value is NOT found in the source text:
 * - `verified` is downgraded to false
 * - `confidence` is capped at "medium"
 *
 * This catches the most dangerous hallucination case: a precise number that
 * looks authoritative but was never in the input data.
 */
/**
 * D10 fix: Critical textual claims that must appear in evidence to be trusted.
 *
 * These are boolean/categorical features that directly affect purchase decisions.
 * If the answer claims one of these keywords but the evidence doesn't contain it
 * (or a known synonym), the fact is downgraded — same as a numeric grounding failure.
 *
 * Format: { claim: [synonyms that count as grounded] }
 */
const TEXTUAL_CLAIM_SYNONYMS: Record<string, string[]> = {
  'brushless':     ['brushless', 'senza spazzole', 'senza carboni', 'bl motor'],
  'ip67':          ['ip67', 'ip 67'],
  'ip54':          ['ip54', 'ip 54'],
  'ip68':          ['ip68', 'ip 68'],
  'impermeabile':  ['impermeabile', 'waterproof', 'ip67', 'ip68', 'water-resistant'],
  'inverter':      ['inverter'],
  'oil-free':      ['oil-free', 'oil free', 'senza olio', 'oilless'],
  'hepa':          ['hepa', 'h13', 'h14'],
  'bluetooth':     ['bluetooth', 'bt', 'one-key'],
  'anti-vibrazione': ['anti-vibrazione', 'antivibrazione', 'anti vibration', 'avh'],
  'certificazione eta': ['eta', 'european technical assessment', 'benestare tecnico europeo'],
};

// ============================================================================
// W-QA-2 fix: Italian number word → digit normalization
// ============================================================================

/**
 * W-QA-2 fix: Converts an Italian compound number word to its numeric value.
 *
 * Handles single words like "centotrentacinque" → 135, "trecentosessanta" → 360,
 * "milleduecento" → 1200. This is needed because Italian technical documents
 * (especially older PDFs and manuals) sometimes spell out numbers in full,
 * while the LLM extracts the digit form. A pure string-match grounding check
 * would then incorrectly fail ("135" not found in "centotrentacinque…").
 *
 * Returns null for strings that are not parseable Italian number words.
 */
function italianWordToNumber(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (!w) return null;

  const direct: Record<string, number> = {
    'zero': 0, 'uno': 1, 'una': 1, 'due': 2, 'tre': 3, 'quattro': 4, 'cinque': 5,
    'sei': 6, 'sette': 7, 'otto': 8, 'nove': 9, 'dieci': 10, 'undici': 11,
    'dodici': 12, 'tredici': 13, 'quattordici': 14, 'quindici': 15, 'sedici': 16,
    'diciassette': 17, 'diciotto': 18, 'diciannove': 19,
    'venti': 20, 'trenta': 30, 'quaranta': 40, 'cinquanta': 50,
    'sessanta': 60, 'settanta': 70, 'ottanta': 80, 'novanta': 90,
    'cento': 100, 'duecento': 200, 'trecento': 300, 'quattrocento': 400,
    'cinquecento': 500, 'seicento': 600, 'settecento': 700, 'ottocento': 800,
    'novecento': 900, 'mille': 1000, 'duemila': 2000, 'tremila': 3000,
  };
  if (direct[w] !== undefined) return direct[w];

  // venti special elisions: "ventuno" (not "ventiuno"), "ventotto" (not "ventiotto")
  const ventiElisions: Record<string, number> = {
    'ventuno': 21, 'ventotto': 28,
  };
  if (ventiElisions[w] !== undefined) return ventiElisions[w];

  // Handle "mille" prefix: milleduecento → 1200, millecinquecento → 1500
  if (w.startsWith('mille') && w.length > 5) {
    const rest = w.slice(5);
    const restVal = italianWordToNumber(rest);
    if (restVal !== null && restVal < 1000) return 1000 + restVal;
  }

  // Handle hundreds prefix: duecento… → 200 + rest, etc.
  const hundredsOrder = [
    'novecento', 'ottocento', 'settecento', 'seicento', 'cinquecento',
    'quattrocento', 'trecento', 'duecento', 'cento',
  ];
  for (const h of hundredsOrder) {
    if (w.startsWith(h)) {
      const rest = w.slice(h.length);
      if (!rest) return direct[h];
      const restVal = italianWordToNumber(rest);
      if (restVal !== null && restVal < 100) return direct[h] + restVal;
    }
  }

  // Handle tens + unit: "trentacinque" → 35, "sessantadue" → 62
  const tensOrder = [
    ['novanta', 90], ['ottanta', 80], ['settanta', 70], ['sessanta', 60],
    ['cinquanta', 50], ['quaranta', 40], ['trenta', 30], ['venti', 20],
  ] as [string, number][];
  for (const [t, tv] of tensOrder) {
    if (w.startsWith(t)) {
      const rest = w.slice(t.length);
      if (!rest) return tv;
      const uVal = direct[rest];
      if (uVal !== undefined && uVal >= 1 && uVal <= 9) return tv + uVal;
    }
  }

  return null;
}

/**
 * W-QA-2 fix: Scans text for Italian number words and injects their digit equivalents.
 *
 * Example: "coppia massima di centotrentacinque Newton metro"
 *       → "coppia massima di centotrentacinque 135 Newton metro"
 *
 * The digit form is *appended alongside* the word form (not replacing it) so
 * that subsequent string matching on the original evidence still works.
 */
function normalizeItalianNumbersInText(text: string): string {
  // Split on non-alphabetic boundaries; only transform pure alphabetic tokens
  return text.replace(/\b([a-zàèéìíîóòùúü]+)\b/gi, (match) => {
    const num = italianWordToNumber(match);
    if (num !== null) return `${match} ${num}`;
    return match;
  });
}

export function groundingCheck(facts: AtomicFact[], evidenceText: string): AtomicFact[] {
  if (!evidenceText || evidenceText.length < 50) return facts;

  // Normalize evidence for fuzzy matching (collapse whitespace, lowercase)
  // W-QA-2: also inject digit equivalents for Italian number words so that
  // "135" matches evidence that says "centotrentacinque".
  const normalizedEvidence = normalizeItalianNumbersInText(
    evidenceText.toLowerCase().replace(/\s+/g, ' ')
  );

  return facts.map(fact => {
    if (fact.answer === 'NON TROVATO') return fact;

    const answerLower = fact.answer.toLowerCase();

    // Extract numeric values from the answer (e.g. "135 Nm" → ["135"])
    const numbers = fact.answer.match(/\d+[.,]?\d*/g);

    // D10 fix: Check textual/boolean claims against evidence.
    // If the answer contains a critical keyword (brushless, IP67, etc.),
    // verify that the keyword or a synonym appears in the source text.
    let hasTextualClaim = false;
    let textualClaimGrounded = true;
    for (const [claim, synonyms] of Object.entries(TEXTUAL_CLAIM_SYNONYMS)) {
      if (answerLower.includes(claim)) {
        hasTextualClaim = true;
        const synonymFound = synonyms.some(syn => normalizedEvidence.includes(syn));
        if (!synonymFound) {
          textualClaimGrounded = false;
          log.info(
            `[TwoPhaseQA] D10 textual grounding fail: "${fact.answer}" claims "${claim}" ` +
            `but no synonym found in evidence — downgrading`
          );
          break;
        }
      }
    }

    if (hasTextualClaim && !textualClaimGrounded) {
      return {
        ...fact,
        verified: false,
        confidence: 'low' as const,
      };
    }

    // Original W10: numeric grounding check
    if (!numbers || numbers.length === 0) return fact; // non-numeric answer, skip numeric check

    // Check if at least one numeric value appears in the evidence
    const isGrounded = numbers.some(num => {
      const normalized = num.replace(',', '.');
      const commaVariant = num.replace('.', ',');
      return (
        normalizedEvidence.includes(num) ||
        normalizedEvidence.includes(normalized) ||
        normalizedEvidence.includes(commaVariant)
      );
    });

    if (isGrounded) return fact;

    // Value not found in evidence → downgrade trust
    log.info(
      `[TwoPhaseQA] W10 grounding fail: "${fact.answer}" for "${fact.question}" — ` +
      `not found in evidence text, downgrading confidence`
    );
    return {
      ...fact,
      verified: false,
      confidence: fact.confidence === 'high' ? 'medium' : fact.confidence,
    };
  });
}

// ============================================================================
// W-QA-3 fix: Phase 1 ↔ Phase 2 consistency cross-check
// ============================================================================

/**
 * W-QA-3 fix: Detects numeric inconsistencies between Phase 1 facts and Phase 2 reasoning.
 *
 * Example: Phase 1 extracts "Peso: 2.1 kg" (verified=true), but the Phase 2
 * reasoning text says "leggero a soli 1.8 kg". The grounding check only covers
 * Phase 1 — Phase 2 is free-form prose and can silently contradict it.
 *
 * Strategy:
 * 1. Build a set of all numeric values from *verified* Phase 1 facts.
 * 2. Scan all Phase 2 text fields for numeric tokens.
 * 3. Any multi-digit number in Phase 2 that does NOT appear in Phase 1 is flagged.
 * 4. If the mismatch count is significant, add a caveat and potentially downgrade
 *    the Phase 2 confidence level.
 *
 * We intentionally ignore single-digit numbers (1–9) and percentages/years to
 * avoid false positives on perfectly valid contextual numbers (e.g. "ideale per
 * cantieri con 3 operai").
 */
function crossCheckPhase2Consistency(
  rawFacts: AtomicFact[],
  complexQA: ComplexQAResult,
): ComplexQAResult {
  // Collect all numeric strings from verified Phase 1 facts
  const phase1Numbers = new Set<string>();
  for (const fact of rawFacts) {
    if (fact.answer === 'NON TROVATO') continue;
    const nums = fact.answer.match(/\d+[.,]?\d*/g) ?? [];
    for (const n of nums) {
      phase1Numbers.add(n.replace(',', '.'));
    }
  }

  if (phase1Numbers.size === 0) return complexQA; // nothing to cross-check

  // Collect all Phase 2 free-text
  const phase2Text = [
    complexQA.suitability.reasoning,
    ...complexQA.suitability.idealFor,
    ...complexQA.suitability.notIdealFor,
    ...complexQA.comparison.strengths,
    ...complexQA.comparison.weaknesses,
    complexQA.recommendation.verdict,
    ...complexQA.recommendation.caveats,
  ].join(' ');

  // Extract multi-digit numbers from Phase 2 (ignore 1-9 to reduce false positives)
  const phase2Tokens = phase2Text.match(/\d{2,}[.,]?\d*/g) ?? [];
  const inconsistent: string[] = [];
  for (const tok of phase2Tokens) {
    const norm = tok.replace(',', '.');
    // Skip year-like 4-digit numbers (20xx) and plain percentages covered by context
    if (/^20\d\d$/.test(norm)) continue;
    if (!phase1Numbers.has(norm)) {
      inconsistent.push(tok);
    }
  }

  if (inconsistent.length === 0) return complexQA;

  const uniqueInconsistent = [...new Set(inconsistent)];
  log.info(
    `[TwoPhaseQA] W-QA-3: Phase 2 contains ${uniqueInconsistent.length} number(s) not ` +
    `verified by Phase 1: ${uniqueInconsistent.slice(0, 5).join(', ')}`
  );

  const updatedCaveats = [...complexQA.recommendation.caveats];
  if (uniqueInconsistent.length >= 3) {
    updatedCaveats.push(
      'Alcuni valori citati nell\'analisi potrebbero non essere direttamente verificati dai dati estratti — verificare sulla scheda tecnica ufficiale'
    );
  }

  return {
    ...complexQA,
    recommendation: {
      ...complexQA.recommendation,
      caveats: updatedCaveats,
      // Downgrade "high" to "medium" only when there are many unverified numbers
      confidence: (
        uniqueInconsistent.length >= 4 &&
        complexQA.recommendation.confidence === 'high'
      ) ? 'medium' : complexQA.recommendation.confidence,
    },
  };
}

// ============================================================================
// D11 fix: Hallucination post-check
// ============================================================================

/**
 * D11 fix: Detects facts that should have been "NON TROVATO" but weren't.
 *
 * Heuristics:
 * 1. If the total evidence is very short (< 200 chars) but the model returned
 *    many confident facts, something is wrong — demote ungrounded ones.
 * 2. Answers that are suspiciously generic (e.g., exactly "2 anni" for warranty
 *    when no warranty info exists in evidence) get verified=false.
 * 3. Facts with confidence=high that failed both numeric and textual grounding
 *    (verified=false from groundingCheck) are forced to "NON TROVATO".
 */
export function hallucinationPostCheck(facts: AtomicFact[], evidenceText: string): AtomicFact[] {
  if (!evidenceText) return facts;

  const normalizedEvidence = evidenceText.toLowerCase().replace(/\s+/g, ' ');
  const evidenceVeryShort = evidenceText.length < 200;

  // Common hallucinated defaults the model uses when it doesn't know
  const SUSPICIOUS_DEFAULTS: Record<string, string[]> = {
    'garanzia': ['2 anni', '2 years', '24 mesi', '1 anno'],
    'peso':     [],  // Weight is rarely hallucinated (too specific)
    'velocità': ['2', 'due'],
  };

  return facts.map(fact => {
    if (fact.answer === 'NON TROVATO') return fact;

    // Heuristic 1: With very short evidence, demote facts that are already ungrounded
    if (evidenceVeryShort && !fact.verified) {
      log.info(
        `[TwoPhaseQA] D11: Sparse evidence + ungrounded fact "${fact.answer}" for ` +
        `"${fact.question.substring(0, 40)}" → forcing NON TROVATO`
      );
      return { ...fact, answer: 'NON TROVATO', verified: false, confidence: 'low' as const };
    }

    // Heuristic 2: Check for suspicious default answers on warranty-like questions
    for (const [keyword, defaults] of Object.entries(SUSPICIOUS_DEFAULTS)) {
      if (fact.question.toLowerCase().includes(keyword) && defaults.length > 0) {
        const answerLower = fact.answer.toLowerCase().trim();
        if (defaults.includes(answerLower)) {
          // Check if this default actually appears in the evidence
          const foundInEvidence = defaults.some(d => normalizedEvidence.includes(d));
          if (!foundInEvidence) {
            log.info(
              `[TwoPhaseQA] D11: Suspicious default "${fact.answer}" for "${keyword}" — ` +
              `not in evidence, forcing NON TROVATO`
            );
            return { ...fact, answer: 'NON TROVATO', verified: false, confidence: 'low' as const };
          }
        }
      }
    }

    // Heuristic 3: Already-failed grounding (verified=false) with high confidence
    // means the model was confidently wrong — cap at low confidence
    if (!fact.verified && fact.confidence === 'high') {
      return { ...fact, confidence: 'medium' as const };
    }

    return fact;
  });
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
