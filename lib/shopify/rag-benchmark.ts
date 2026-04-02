/**
 * RAG Benchmark — v1 vs v2 KPI measurement
 *
 * Misura i tre KPI principali per valutare il valore della Universal RAG v2:
 *
 *   KPI 1 — Coverage Gain
 *     Quante specifiche tecniche (spec: value pairs) vengono trovate in più
 *     rispetto alla v1. Ipotesi: routing + corpora tipizzati aumentano il recall utile.
 *
 *   KPI 2 — Precision after Expansion
 *     Delle evidenze aggiunte dal secondo retrieval pass (evaluator-optimizer),
 *     quante sono davvero rilevanti per il prodotto target.
 *     Trade-off critico: la letteratura mostra che qui si paga il costo dell'agentic loop.
 *
 *   KPI 3 — Loop Efficiency
 *     In quanti casi la seconda retrieval pass migliora effettivamente la qualità
 *     rispetto al costo aggiuntivo. Definita come:
 *       efficiency = (quality_after - quality_before) / passes_used
 *     Valori negativi o zero → loop non conveniente per quel prodotto.
 */

import { loggers } from '@/lib/logger';
import { UniversalRAGPipeline, UniversalRAGResult } from './universal-rag';
import { generateTextSafe } from './ai-client';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkProduct {
  title: string;
  vendor: string;
  productType: string;
  sku: string;
}

export interface CoverageGainResult {
  /** Unique spec:value pairs found in v1 corpus */
  v1SpecCount: number;
  /** Unique spec:value pairs found in v2 corpus */
  v2SpecCount: number;
  /** Absolute gain: v2 - v1 */
  absoluteGain: number;
  /** Relative gain: (v2 - v1) / v1, -1 if v1 = 0 */
  relativeGain: number;
  /** v1 evidence items */
  v1EvidenceItems: number;
  /** v2 evidence items (corpus + web) */
  v2EvidenceItems: number;
  /** v2 has PDF that v1 didn't */
  pdfGain: boolean;
  /** v2 has structured table/spec_sheet that v1 didn't */
  tableGain: boolean;
  /** Specs present in v2 but not in v1 */
  newSpecs: string[];
}

export interface PrecisionAfterExpansionResult {
  /** How many items were added by the evaluator-optimizer second pass */
  secondPassItems: number;
  /** Of those, how many are relevant (contain product keywords) */
  relevantItems: number;
  /** Precision: relevant / secondPassItems */
  precision: number;
  /** Irrelevant items found (for debugging) */
  irrelevantSamples: string[];
  /** Was LLM judge used for scoring? */
  usedLlmJudge: boolean;
}

export interface LoopEfficiencyResult {
  /** Initial quality score (before optimizer loop) */
  qualityBefore: number;
  /** Final quality score (after optimizer loop) */
  qualityAfter: number;
  /** Number of optimizer passes used */
  passesUsed: number;
  /** Efficiency = (qualityAfter - qualityBefore) / passesUsed (NaN if passesUsed=0) */
  efficiency: number;
  /** Was the loop beneficial? (efficiency > 0.05 threshold) */
  loopBeneficial: boolean;
  /** Gap queries that actually returned useful results */
  usefulGapQueries: string[];
  /** Per-pass breakdown */
  passSummary: Array<{ pass: number; qualityBefore: number; qualityAfter: number; gapsFilled: number }>;
}

export interface BenchmarkResult {
  product: BenchmarkProduct;
  coverageGain: CoverageGainResult;
  precisionAfterExpansion: PrecisionAfterExpansionResult;
  loopEfficiency: LoopEfficiencyResult;
  /** Raw v1 pipeline result (v2 disabled) */
  v1ExecutionMs: number;
  /** Raw v2 pipeline result */
  v2ExecutionMs: number;
  /** Overhead introduced by v2 layers: v2Ms - v1Ms */
  v2OverheadMs: number;
  /** Overall verdict */
  verdict: 'v2_wins' | 'v2_neutral' | 'v2_loses';
  verdictReason: string;
  timestamp: string;
}

export interface BenchmarkSummary {
  products: BenchmarkResult[];
  avgCoverageGain: number;
  avgPrecision: number;
  avgLoopEfficiency: number;
  loopBeneficialRate: number;   // fraction of products where loop helped
  avgV2OverheadMs: number;
  v2WinsRate: number;
}

