/**
 * RAG Semantic Reranker — score and reorder CorpusItems by product relevance.
 *
 * Uses a single Gemini Flash batch call (1 AI request for up to RERANK_BATCH_SIZE
 * items) to score each snippet 0-10 for relevance to the product being enriched.
 * Items with score < MIN_RELEVANCE_SCORE are filtered out to reduce noise in
 * downstream QA and content-generation steps.
 *
 * Why a single batch call instead of N calls:
 *   Cross-encoder rerankers (Cohere Rerank, bge-reranker-large) make one call per
 *   pair and require a hosted model. A single prompt with all snippets gets ~80%
 *   of the quality at 1/20 the cost and with zero extra latency budget.
 *
 * Confidence blending:
 *   item.confidence = rerankScore/10 * 0.70 + domainConfidence * 0.30
 *   The rerank signal dominates; domain whitelist acts as a soft prior.
 *
 * Integration point (universal-rag.ts, inside runV2Discovery):
 *   After R1 page extraction, before returning corpus.
 *   Adds one Gemini Flash call (~200 ms) to the pipeline.
 *
 * Usage:
 *   import { rerankCorpusItems } from './rag-reranker';
 *   const { items, filteredCount } = await rerankCorpusItems(
 *     corpus.items, productTitle, vendor, productType
 *   );
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import type { CorpusItem } from './corpus-builder';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max items scored in a single batch call. Items beyond this are kept as-is. */
const RERANK_BATCH_SIZE = 20;

/** Items scoring below this are dropped from the corpus (0-10 scale). */
const MIN_RELEVANCE_SCORE = 2;

/** Max chars of item content included in the scoring prompt per snippet. */
const SNIPPET_CONTENT_CHARS = 280;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RerankResult {
  items: CorpusItem[];
  /** Raw AI scores for the first RERANK_BATCH_SIZE items (0-10, same order as input). */
  scores: number[];
  /** Items removed for scoring below MIN_RELEVANCE_SCORE. */
  filteredCount: number;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Score and rerank corpus items for relevance to the product.
 *
 * @param items        Full corpus item list (only first RERANK_BATCH_SIZE are scored).
 * @param productTitle Product name.
 * @param vendor       Brand / manufacturer.
 * @param productType  Category string (e.g. "Trapano avvitatore", "Compressore").
 * @returns Filtered and reranked items; items beyond the batch appended at end unchanged.
 */
export async function rerankCorpusItems(
  items: CorpusItem[],
  productTitle: string,
  vendor: string,
  productType: string,
): Promise<RerankResult> {
  if (items.length === 0) {
    return { items: [], scores: [], filteredCount: 0 };
  }

  // Items beyond the batch are kept unchanged and appended after the scored items
  const batch = items.slice(0, RERANK_BATCH_SIZE);
  const tail  = items.slice(RERANK_BATCH_SIZE);

  // Build numbered snippet list for the prompt
  const snippetLines = batch.map((item, i) => {
    const text = (item.content || item.title)
      .slice(0, SNIPPET_CONTENT_CHARS)
      .replace(/\s+/g, ' ')
      .trim();
    const title = item.title.slice(0, 60);
    return `${i + 1}. [${title}]\n${text}`;
  });

  const prompt =
    `Prodotto: ${productTitle} — ${vendor}${productType ? ` (${productType})` : ''}\n\n` +
    `Valuta la rilevanza 0–10 di ogni snippet per descrivere le specifiche tecniche, ` +
    `le caratteristiche e gli utilizzi di questo specifico prodotto.\n\n` +
    `10 = specifica diretta di questo prodotto\n` +
    `7–9 = informazioni rilevanti (modello/categoria)\n` +
    `4–6 = parzialmente rilevante (brand, categoria generica)\n` +
    `1–3 = marginalmente correlato\n` +
    `0   = irrilevante o fuorviante\n\n` +
    `Snippet:\n${snippetLines.join('\n\n')}\n\n` +
    `Rispondi SOLO con un oggetto JSON (${batch.length} valori interi 0–10, ` +
    `stesso ordine degli snippet): {"scores":[n1,n2,...]}`;

  // Median-score default — if parsing fails we keep all items
  let scores: number[] = batch.map(() => 5);

  try {
    const result = await generateTextSafe({
      prompt,
      maxTokens: 120,
      temperature: 0.0,   // deterministic scoring
      useLiteModel: true, // Flash is sufficient for relevance scoring
    });

    scores = parseScores(result.text, batch.length) ?? scores;
  } catch (err) {
    log.warn('[Reranker] Scoring call failed (non-fatal, keeping default scores):', err);
  }

  // Apply scores: blend with domain confidence, filter low-relevance, sort descending
  const scored = batch
    .map((item, i) => {
      const s = scores[i] ?? 5;
      return {
        score: s,
        item: {
          ...item,
          confidence: round2(s / 10 * 0.70 + item.confidence * 0.30),
        },
      };
    })
    .filter(({ score }) => score >= MIN_RELEVANCE_SCORE);

  scored.sort((a, b) => b.score - a.score);

  const filteredCount = batch.length - scored.length;
  const rerankedItems = [...scored.map(({ item }) => item), ...tail];

  log.info(
    `[Reranker] ${batch.length} scored — ` +
    `filtered: ${filteredCount}, ` +
    `top: ${Math.max(...scores)}, ` +
    `avg: ${avg(scores).toFixed(1)}, ` +
    `kept: ${rerankedItems.length}`,
  );

  return { items: rerankedItems, scores, filteredCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the {"scores":[...]} JSON from the model's response.
 * Returns null if the response is malformed or has the wrong count.
 */
function parseScores(text: string, expectedCount: number): number[] | null {
  // Try full JSON parse first
  try {
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const obj = JSON.parse(text.slice(start, end + 1)) as { scores?: unknown };
      if (Array.isArray(obj.scores) && obj.scores.length === expectedCount) {
        const parsed = (obj.scores as unknown[]).map(v => clamp(Number(v), 0, 10));
        if (parsed.every(n => !isNaN(n))) return parsed;
      }
    }
  } catch {
    // fall through to regex
  }

  // Regex fallback — extract numbers from the array literal
  const m = text.match(/"scores"\s*:\s*\[([^\]]+)\]/);
  if (m) {
    const parsed = m[1]
      .split(',')
      .map(s => clamp(parseInt(s.trim(), 10), 0, 10))
      .filter(n => !isNaN(n));
    if (parsed.length === expectedCount) return parsed;
  }

  log.warn(`[Reranker] Could not parse scores — expected ${expectedCount} values`);
  return null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}
