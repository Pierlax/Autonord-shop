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

/** Quality below this threshold triggers a second retrieval pass. */
const QUALITY_THRESHOLD = 0.52;

/** Use LLM evaluation only when rule score is in this ambiguous range. */
const LLM_EVAL_RANGE = { min: 0.35, max: 0.70 };

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
  vendor: string
): Promise<EvaluationResult> {
  const summary = evidenceGraph.getSummary();
  const conflicts = evidenceGraph.detectConflicts();
  const ruleScore = computeRuleScore(corpus, summary, conflicts.length);

  const isAmbiguous = ruleScore >= LLM_EVAL_RANGE.min && ruleScore <= LLM_EVAL_RANGE.max;

  // Fast path — skip LLM
  if (!isAmbiguous || corpus.totalItems === 0) {
    return buildEvaluationResult(ruleScore, corpus, summary, conflicts.length, 'rule-based');
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
      needsSecondPass: llmScore < QUALITY_THRESHOLD,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : identifyGaps(corpus, summary),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : identifyStrengths(corpus, summary),
      conflictsFound: conflicts.length,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : `LLM score=${llmScore.toFixed(2)}`,
    };
  } catch (err) {
    log.error('[EvaluatorOptimizer] LLM evaluation failed, using rule-based fallback:', err);
    return buildEvaluationResult(ruleScore, corpus, summary, conflicts.length, 'rule-based (LLM failed)');
  }
}

// ---------------------------------------------------------------------------
// Gap query generation
// ---------------------------------------------------------------------------

/**
 * Generate targeted search queries to fill the gaps identified by the evaluator.
 *
 * Called by UniversalRAG when needsSecondPass is true.
 */
export function generateGapQueries(
  gaps: string[],
  productTitle: string,
  vendor: string,
  sku?: string | null
): string[] {
  const base = sku ? `${vendor} ${productTitle} ${sku}` : `${vendor} ${productTitle}`;
  const queries: string[] = [];

  for (const gap of gaps) {
    const gapLow = gap.toLowerCase();

    if (gapLow.includes('manuale') || gapLow.includes('pdf')) {
      queries.push(`${base} manuale istruzioni PDF download`);
      queries.push(`${base} instruction manual PDF`);
    }
    if (gapLow.includes('scheda tecnica') || gapLow.includes('specifiche')) {
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

  // Deduplicate and cap
  return Array.from(new Set(queries)).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildEvaluationResult(
  score: number,
  corpus: CorpusCollection,
  summary: EvidenceGraphSummary,
  conflictCount: number,
  method: string
): EvaluationResult {
  return {
    qualityScore: score,
    coherenceScore: conflictCount === 0 ? 0.90 : Math.max(0.50, 0.90 - conflictCount * 0.08),
    coverageScore: corpus.coverageScore,
    needsSecondPass: score < QUALITY_THRESHOLD,
    gaps: identifyGaps(corpus, summary),
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

function identifyGaps(corpus: CorpusCollection, summary: EvidenceGraphSummary): string[] {
  const gaps: string[] = [];
  if (!corpus.hasPdf && summary.manualCount === 0) gaps.push('manuale PDF mancante');
  if (!corpus.hasTable && !(corpus.byType.spec_sheet?.length)) gaps.push('scheda tecnica strutturata mancante');
  if (summary.batteryCount === 0) gaps.push('informazioni batteria/compatibilità mancanti');
  if (summary.reviewCount === 0) gaps.push('recensioni e opinioni mancanti');
  if (corpus.totalItems < 3) gaps.push('corpus insufficiente');
  if (!corpus.hasImage) gaps.push('immagini prodotto mancanti');
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