// ---------------------------------------------------------------------------
// Main benchmark runner
// ---------------------------------------------------------------------------

/**
 * Run the complete 3-KPI benchmark for a single product.
 *
 * @param product  Product to benchmark
 * @param useLlmJudge  Use LLM to evaluate evidence relevance (slower, more accurate)
 */
export async function benchmarkProduct(
  product: BenchmarkProduct,
  useLlmJudge = false
): Promise<BenchmarkResult> {
  log.info(`[Benchmark] Starting for: ${product.vendor} ${product.title}`);

  // ── Run v1 pipeline (source discovery + navigation + corpus DISABLED) ──
  const v1Pipeline = new UniversalRAGPipeline({
    enableSourceDiscovery: false,
    enableDomainNavigation: false,
    enableCorpusBuilder: false,
    enableEvidenceGraph: false,
    enableEvaluatorOptimizer: false,
    maxRetrievalPasses: 1,
    debugMode: false,
  });

  const v1Start = Date.now();
  const v1Result = await v1Pipeline.enrichProduct(
    product.title, product.vendor, product.productType, product.sku, 'full'
  );
  const v1ExecutionMs = Date.now() - v1Start;

  // ── Run v2 pipeline (all layers enabled) ──
  const v2Pipeline = new UniversalRAGPipeline({
    enableSourceDiscovery: true,
    enableDomainNavigation: true,
    enableCorpusBuilder: true,
    enableEvidenceGraph: true,
    enableEvaluatorOptimizer: true,
    maxRetrievalPasses: 2,
    navigationBudgetPerDomain: 5,
    navigationDepth: 2,
    debugMode: false,
  });

  const v2Start = Date.now();
  const v2Result = await v2Pipeline.enrichProduct(
    product.title, product.vendor, product.productType, product.sku, 'full'
  );
  const v2ExecutionMs = Date.now() - v2Start;

  // ── KPI 1: Coverage Gain ──
  const coverageGain = computeCoverageGain(v1Result, v2Result, product);

  // ── KPI 2: Precision after Expansion ──
  const precisionAfterExpansion = await computePrecisionAfterExpansion(
    v2Result, product, useLlmJudge
  );

  // ── KPI 3: Loop Efficiency ──
  const loopEfficiency = computeLoopEfficiency(v2Result);

  // ── Verdict ──
  const { verdict, verdictReason } = computeVerdict(
    coverageGain, precisionAfterExpansion, loopEfficiency, v2ExecutionMs - v1ExecutionMs
  );

  const result: BenchmarkResult = {
    product,
    coverageGain,
    precisionAfterExpansion,
    loopEfficiency,
    v1ExecutionMs,
    v2ExecutionMs,
    v2OverheadMs: v2ExecutionMs - v1ExecutionMs,
    verdict,
    verdictReason,
    timestamp: new Date().toISOString(),
  };

  log.info(
    `[Benchmark] Done: verdict=${verdict}, ` +
    `coverageGain=${coverageGain.absoluteGain}, ` +
    `precision=${precisionAfterExpansion.precision.toFixed(2)}, ` +
    `loopEff=${loopEfficiency.efficiency.toFixed(2)}, ` +
    `overhead=${result.v2OverheadMs}ms`
  );

  return result;
}

/**
 * Run benchmark across multiple products and aggregate KPIs.
 */
export async function benchmarkSuite(
  products: BenchmarkProduct[],
  useLlmJudge = false
): Promise<BenchmarkSummary> {
  const results: BenchmarkResult[] = [];

  for (const product of products) {
    try {
      const result = await benchmarkProduct(product, useLlmJudge);
      results.push(result);
    } catch (err) {
      log.error(`[Benchmark] Failed for ${product.title}: ${err}`);
    }
  }

  return aggregateBenchmark(results);
}

// ---------------------------------------------------------------------------
// KPI 1: Coverage Gain
// ---------------------------------------------------------------------------

