/**
 * Evaluator-Optimizer — Universal RAG v2, Layer 7 (loop component)
 *
 * Valuta la qualità del corpus raccolto e, se insufficiente, genera query
 * mirate per una seconda pass di retrieval (iterative retrieval agentico).
 *
 * Flusso:
 *   Corpus + EvidenceGraph → EvaluationResult
 *   Se needsSecondPass → generateGapQueries → seconda retrieval (nel chiamante)
 *   → repeat max maxPasses volte
 *
 * La valutazione usa un percorso fast (rule-based) e uno slow (LLM) a seconda
 * del quality score stimato: se il corpus è chiaramente buono o vuoto,
 * salta la chiamata LLM per risparmiare latency e costi.
 */

import { loggers } from '@/lib/logger';
import { generateTextSafe } from '@/lib/shopify/ai-client';
import { CorpusCollection } from './corpus-builder';
import { EvidenceGraph, EvidenceGraphSummary } from './evidence-graph';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  qualityScore: number;      // 0-1 overall quality
  coherenceScore: number;    // 0-1 consistency across sources
  coverageScore: number;     // 0-1 topic coverage (mirrors corpus.coverageScore)
  needsSecondPass: boolean;  // true if quality < threshold
  gaps: string[];            // Missing information categories
  strengths: string[];       // Well-covered aspects
  conflictsFound: number;
  reasoning: string;
}

export interface OptimizationPass {
  passNumber: number;
  gapsFilled: string[];
  gapQueries: string[];
  qualityBefore: number;
  qualityAfter: number;
}

