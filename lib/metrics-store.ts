/**
 * Pipeline Metrics Store — W-OBS-2: In-process ring buffer with Prometheus export.
 *
 * Gaps addressed:
 * - Metrics are in-memory only, lost on cold start → ring buffer holds last 500 records
 * - No export format → exportPrometheusText() for Prometheus/Grafana scraping
 * - No quality trend visibility → getMetricsSummary() aggregates across rolling window
 *
 * Persistence note:
 * This module provides in-process storage. For cross-restart persistence, call
 * getRecords() and store the result in Redis — same pattern as ViolationAccumulator
 * in taya-police.ts (W-TP-5 / loadViolationStats).
 *
 * The HTTP endpoint at /api/admin/metrics/pipeline exposes this data for scraping.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineRunRecord {
  /** Correlation ID from pipeline-trace.ts */
  traceId: string;
  /** Shopify product ID */
  productId: string;
  /** ISO 8601 timestamp of run completion */
  timestamp: string;
  /** Total wall-clock time for the full pipeline (ms) */
  totalMs: number;
  /** Per-step latency breakdown from getStepTimings() */
  stepMs: Record<string, number>;
  /** D16 ContentQualityScore.overall (0–1), null if V3 failed */
  qualityScore: number | null;
  /** Total Gemini API calls in this run */
  aiCalls: number;
  /** RAG cache hits (searches served from cache, not live) */
  cacheHits: number;
  /** Non-fatal error codes encountered (e.g. 'rag-timeout', 'qa-parse-fail') */
  errors: string[];
  /** TAYA Police verdict: APPROVA | REVISIONE_MINORE | REVISIONE_MAGGIORE | RIFIUTA */
  tayaVerdict?: string;
}

export interface MetricsSummary {
  /** Total runs in the ring buffer */
  totalRuns: number;
  /** Runs completed within the last windowMinutes */
  recentRuns: number;
  /** Average D16 quality score (null when no scored runs) */
  avgQualityScore: number | null;
  /** Average total pipeline latency (ms) */
  avgTotalMs: number;
  /** Fraction of runs that encountered at least one error */
  errorRate: number;
  /** Fraction of runs approved or minor-revised by TAYA Police */
  tayaApprovalRate: number;
  /** Average latency per step name */
  stepAvgMs: Record<string, number>;
  /** Average Gemini API calls per run */
  aiCallsPerRun: number;
  /** RAG cache hit rate (hits / total cacheable lookups) */
  cacheHitRate: number;
}

// ---------------------------------------------------------------------------
// In-process ring buffer
// ---------------------------------------------------------------------------

const MAX_RECORDS = 500;
const _records: PipelineRunRecord[] = [];

/**
 * W-OBS-2: Record a completed pipeline run.
 * Call at the end of the enrichment worker after TAYA Police verdict is obtained.
 *
 * @example (in route.ts after pipeline finishes):
 *   import { recordPipelineRun } from '@/lib/metrics-store';
 *   recordPipelineRun({
 *     traceId: getCurrentTraceId() ?? 'no-trace',
 *     productId: product.id,
 *     timestamp: new Date().toISOString(),
 *     totalMs: Date.now() - startTime,
 *     stepMs: getStepTimings(),
 *     qualityScore: enrichedResult?.qualityScore?.overall ?? null,
 *     aiCalls: aiCallCounter,
 *     cacheHits: ragResult.cacheHits ?? 0,
 *     errors: errorAccumulator,
 *     tayaVerdict: tayaResult?.verdict,
 *   });
 */
export function recordPipelineRun(record: PipelineRunRecord): void {
  _records.push(record);
  if (_records.length > MAX_RECORDS) _records.shift();
}

/**
 * Get all records from the ring buffer (or last N).
 */
export function getRecords(limit?: number): PipelineRunRecord[] {
  if (limit === undefined) return [..._records];
  return _records.slice(-limit);
}

/**
 * Clear all records (for testing or forced reset).
 */
