/**
 * Pipeline Trace — W-OBS-1 + R2: Distributed tracing / correlation IDs
 *
 * Assigns a unique traceId to each pipeline invocation so that all log lines
 * from the same run can be correlated across modules (RAG → QA → V3 → TAYA → Image).
 *
 * Emits structured JSON lines at step boundaries and pipeline completion —
 * these can be ingested by any observability system (Vercel Log Drains,
 * Datadog, Grafana Loki, CloudWatch, etc.) without additional configuration.
 *
 * JSON line format (one line per event):
 *   pipeline.start  — emitted when runWithTrace() begins
 *   pipeline.step   — emitted when endTraceStep() is called (one per step)
 *   pipeline.end    — emitted when runWithTrace() completes with totals
 *
 * Implementation uses AsyncLocalStorage — safe for concurrent serverless
 * requests in the same Node.js process (each request has its own isolated store).
 *
 * Usage (pipeline worker):
 *   import { runWithTrace, generateTraceId } from '@/lib/pipeline-trace';
 *   await runWithTrace(generateTraceId(), async () => {
 *     // all pipeline steps here — trace context is automatically propagated
 *   }, { productId: product.id, sku: product.sku });
 *
 * Usage (inside any pipeline step):
 *   import { startTraceStep, endTraceStep, addStepError } from '@/lib/pipeline-trace';
 *   const idx = startTraceStep('universal-rag');
 *   try { ... } catch (e) { addStepError(idx, String(e)); }
 *   finally { endTraceStep(idx); }
 *
 * Usage (AI client — automatic):
 *   import { recordAiCallToCurrentStep } from '@/lib/pipeline-trace';
 *   recordAiCallToCurrentStep(result.usage.totalTokens);
 *   // Called automatically by generateTextSafe() — no manual call needed.
 *
 * Usage (cache layer — automatic):
 *   import { recordCacheHitToCurrentStep } from '@/lib/pipeline-trace';
 *   recordCacheHitToCurrentStep();
 *   // Called automatically by cachedSearch() on cache hit.
 */

import { AsyncLocalStorage } from 'async_hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-step telemetry, matching the R2 spec:
 * { name, startMs, endMs, aiCalls, tokensUsed, cacheHits, qualityScore?, errors[] }
 */
export interface TraceStep {
  name: string;
  startMs: number;
  endMs?: number;
  aiCalls: number;
  tokensUsed: number;
  cacheHits: number;
  qualityScore?: number;
  errors: string[];
}

export interface PipelineTrace {
  traceId: string;
  productId?: string;
  sku?: string;
  startTime: Date;
  steps: TraceStep[];
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage context
// ---------------------------------------------------------------------------

const _traceStorage = new AsyncLocalStorage<PipelineTrace>();

// ---------------------------------------------------------------------------
// Structured JSON-lines emitter
// ---------------------------------------------------------------------------

/**
 * Emit a structured JSON line to stdout.
 * Each log line is a complete JSON object — suitable for Vercel Log Drains,
 * Datadog log agent, Grafana Loki, or any line-based log shipper.
 */
function emitJsonLine(event: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    service: 'pipeline-trace',
    ...data,
  });
  // console.log is the standard stdout channel in Next.js serverless
  console.log(line);
}

// ---------------------------------------------------------------------------
// Public API — context management
// ---------------------------------------------------------------------------

/**
 * Generate a short unique trace ID (12 hex chars).
 */
export function generateTraceId(): string {
  return (
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 6)
  );
}

/**
 * Run a pipeline invocation within a named trace context.
 *
 * Emits `pipeline.start` at entry and `pipeline.end` at exit (including totals).
 * All code inside fn() can call startTraceStep / recordAiCallToCurrentStep etc.
 *
 * @param traceId   Unique ID for this invocation — use generateTraceId()
 * @param fn        The async pipeline function to execute
 * @param metadata  Optional: productId, sku (included in all JSON lines)
 */
export async function runWithTrace<T>(
  traceId: string,
  fn: () => Promise<T>,
  metadata?: { productId?: string; sku?: string },
): Promise<T> {
  const trace: PipelineTrace = {
    traceId,
    productId: metadata?.productId,
    sku: metadata?.sku,
    startTime: new Date(),
    steps: [],
  };

  emitJsonLine('pipeline.start', {
    traceId,
    ...(metadata?.productId ? { productId: metadata.productId } : {}),
    ...(metadata?.sku ? { sku: metadata.sku } : {}),
  });

  const result = await _traceStorage.run(trace, fn);

  const totalMs = Date.now() - trace.startTime.getTime();
  const totalAiCalls = trace.steps.reduce((s, step) => s + step.aiCalls, 0);
  const totalTokensUsed = trace.steps.reduce((s, step) => s + step.tokensUsed, 0);
  const totalCacheHits = trace.steps.reduce((s, step) => s + step.cacheHits, 0);
  const totalErrors = trace.steps.reduce((s, step) => s + step.errors.length, 0);

  emitJsonLine('pipeline.end', {
    traceId,
    ...(metadata?.productId ? { productId: metadata.productId } : {}),
    ...(metadata?.sku ? { sku: metadata.sku } : {}),
    totalMs,
    stepsCount: trace.steps.length,
    totalAiCalls,
    totalTokensUsed,
    totalCacheHits,
    totalErrors,
  });

  return result;
}

