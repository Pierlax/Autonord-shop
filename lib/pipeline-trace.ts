/**
 * Pipeline Trace — W-OBS-1: Distributed tracing / correlation IDs
 *
 * Assigns a unique traceId to each pipeline invocation so that all log lines
 * from the same run can be correlated across modules (RAG → QA → V3 → TAYA → Image).
 *
 * Implementation uses AsyncLocalStorage — safe for concurrent serverless requests
 * in the same Node.js process (unlike a module-level variable which would be shared
 * across concurrent requests).
 *
 * Usage (pipeline worker):
 *   import { runWithTrace, generateTraceId } from '@/lib/pipeline-trace';
 *   await runWithTrace(generateTraceId(), async () => {
 *     // ... all pipeline steps run here ...
 *   }, { productId: product.id });
 *
 * Usage (inside any pipeline step):
 *   import { getCurrentTraceId, startTraceStep, endTraceStep } from '@/lib/pipeline-trace';
 *   const idx = startTraceStep('rag');
 *   // ... do work ...
 *   endTraceStep(idx);
 *   log.info('[RAG] done', { traceId: getCurrentTraceId() });
 */

import { AsyncLocalStorage } from 'async_hooks';
import { loggers } from '@/lib/logger';

const log = loggers.enrichment;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceStep {
  name: string;
  startMs: number;
  endMs?: number;
  /** Optional metadata captured at step start */
  metadata?: Record<string, unknown>;
}

export interface PipelineTrace {
  traceId: string;
  productId?: string;
  startTime: Date;
  steps: TraceStep[];
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage context
// ---------------------------------------------------------------------------

const _traceStorage = new AsyncLocalStorage<PipelineTrace>();

/**
 * W-OBS-1: Generate a short unique trace ID (12 hex chars).
 */
export function generateTraceId(): string {
  return (
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 6)
  );
}

/**
 * W-OBS-1: Run a pipeline invocation within a named trace context.
 * All code inside fn() can call getCurrentTrace() / getCurrentTraceId() / startTraceStep().
 *
 * @param traceId   A unique ID for this invocation (use generateTraceId())
 * @param fn        The async pipeline function to execute
 * @param metadata  Optional: productId or other top-level context
 */
export async function runWithTrace<T>(
  traceId: string,
  fn: () => Promise<T>,
  metadata?: { productId?: string },
): Promise<T> {
  const trace: PipelineTrace = {
    traceId,
    productId: metadata?.productId,
    startTime: new Date(),
    steps: [],
  };

  log.info(
    `[Trace] START traceId=${traceId}${metadata?.productId ? ` productId=${metadata.productId}` : ''}`,
  );

  const result = await _traceStorage.run(trace, fn);

  const elapsedMs = Date.now() - trace.startTime.getTime();
  log.info(
    `[Trace] END traceId=${traceId} elapsed=${elapsedMs}ms steps=${trace.steps.length}`,
  );

  return result;
}

/**
 * W-OBS-1: Get the active PipelineTrace for the current execution context.
 * Returns undefined if called outside a runWithTrace() scope.
 */
export function getCurrentTrace(): PipelineTrace | undefined {
  return _traceStorage.getStore();
}

/**
 * W-OBS-1: Get just the trace ID (convenience wrapper).
 * Returns null when not in a trace context.
 */
export function getCurrentTraceId(): string | null {
  return _traceStorage.getStore()?.traceId ?? null;
}

/**
 * W-OBS-1: Start a named step within the active trace and return its index.
 * Call endTraceStep(idx) when the step finishes to record elapsed time.
 * Safe to call outside a trace context — returns -1 and is a no-op.
 *
 * @example
 *   const idx = startTraceStep('universal-rag', { maxSources: 5 });
 *   const result = await runUniversalRAG(...);
 *   endTraceStep(idx);
 */
export function startTraceStep(
  name: string,
  metadata?: Record<string, unknown>,
): number {
  const trace = _traceStorage.getStore();
  if (!trace) return -1;
  const step: TraceStep = { name, startMs: Date.now(), metadata };
  trace.steps.push(step);
  return trace.steps.length - 1;
}

/**
 * W-OBS-1: Mark a trace step as complete.
 * Records the elapsed time and makes it available in getStepTimings().
 */
export function endTraceStep(stepIdx: number): void {
  const trace = _traceStorage.getStore();
  if (!trace || stepIdx < 0 || stepIdx >= trace.steps.length) return;
  trace.steps[stepIdx].endMs = Date.now();
}

/**
 * W-OBS-1: Get per-step latency map from the current trace.
 * Returns an empty object when not in a trace context.
 *
 * @example
 *   const timings = getStepTimings();
 *   // { 'universal-rag': 3200, 'two-phase-qa': 1800, 'ai-enrichment-v3': 4100 }
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