export interface OptimizerResult {
  evaluation: EvaluationResult;
  passes: OptimizationPass[];
  originalQuality: number;
  finalQuality: number;
  passesUsed: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * W4 fix: Adaptive quality threshold.
 *
 * The fixed 0.52 threshold was unreachable for most products (typical rule
 * score = 0.35–0.45 with just PDF + text). Now the threshold scales with
 * corpus size: tiny corpora use a lower bar so the second pass actually
 * triggers and fills the gaps.
 */
function getQualityThreshold(corpusSize: number): number {
  if (corpusSize < 3) return 0.35;  // tiny corpus → aggressive second pass
  if (corpusSize < 5) return 0.42;  // small corpus → moderate threshold
  if (corpusSize < 10) return 0.48; // medium corpus → near-original
  return 0.52;                      // rich corpus → strict as before
}

/** Use LLM evaluation only when rule score is in this ambiguous range. */
const LLM_EVAL_RANGE = { min: 0.30, max: 0.70 };

// ---------------------------------------------------------------------------
// Spec coverage — contextual gap detection
// ---------------------------------------------------------------------------

/**
 * A measurable product specification: pattern to detect its presence in text,
 * Italian label for gap messages, and query suffixes for targeted retrieval.
 */
interface SpecField {
  key: string;
  /** Italian label shown in gap log messages. */
  label: string;
  /**
   * Detects this spec in a corpus text string.
   * Must NOT use the /g flag — avoids the stateful lastIndex bug.
   */
  pattern: RegExp;
  /** [0] Italian query suffix, [1] English query suffix. */
  queryTerms: [string, string];
}

const SPEC_FIELDS: SpecField[] = [
  {
    key: 'peso',
    label: 'peso (kg)',
    pattern: /\b\d[\d.,]*\s*kg\b/i,
    queryTerms: ['peso kg scheda tecnica', 'weight kg specifications'],
  },
  {
    key: 'potenza',
    label: 'potenza (W/kW)',
    pattern: /\b\d[\d.,]*\s*(kW|watt|W)\b(?!\w)/i,
    queryTerms: ['potenza W watt specifiche', 'power output specifications'],
  },
  {
    key: 'coppia',
    label: 'coppia massima (Nm)',
    pattern: /\b\d[\d.,]*\s*Nm\b/,
    queryTerms: ['coppia massima Nm specifiche', 'torque Nm specifications'],
  },
  {
    key: 'tensione',
    label: 'tensione (V)',
    pattern: /\b\d[\d.,]*\s*V\b(?!\w)/i,
    queryTerms: ['tensione volt specifiche', 'voltage specifications'],
  },
  {
    key: 'batteria_ah',
    label: 'capacità batteria (Ah)',
    pattern: /\b\d[\d.,]*\s*Ah\b/i,
    queryTerms: ['capacità batteria Ah', 'battery capacity Ah'],
  },
  {
    key: 'velocita',
    label: 'velocità (rpm)',
    pattern: /\b\d[\d.,]*\s*rpm\b/i,
    queryTerms: ['giri minuto rpm velocità', 'rpm no-load speed'],
  },
  {
    key: 'rumore',
    label: 'livello sonoro (dB)',
    pattern: /\b\d[\d.,]*\s*dB(\(A\))?\b/i,
    queryTerms: ['livello sonoro dB emissione acustica', 'noise level dB specifications'],
  },
  {
    key: 'pressione',
    label: 'pressione massima (bar)',
    pattern: /\b\d[\d.,]*\s*bar\b/i,
    queryTerms: ['pressione massima bar specifiche', 'max pressure bar specifications'],
  },
  {
    key: 'portata',
    label: 'portata (l/min)',
    pattern: /\b\d[\d.,]*\s*(l\/min|litri\/min|m3\/h|m³\/h)\b/i,
    queryTerms: ['portata litri minuto specifiche', 'flow rate specifications'],
  },
];

/** Fast key → SpecField lookup. */
const SPEC_BY_KEY = new Map<string, SpecField>(SPEC_FIELDS.map(s => [s.key, s]));

/**
 * Scans the full corpus text for numeric spec values.
 * Returns the set of spec keys that are already present in at least one item.
 */
function scanCorpusForPresentSpecs(corpus: CorpusCollection): Set<string> {
  const allText = corpus.items.map(i => i.content).join('\n');
  const present = new Set<string>();
  for (const spec of SPEC_FIELDS) {
    if (spec.pattern.test(allText)) present.add(spec.key);
  }
  return present;
}

/**
 * Returns the spec keys that are typically expected for a product of this type.
 * Uses keyword matching on the product title — no AI call needed.
 */
function inferExpectedSpecKeys(productTitle: string): string[] {
  const t = productTitle.toLowerCase();

  if (/trapano|avvitatore|tassellatore|drill|driver|impact/.test(t))
    return ['coppia', 'peso', 'tensione', 'batteria_ah', 'velocita'];

  if (/smerigliatrice|grinder|flessibile|levigatrice|sander|polisher/.test(t))
    return ['potenza', 'peso', 'velocita'];

  if (/compressore|compressor/.test(t))
    return ['pressione', 'portata', 'potenza', 'peso'];

  if (/generatore|generator|elettrogeno/.test(t))
    return ['potenza', 'peso'];

  if (/sega|seghetto|troncatrice|saw|jigsaw|circular/.test(t))
    return ['potenza', 'peso', 'velocita'];

  if (/saldatrice|welder|mig|tig|mma/.test(t))
    return ['potenza', 'tensione', 'peso'];

  if (/fresatrice|router|pialla|planer/.test(t))
    return ['potenza', 'peso', 'velocita'];

  // Generic power tools — check the two most universal specs
  return ['potenza', 'peso'];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate corpus quality.
 *
 * Fast path (rule-based) → used when score is clearly good (≥0.70) or clearly bad (corpus empty).
 * Slow path (LLM) → used for ambiguous intermediate scores (0.35–0.70).
 */
export async function evaluateCorpus(
  corpus: CorpusCollection,
  evidenceGraph: EvidenceGraph,
  productTitle: string,
  vendor: string,
  /** W8: When provided and exhausted, skip LLM eval path. */
  aiBudget?: { maxCalls: number; usedCalls: number }
): Promise<EvaluationResult> {
  const summary = evidenceGraph.getSummary();
  const conflicts = evidenceGraph.detectConflicts();
  const ruleScore = computeRuleScore(corpus, summary, conflicts.length);

  const isAmbiguous = ruleScore >= LLM_EVAL_RANGE.min && ruleScore <= LLM_EVAL_RANGE.max;
  // W8: If AI budget is exhausted, force fast path (no LLM call)
  const budgetExhausted = aiBudget ? aiBudget.usedCalls >= aiBudget.maxCalls : false;

  const qualityThreshold = getQualityThreshold(corpus.totalItems);

  // Fast path — skip LLM
  if (!isAmbiguous || corpus.totalItems === 0 || budgetExhausted) {
    if (budgetExhausted) {
      log.info(`[EvaluatorOptimizer] W8: AI budget exhausted — using rule-based eval`);
    }
    return buildEvaluationResult(ruleScore, corpus, summary, conflicts.length, 'rule-based', qualityThreshold, productTitle);
  }

  // Slow path — LLM for borderline cases
  try {
    const preview = corpus.items
      .slice(0, 5)
      .map((i) => `[${i.type}] ${i.title}: ${i.content.slice(0, 100)}`)
      .join('\n');

    const prompt = `Valuta la qualità del corpus RAG per: ${vendor} ${productTitle}

CORPUS (${corpus.totalItems} item, ~${corpus.totalTokens} token):
${preview}

STATISTICHE:
- PDF trovati: ${corpus.hasPdf}
- Tabelle/spec strutturate: ${corpus.hasTable}
- Immagini: ${corpus.hasImage}
- Manuali (grafo): ${summary.manualCount}
- Conflitti dati: ${conflicts.length}
- Copertura stimata: ${(corpus.coverageScore * 100).toFixed(0)}%

Rispondi SOLO con JSON valido:
{
  "qualityScore": 0.0-1.0,
  "coherenceScore": 0.0-1.0,
  "gaps": ["gap1", "gap2"],
  "strengths": ["strength1"],
  "reasoning": "breve spiegazione (max 80 caratteri)"
}`;

    const result = await generateTextSafe({
      prompt,
      maxTokens: 350,
      temperature: 0.2,
      useLiteModel: true,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM evaluation response');

    const parsed = JSON.parse(jsonMatch[0]);
    const llmScore = typeof parsed.qualityScore === 'number' ? parsed.qualityScore : ruleScore;

    return {
      qualityScore: llmScore,
      coherenceScore: typeof parsed.coherenceScore === 'number' ? parsed.coherenceScore : 0.7,
      coverageScore: corpus.coverageScore,
      needsSecondPass: llmScore < qualityThreshold,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : identifyGaps(corpus, summary, productTitle),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : identifyStrengths(corpus, summary),
      conflictsFound: conflicts.length,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : `LLM score=${llmScore.toFixed(2)}`,
    };
  } catch (err) {
    log.error('[EvaluatorOptimizer] LLM evaluation failed, using rule-based fallback:', err);
    return buildEvaluationResult(ruleScore, corpus, summary, conflicts.length, 'rule-based (LLM failed)', qualityThreshold, productTitle);
  }
}

// ---------------------------------------------------------------------------
// Gap query generation
// ---------------------------------------------------------------------------

/**
 * Generate targeted search queries to fill the gaps identified by the evaluator.
 *
 * When `corpus` is provided the function performs **contextual gap analysis**:
 * it scans what numeric specs are already present in the corpus, then generates
 * queries that specifically target the missing ones.  Example: if the corpus
 * already contains "800 W" and "135 Nm" but no weight value, it emits
 * `"Milwaukee M18 BLPD2 peso kg scheda tecnica"` instead of the generic
 * `"Milwaukee M18 BLPD2 scheda tecnica specifiche datasheet"`.
 *
 * Without `corpus` (or on fallback) the original template-based approach is used.
 *
 * Called by UniversalRAG when needsSecondPass is true.
 */
export function generateGapQueries(
  gaps: string[],
  productTitle: string,
  vendor: string,
  sku?: string | null,
  corpus?: CorpusCollection | null,
): string[] {
  const base = sku ? `${vendor} ${productTitle} ${sku}` : `${vendor} ${productTitle}`;
  const queries: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Corpus-aware spec queries
  //    Inspect what numeric specs are present → target only the missing ones.
  // -------------------------------------------------------------------------
  if (corpus && corpus.totalItems > 0) {
    const presentSpecs = scanCorpusForPresentSpecs(corpus);
    const expectedKeys  = inferExpectedSpecKeys(productTitle);
    const missingKeys   = expectedKeys.filter(k => !presentSpecs.has(k));

    if (missingKeys.length > 0) {
      const presentLabels = expectedKeys
        .filter(k => presentSpecs.has(k))
        .map(k => SPEC_BY_KEY.get(k)?.label ?? k)
        .join(', ');
      const missingLabels = missingKeys.map(k => SPEC_BY_KEY.get(k)?.label ?? k).join(', ');
      log.info(
        `[EvaluatorOptimizer] Corpus ha: [${presentLabels || '—'}] ` +
        `— spec mancanti: [${missingLabels}]`
      );

      for (const key of missingKeys) {
        const spec = SPEC_BY_KEY.get(key);
        if (!spec) continue;
        queries.push(`${base} ${spec.queryTerms[0]}`); // Italian
        queries.push(`${base} ${spec.queryTerms[1]}`); // English
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Coarse-grain template queries (non-spec gaps: manual, reviews, images)
  //    The generic 'scheda tecnica' template is suppressed when corpus-aware
  //    queries already targeted individual spec values in block 1.
  // -------------------------------------------------------------------------
  for (const gap of gaps) {
    const gapLow = gap.toLowerCase();

    if (gapLow.includes('manuale') || gapLow.includes('pdf')) {
      queries.push(`${base} manuale istruzioni PDF download`);
      queries.push(`${base} instruction manual PDF`);
    }
    // Generic datasheet query only when corpus is not available (no context)
    if (!corpus && (gapLow.includes('scheda tecnica') || gapLow.includes('specifiche'))) {
      queries.push(`${base} scheda tecnica specifiche datasheet`);
      queries.push(`${base} technical specifications`);
    }
    if (gapLow.includes('batteria') || gapLow.includes('compatibil')) {
      queries.push(`${base} batteria compatibile accessori`);
      queries.push(`${base} compatible battery system`);
    }
    if (gapLow.includes('recensioni') || gapLow.includes('opinioni')) {
      queries.push(`${base} recensione test review professionisti`);
    }
    if (gapLow.includes('immagini')) {
      queries.push(`${base} foto immagine prodotto`);
    }
    if (gapLow.includes('ricambi') || gapLow.includes('parti')) {
      queries.push(`${base} ricambi pezzi spare parts`);
    }
  }

  // Deduplicate and cap (raised from 6 → 8 to accommodate per-spec queries)
  return Array.from(new Set(queries)).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildEvaluationResult(
  score: number,
  corpus: CorpusCollection,
  summary: EvidenceGraphSummary,
  conflictCount: number,
  method: string,
  threshold: number,
  productTitle?: string,
): EvaluationResult {
  return {
    qualityScore: score,
    coherenceScore: conflictCount === 0 ? 0.90 : Math.max(0.50, 0.90 - conflictCount * 0.08),
    coverageScore: corpus.coverageScore,
    needsSecondPass: score < threshold,
    gaps: identifyGaps(corpus, summary, productTitle),
    strengths: identifyStrengths(corpus, summary),
    conflictsFound: conflictCount,
    reasoning: `${method}: score=${score.toFixed(2)}, items=${corpus.totalItems}`,
  };
}

function computeRuleScore(
  corpus: CorpusCollection,
  summary: EvidenceGraphSummary,
  conflictCount: number
): number {
  let score = 0;

  // Content quantity
  if (corpus.totalItems >= 10) score += 0.18;
  else if (corpus.totalItems >= 5) score += 0.10;
  else if (corpus.totalItems >= 2) score += 0.05;

  // PDF / manual (highest value)
  if (corpus.hasPdf || summary.manualCount > 0) score += 0.27;

  // Structured data
  if (corpus.hasTable || (corpus.byType.spec_sheet?.length ?? 0) > 0) score += 0.22;

  // Text content
  if ((corpus.byType.paragraph?.length ?? 0) + (corpus.byType.document?.length ?? 0) > 0)
    score += 0.14;

  // Source diversity
  const uniqueDomains = new Set(corpus.items.map((i) => i.domain)).size;
  if (uniqueDomains >= 3) score += 0.14;
  else if (uniqueDomains >= 2) score += 0.07;

  // Conflict penalty
  score -= conflictCount * 0.04;

  return Math.max(0, Math.min(1, score));
}

function identifyGaps(
  corpus: CorpusCollection,
  summary: EvidenceGraphSummary,
  productTitle?: string,
): string[] {
  const gaps: string[] = [];
  if (!corpus.hasPdf && summary.manualCount === 0) gaps.push('manuale PDF mancante');
  if (!corpus.hasTable && !(corpus.byType.spec_sheet?.length)) gaps.push('scheda tecnica strutturata mancante');
  if (summary.batteryCount === 0) gaps.push('informazioni batteria/compatibilità mancanti');
  if (summary.reviewCount === 0) gaps.push('recensioni e opinioni mancanti');
  if (corpus.totalItems < 3) gaps.push('corpus insufficiente');
  if (!corpus.hasImage) gaps.push('immagini prodotto mancanti');

  // Spec-level gap detection — only when corpus has content worth analysing
  if (productTitle && corpus.totalItems > 0) {
    const presentSpecs = scanCorpusForPresentSpecs(corpus);
    const expectedKeys  = inferExpectedSpecKeys(productTitle);
    const missingKeys   = expectedKeys.filter(k => !presentSpecs.has(k));
    if (missingKeys.length > 0) {
      const missingLabels = missingKeys.map(k => SPEC_BY_KEY.get(k)?.label ?? k).join(', ');
      gaps.push(`specifiche numeriche incomplete: mancano ${missingLabels}`);
    }
  }

  return gaps;
}

function identifyStrengths(corpus: CorpusCollection, summary: EvidenceGraphSummary): string[] {
  const strengths: string[] = [];
  if (corpus.hasPdf) strengths.push('manuale PDF disponibile');
  if (corpus.hasTable) strengths.push('dati tabulari/specifiche strutturate presenti');
  if (summary.batteryCount > 0) strengths.push('compatibilità batteria identificata');
  if (summary.reviewCount > 0) strengths.push('recensioni disponibili');
  if (corpus.totalItems >= 10) strengths.push('corpus ricco e diversificato');
  return strengths;
}