function computeCoverageGain(
  v1: UniversalRAGResult,
  v2: UniversalRAGResult,
  product: BenchmarkProduct
): CoverageGainResult {
  const v1Text = extractAllText(v1);
  const v2Text = extractAllText(v2);

  const v1Specs = extractSpecPairs(v1Text);
  const v2Specs = extractSpecPairs(v2Text);

  const v1SpecSet = new Set(v1Specs.map(s => s.toLowerCase()));
  const v2SpecSet = new Set(v2Specs.map(s => s.toLowerCase()));

  // Specs in v2 but not in v1
  const newSpecs = v2Specs.filter(s => !v1SpecSet.has(s.toLowerCase()));

  const v1EvidenceItems = countEvidenceItems(v1);
  const v2EvidenceItems = countEvidenceItems(v2);

  const v1SpecCount = v1SpecSet.size;
  const v2SpecCount = v2SpecSet.size;
  const absoluteGain = v2SpecCount - v1SpecCount;
  const relativeGain = v1SpecCount > 0 ? absoluteGain / v1SpecCount : (absoluteGain > 0 ? 1 : 0);

  const pdfGain = !!(v2.v2?.hasPdf && !v1.v2?.hasPdf);
  const tableGain = !!(v2.v2?.hasTable && !v1.v2?.hasTable);

  return {
    v1SpecCount,
    v2SpecCount,
    absoluteGain,
    relativeGain,
    v1EvidenceItems,
    v2EvidenceItems,
    pdfGain,
    tableGain,
    newSpecs: newSpecs.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// KPI 2: Precision after Expansion
// ---------------------------------------------------------------------------

async function computePrecisionAfterExpansion(
  v2: UniversalRAGResult,
  product: BenchmarkProduct,
  useLlmJudge: boolean
): Promise<PrecisionAfterExpansionResult> {
  const optimizer = v2.v2?.optimizerResult;

  // If no optimizer ran or no passes used, precision is trivially N/A
  if (!optimizer || optimizer.passesUsed === 0) {
    return {
      secondPassItems: 0,
      relevantItems: 0,
      precision: 1.0, // no expansion → no irrelevant items
      irrelevantSamples: [],
      usedLlmJudge: false,
    };
  }

  // Collect all gap queries that actually ran
  const allGapQueries = optimizer.passes.flatMap(p => p.gapQueries);
  const secondPassItems = allGapQueries.length;

  if (secondPassItems === 0) {
    return { secondPassItems: 0, relevantItems: 0, precision: 1.0, irrelevantSamples: [], usedLlmJudge: false };
  }

  // Score relevance of each gap query against the product keywords
  const productKeywords = buildProductKeywords(product);

  let relevantItems = 0;
  const irrelevantSamples: string[] = [];

  if (useLlmJudge && allGapQueries.length > 0) {
    // LLM judge: batch-evaluate all gap queries in one call
    const result = await llmJudgeQueries(allGapQueries, product, productKeywords);
    relevantItems = result.relevant;
    irrelevantSamples.push(...result.irrelevant.slice(0, 3));
  } else {
    // Fast heuristic: keyword overlap
    for (const query of allGapQueries) {
      const queryLow = query.toLowerCase();
      const hasKeyword = productKeywords.some(kw => queryLow.includes(kw));
      if (hasKeyword) {
        relevantItems++;
      } else {
        irrelevantSamples.push(query.slice(0, 80));
      }
    }
  }

  const precision = secondPassItems > 0 ? relevantItems / secondPassItems : 1.0;

  return {
    secondPassItems,
    relevantItems,
    precision,
    irrelevantSamples,
    usedLlmJudge: useLlmJudge,
  };
}

async function llmJudgeQueries(
  queries: string[],
  product: BenchmarkProduct,
  keywords: string[]
): Promise<{ relevant: number; irrelevant: string[] }> {
  const prompt = `Stai valutando la rilevanza di query di ricerca per questo prodotto:
Prodotto: ${product.vendor} ${product.title} (${product.productType}, SKU: ${product.sku})

QUERY DA VALUTARE:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Per ogni query, rispondi "RILEVANTE" o "IRRILEVANTE" rispetto al prodotto specifico.
Una query è rilevante se cerca informazioni direttamente utili per descrivere questo prodotto.

Rispondi SOLO con JSON: {"results": ["RILEVANTE", "IRRILEVANTE", ...]}`;

  try {
    const result = await generateTextSafe({
      prompt,
      maxTokens: 300,
      temperature: 0.1,
      useLiteModel: true,
    });
    const json = JSON.parse(result.text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const results: string[] = json.results ?? [];
    const relevant = results.filter(r => r === 'RILEVANTE').length;
    const irrelevant = queries.filter((_, i) => results[i] === 'IRRILEVANTE');
    return { relevant, irrelevant };
  } catch {
    // Fallback to keyword heuristic
    let relevant = 0;
    const irrelevant: string[] = [];
    for (const q of queries) {
      if (keywords.some(kw => q.toLowerCase().includes(kw))) relevant++;
      else irrelevant.push(q);
    }
    return { relevant, irrelevant };
  }
}

// ---------------------------------------------------------------------------
// KPI 3: Loop Efficiency
// ---------------------------------------------------------------------------

function computeLoopEfficiency(v2: UniversalRAGResult): LoopEfficiencyResult {
  const optimizer = v2.v2?.optimizerResult;

  if (!optimizer || optimizer.passesUsed === 0) {
    return {
      qualityBefore: v2.v2?.evaluationResult?.qualityScore ?? 0,
      qualityAfter: v2.v2?.evaluationResult?.qualityScore ?? 0,
      passesUsed: 0,
      efficiency: 0,
      loopBeneficial: false,
      usefulGapQueries: [],
      passSummary: [],
    };
  }

  const qualityBefore = optimizer.originalQuality;
  const qualityAfter = optimizer.finalQuality;
  const passesUsed = optimizer.passesUsed;

  // efficiency: average quality gain per pass (penalizes extra passes)
  const efficiency = passesUsed > 0 ? (qualityAfter - qualityBefore) / passesUsed : 0;

  // "Beneficial" threshold: net gain must be at least +0.05 per pass to justify cost
  const loopBeneficial = efficiency > 0.05;

  // Identify gap queries that contributed to quality improvement
  const usefulGapQueries = optimizer.passes
    .filter(p => p.qualityAfter > p.qualityBefore)
    .flatMap(p => p.gapsFilled.slice(0, 2));

  const passSummary = optimizer.passes.map(p => ({
    pass: p.passNumber,
    qualityBefore: p.qualityBefore,
    qualityAfter: p.qualityAfter,
    gapsFilled: p.gapsFilled.length,
  }));

  return {
    qualityBefore,
    qualityAfter,
    passesUsed,
    efficiency,
    loopBeneficial,
    usefulGapQueries,
    passSummary,
  };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function computeVerdict(
  coverage: CoverageGainResult,
  precision: PrecisionAfterExpansionResult,
  loop: LoopEfficiencyResult,
  overheadMs: number
): { verdict: BenchmarkResult['verdict']; verdictReason: string } {
  const reasons: string[] = [];
  let positiveSignals = 0;
  let negativeSignals = 0;

  // Coverage
  if (coverage.relativeGain > 0.20) {
    positiveSignals++;
    reasons.push(`+${(coverage.relativeGain * 100).toFixed(0)}% copertura spec`);
  } else if (coverage.relativeGain < -0.05) {
    negativeSignals++;
    reasons.push(`-${(Math.abs(coverage.relativeGain) * 100).toFixed(0)}% copertura spec`);
  }
  if (coverage.pdfGain) { positiveSignals++; reasons.push('PDF trovato'); }
  if (coverage.tableGain) { positiveSignals++; reasons.push('tabella spec trovata'); }

  // Precision
  if (precision.secondPassItems > 0) {
    if (precision.precision >= 0.70) {
      positiveSignals++;
      reasons.push(`precisione espansione ${(precision.precision * 100).toFixed(0)}%`);
    } else {
      negativeSignals++;
      reasons.push(`precisione espansione bassa ${(precision.precision * 100).toFixed(0)}%`);
    }
  }

  // Loop
  if (loop.passesUsed > 0) {
    if (loop.loopBeneficial) {
      positiveSignals++;
      reasons.push(`loop efficiente (+${loop.efficiency.toFixed(2)} qualità/pass)`);
    } else if (loop.efficiency < 0) {
      negativeSignals++;
      reasons.push(`loop degradante (${loop.efficiency.toFixed(2)} qualità/pass)`);
    } else {
      reasons.push(`loop neutro (${loop.efficiency.toFixed(2)} qualità/pass)`);
    }
  }

  // Overhead penalty above 30s is a concern
  if (overheadMs > 30000) {
    negativeSignals++;
    reasons.push(`overhead elevato ${(overheadMs / 1000).toFixed(0)}s`);
  }

  let verdict: BenchmarkResult['verdict'];
  if (positiveSignals >= 2 && negativeSignals === 0) verdict = 'v2_wins';
  else if (negativeSignals >= 2) verdict = 'v2_loses';
  else verdict = 'v2_neutral';

  return { verdict, verdictReason: reasons.join(', ') || 'dati insufficienti' };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateBenchmark(results: BenchmarkResult[]): BenchmarkSummary {
  if (results.length === 0) {
    return {
      products: [],
      avgCoverageGain: 0,
      avgPrecision: 0,
      avgLoopEfficiency: 0,
      loopBeneficialRate: 0,
      avgV2OverheadMs: 0,
      v2WinsRate: 0,
    };
  }

  const n = results.length;
  const sum = (fn: (r: BenchmarkResult) => number) =>
    results.reduce((acc, r) => acc + fn(r), 0);

  return {
    products: results,
    avgCoverageGain: sum(r => r.coverageGain.relativeGain) / n,
    avgPrecision: sum(r => r.precisionAfterExpansion.precision) / n,
    avgLoopEfficiency: sum(r => r.loopEfficiency.efficiency) / n,
    loopBeneficialRate: results.filter(r => r.loopEfficiency.loopBeneficial).length / n,
    avgV2OverheadMs: sum(r => r.v2OverheadMs) / n,
    v2WinsRate: results.filter(r => r.verdict === 'v2_wins').length / n,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Extract all text content from a RAG result (evidence + corpus context).
 */
function extractAllText(result: UniversalRAGResult): string {
  const parts: string[] = [];

  if (result.data) {
    const data = result.data;
    if (typeof data.v2CorpusContext === 'string') parts.push(data.v2CorpusContext);
    if (data.evidence && Array.isArray(data.evidence)) {
      for (const item of data.evidence) {
        const text = item.content || item.text || item.snippet || item.value || '';
        if (text) parts.push(String(text));
      }
    }
    // Raw source buckets
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('_') || key.startsWith('v2') || !Array.isArray(val)) continue;
      for (const item of val as any[]) {
        const text = item?.content || item?.text || item?.snippet || '';
        if (text) parts.push(String(text));
      }
    }
  }

  if (result.v2?.corpusContext) parts.push(result.v2.corpusContext);

  return parts.join('\n');
}

/**
 * Extract unique "spec: value" pairs from text.
 * Returns normalised strings like "potenza: 18 V".
 */
function extractSpecPairs(text: string): string[] {
  const pattern =
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,25})\s*:\s*([\d.,]+\s*(?:V|W|A|kg|g|mm|cm|m|rpm|kW|kVA|bar|l\/min|dB|Nm|Ah)?)/g;
  const pairs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const claim = match[1].trim().toLowerCase();
    const value = match[2].trim().toLowerCase();
    if (claim.length >= 3 && !claim.includes('http')) {
      pairs.add(`${claim}: ${value}`);
    }
  }
  return Array.from(pairs);
}

function countEvidenceItems(result: UniversalRAGResult): number {
  if (!result.data) return 0;
  const data = result.data;
  if (data.evidence && Array.isArray(data.evidence)) return data.evidence.length;
  let count = 0;
  for (const [key, val] of Object.entries(data)) {
    if (!key.startsWith('_') && !key.startsWith('v2') && Array.isArray(val)) {
      count += (val as unknown[]).length;
    }
  }
  return count;
}

function buildProductKeywords(product: BenchmarkProduct): string[] {
  const keywords: string[] = [];
  const addWords = (str: string) =>
    str.toLowerCase().split(/\s+/).filter(w => w.length > 2).forEach(w => keywords.push(w));
  addWords(product.vendor);
  addWords(product.title);
  if (product.sku) keywords.push(product.sku.toLowerCase());
  if (product.productType) addWords(product.productType);
  return Array.from(new Set(keywords));
}