/**
 * Get the active PipelineTrace for the current execution context.
 * Returns undefined if called outside a runWithTrace() scope.
 */
export function getCurrentTrace(): PipelineTrace | undefined {
  return _traceStorage.getStore();
}

/**
 * Get just the trace ID (convenience wrapper).
 * Returns null when not in a trace context.
 */
export function getCurrentTraceId(): string | null {
  return _traceStorage.getStore()?.traceId ?? null;
}

// ---------------------------------------------------------------------------
// Public API — step management
// ---------------------------------------------------------------------------

/**
 * Start a named step within the active trace.
 * Returns the step index to pass to endTraceStep / addStepError / setStepQuality.
 * Safe to call outside a trace context — returns -1 (no-op).
 *
 * @example
 *   const idx = startTraceStep('universal-rag');
 *   try { ... } catch (e) { addStepError(idx, String(e)); }
 *   finally { endTraceStep(idx); }
 */
export function startTraceStep(name: string): number {
  const trace = _traceStorage.getStore();
  if (!trace) return -1;
  const step: TraceStep = {
    name,
    startMs: Date.now(),
    aiCalls: 0,
    tokensUsed: 0,
    cacheHits: 0,
    errors: [],
  };
  trace.steps.push(step);
  return trace.steps.length - 1;
}

/**
 * Mark a trace step as complete and emit a `pipeline.step` JSON line.
 * Safe to call with stepIdx = -1 (no-op).
 */
export function endTraceStep(stepIdx: number): void {
  const trace = _traceStorage.getStore();
  if (!trace || stepIdx < 0 || stepIdx >= trace.steps.length) return;

  const step = trace.steps[stepIdx];
  step.endMs = Date.now();

  emitJsonLine('pipeline.step', {
    traceId: trace.traceId,
    ...(trace.productId ? { productId: trace.productId } : {}),
    ...(trace.sku ? { sku: trace.sku } : {}),
    step: step.name,
    startMs: step.startMs,
    endMs: step.endMs,
    durationMs: step.endMs - step.startMs,
    aiCalls: step.aiCalls,
    tokensUsed: step.tokensUsed,
    cacheHits: step.cacheHits,
    ...(step.qualityScore !== undefined ? { qualityScore: step.qualityScore } : {}),
    errors: step.errors,
  });
}

/**
 * Append an error string to a step's error list.
 * Use in catch blocks to record failures without throwing.
 */
export function addStepError(stepIdx: number, message: string): void {
  const trace = _traceStorage.getStore();
  if (!trace || stepIdx < 0 || stepIdx >= trace.steps.length) return;
  trace.steps[stepIdx].errors.push(message);
}

/**
 * Set a quality score (0-1) on a step.
 * Useful for recording TAYA triad score or content quality dimensions.
 */
export function setStepQuality(stepIdx: number, score: number): void {
  const trace = _traceStorage.getStore();
  if (!trace || stepIdx < 0 || stepIdx >= trace.steps.length) return;
  trace.steps[stepIdx].qualityScore = score;
}

// ---------------------------------------------------------------------------
// Public API — automatic metric recording (called by ai-client + rag-cache)
// ---------------------------------------------------------------------------

/**
 * Record an AI call + token usage against the most recently started step.
 * Called automatically by generateTextSafe() — do not call manually.
 */
export function recordAiCallToCurrentStep(tokensUsed: number): void {
  const trace = _traceStorage.getStore();
  if (!trace || trace.steps.length === 0) return;
  // Record against the last open step (the most recently started one)
  const step = trace.steps[trace.steps.length - 1];
  step.aiCalls += 1;
  step.tokensUsed += tokensUsed;
}

/**
 * Record a cache hit against the most recently started step.
 * Called automatically by cachedSearch() on cache hit — do not call manually.
 */
export function recordCacheHitToCurrentStep(): void {
  const trace = _traceStorage.getStore();
  if (!trace || trace.steps.length === 0) return;
  const step = trace.steps[trace.steps.length - 1];
  step.cacheHits += 1;
}

// ---------------------------------------------------------------------------
// Legacy helpers (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Get per-step latency map from the current trace.
 * Returns empty object outside a trace context.
 */
export function getStepTimings(): Record<string, number> {
  const trace = _traceStorage.getStore();
  if (!trace) return {};
  const timings: Record<string, number> = {};
  for (const step of trace.steps) {
    if (step.endMs !== undefined) {
      timings[step.name] = step.endMs - step.startMs;
    }
  }
  return timings;
}