export function clearRecords(): void {
  _records.length = 0;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * W-OBS-2: Compute aggregated metrics summary.
 *
 * @param windowMinutes — Rolling window for recentRuns count (default: 60 min)
 */
export function getMetricsSummary(windowMinutes = 60): MetricsSummary {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const cutoff = now - windowMs;

  const recent = _records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  const total = _records.length;

  if (total === 0) {
    return {
      totalRuns: 0,
      recentRuns: 0,
      avgQualityScore: null,
      avgTotalMs: 0,
      errorRate: 0,
      tayaApprovalRate: 0,
      stepAvgMs: {},
      aiCallsPerRun: 0,
      cacheHitRate: 0,
    };
  }

  // Average D16 quality score (only from runs that have a score)
  const withScore = _records.filter(r => r.qualityScore !== null);
  const avgQualityScore =
    withScore.length > 0
      ? withScore.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / withScore.length
      : null;

  // Average total latency
  const avgTotalMs = _records.reduce((s, r) => s + r.totalMs, 0) / total;

  // Error rate
  const withErrors = _records.filter(r => r.errors.length > 0).length;
  const errorRate = withErrors / total;

  // TAYA approval rate (APPROVA + REVISIONE_MINORE count as "approved")
  const withVerdict = _records.filter(r => r.tayaVerdict);
  const approved = withVerdict.filter(
    r => r.tayaVerdict === 'APPROVA' || r.tayaVerdict === 'REVISIONE_MINORE',
  ).length;
  const tayaApprovalRate = withVerdict.length > 0 ? approved / withVerdict.length : 0;

  // Per-step average latency
  const stepSums: Record<string, { sum: number; count: number }> = {};
  for (const r of _records) {
    for (const [step, ms] of Object.entries(r.stepMs)) {
      if (!stepSums[step]) stepSums[step] = { sum: 0, count: 0 };
      stepSums[step].sum += ms;
      stepSums[step].count++;
    }
  }
  const stepAvgMs: Record<string, number> = {};
  for (const [step, { sum, count }] of Object.entries(stepSums)) {
    stepAvgMs[step] = Math.round(sum / count);
  }

  // AI calls per run
  const aiCallsPerRun = _records.reduce((s, r) => s + r.aiCalls, 0) / total;

  // Cache hit rate — cacheHits / (cacheHits + cache misses)
  // We estimate misses as aiCalls (each RAG lookup that wasn't cached required an AI call)
  const totalHits = _records.reduce((s, r) => s + r.cacheHits, 0);
  const totalLookups = _records.reduce((s, r) => s + r.cacheHits + r.aiCalls, 0);
  const cacheHitRate = totalLookups > 0 ? totalHits / totalLookups : 0;

  return {
    totalRuns: total,
    recentRuns: recent.length,
    avgQualityScore:
      avgQualityScore !== null ? Math.round(avgQualityScore * 100) / 100 : null,
    avgTotalMs: Math.round(avgTotalMs),
    errorRate: Math.round(errorRate * 100) / 100,
    tayaApprovalRate: Math.round(tayaApprovalRate * 100) / 100,
    stepAvgMs,
    aiCallsPerRun: Math.round(aiCallsPerRun * 10) / 10,
    cacheHitRate: Math.round(cacheHitRate * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Prometheus export
// ---------------------------------------------------------------------------

/**
 * W-OBS-2: Export current aggregated metrics as Prometheus text format.
 * Consumed by GET /api/admin/metrics/pipeline for Prometheus/Grafana scraping.
 */
export function exportPrometheusText(): string {
  const s = getMetricsSummary();
  const lines: string[] = [
    '# HELP autonord_pipeline_runs_total Total enrichment pipeline runs in ring buffer',
    '# TYPE autonord_pipeline_runs_total counter',
    `autonord_pipeline_runs_total ${s.totalRuns}`,

    '',
    '# HELP autonord_pipeline_quality_avg Average D16 content quality score (0-1)',
    '# TYPE autonord_pipeline_quality_avg gauge',
    `autonord_pipeline_quality_avg ${s.avgQualityScore ?? 'NaN'}`,

    '',
    '# HELP autonord_pipeline_latency_avg_ms Average total pipeline latency ms',
    '# TYPE autonord_pipeline_latency_avg_ms gauge',
    `autonord_pipeline_latency_avg_ms ${s.avgTotalMs}`,

    '',
    '# HELP autonord_pipeline_error_rate Fraction of pipeline runs with errors',
    '# TYPE autonord_pipeline_error_rate gauge',
    `autonord_pipeline_error_rate ${s.errorRate}`,

    '',
    '# HELP autonord_pipeline_taya_approval_rate Fraction approved or minor-revised',
    '# TYPE autonord_pipeline_taya_approval_rate gauge',
    `autonord_pipeline_taya_approval_rate ${s.tayaApprovalRate}`,

    '',
    '# HELP autonord_pipeline_ai_calls_per_run Average Gemini API calls per run',
    '# TYPE autonord_pipeline_ai_calls_per_run gauge',
    `autonord_pipeline_ai_calls_per_run ${s.aiCallsPerRun}`,

    '',
    '# HELP autonord_pipeline_cache_hit_rate RAG cache hit rate',
    '# TYPE autonord_pipeline_cache_hit_rate gauge',
    `autonord_pipeline_cache_hit_rate ${s.cacheHitRate}`,
  ];

  // Per-step latency labels
  if (Object.keys(s.stepAvgMs).length > 0) {
    lines.push('');
    lines.push('# HELP autonord_pipeline_step_latency_ms Average latency per pipeline step');
    lines.push('# TYPE autonord_pipeline_step_latency_ms gauge');
    for (const [step, ms] of Object.entries(s.stepAvgMs)) {
      lines.push(`autonord_pipeline_step_latency_ms{step="${step}"} ${ms}`);
    }
  }

  return lines.join('\n') + '\n';
}
