/**
 * Page Content Extractor — R1 (RAG Recall Improvement)
 *
 * Fetches the HTML of a search-result URL and extracts the main text content,
 * replacing the short search-engine snippet (~150 chars) with up to 2000 chars
 * of real page content. This roughly doubles the data density in the RAG corpus
 * without adding any new search queries.
 *
 * Design constraints (Vercel serverless):
 * - Native fetch() only — no puppeteer, jsdom, or heavy DOM libraries
 * - Hard timeout per page (default 8 s) via AbortController
 * - Parallel with concurrency cap (default 3) to avoid memory pressure
 * - Graceful fallback: on any error, original snippet is preserved unchanged
 */

import { loggers } from '@/lib/logger';
import type { CorpusItem } from './corpus-builder';

const log = loggers.shopify;

const MAX_CHARS_PER_PAGE = 2000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// HTML content extraction (no DOM — pure string operations)
// ---------------------------------------------------------------------------

/** Remove an entire block tag including its content. Handles one nesting level. */
function removeTagBlock(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
}

/** Strip remaining HTML tags, decode common entities, collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract the main content area from raw HTML.
 *
 * Strategy:
 * 1. Remove noise blocks (script, style, nav, header, footer, aside, etc.)
 * 2. Isolate the primary content region (<main>, <article>, or common class patterns)
 * 3. Strip remaining tags and collapse whitespace
 * 4. Return up to MAX_CHARS_PER_PAGE chars
 */
function extractMainContent(html: string): string {
  // Step 1 — remove noise blocks
  let cleaned = html;
  for (const tag of ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'form', 'iframe', 'svg', 'figure']) {
    cleaned = removeTagBlock(cleaned, tag);
  }

  // Step 2 — try to isolate the main content region

  // Attempt A: <main>
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch?.[1]) {
    const text = stripHtml(mainMatch[1]);
    if (text.length > 200) return text.slice(0, MAX_CHARS_PER_PAGE);
  }

  // Attempt B: <article>
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) {
    const text = stripHtml(articleMatch[1]);
    if (text.length > 200) return text.slice(0, MAX_CHARS_PER_PAGE);
  }

  // Attempt C: common content div patterns (id or class containing "content", "article", "entry", "post")
  const contentDivMatch = cleaned.match(
    /<div[^>]+(?:id|class)=["'][^"']*(?:entry-content|post-content|article-content|page-content|main-content)[^"']*["'][^>]*>([\s\S]{200,})/i
  );
  if (contentDivMatch?.[1]) {
    const text = stripHtml(contentDivMatch[1]);
    if (text.length > 200) return text.slice(0, MAX_CHARS_PER_PAGE);
  }

  // Fallback: use the full cleaned HTML
  return stripHtml(cleaned).slice(0, MAX_CHARS_PER_PAGE);
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with a hard timeout and return the HTML body as a string.
 * Returns null on network error, non-200 status, non-HTML content type, or timeout.
 */
async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Autonord-bot/1.0; +https://autonord.it)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch and extract the main text content from a URL.
 *
 * @param url        The URL to fetch.
 * @param timeoutMs  Per-request timeout (default: 8000 ms).
 * @returns Extracted plain text (up to 2000 chars), or null on any failure.
 */
export async function extractPageContent(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  // Skip binary / non-HTML URLs we cannot parse
  if (/\.pdf(\?|#|$)/i.test(url)) return null;
  if (/\.(jpg|jpeg|png|webp|gif|svg|ico|mp4|mp3|zip|gz)(\?|#|$)/i.test(url)) return null;

  const html = await fetchHtml(url, timeoutMs);
  if (!html || html.length < 100) return null;

  const content = extractMainContent(html);
  if (content.length < 50) return null;

  return content;
}

export interface EnrichOptions {
  /** Max parallel fetch requests (default: 3). */
  concurrency?: number;
  /** Per-URL fetch timeout in ms (default: 8000). */
  timeoutMs?: number;
  /**
   * Only attempt enrichment for items whose current content is shorter than
   * this character threshold (default: 400). Items already containing
   * substantial text (e.g. from deep navigation) are left unchanged.
   */
  minLengthThreshold?: number;
}

/**
 * Enrich CorpusItems by replacing short snippets with actual page content.
 *
 * Items are processed in parallel (up to `concurrency` simultaneous fetches).
 * On any per-item error the original item is returned unchanged.
 * Only text-type items with content shorter than `minLengthThreshold` are
 * eligible — PDF and image items are always skipped.
 *
 * @param items    The corpus items to enrich (not mutated — new array returned).
 * @param options  Concurrency, timeout, and threshold settings.
 * @returns        A new array where eligible items have enriched `content` and
 *                 updated `tokenEstimate`.
 */
export async function enrichCorpusItems(
  items: CorpusItem[],
  options: EnrichOptions = {}
): Promise<CorpusItem[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minLengthThreshold = 400,
  } = options;

  // Identify which items are worth fetching
  type Candidate = { item: CorpusItem; idx: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'image' || item.type === 'pdf') continue;
    if (item.content.length >= minLengthThreshold) continue;
    candidates.push({ item, idx: i });
  }

  if (candidates.length === 0) return items;

  log.info(
    `[PageExtractor] Enriching ${candidates.length}/${items.length} corpus items (threshold=${minLengthThreshold} chars)`
  );

  // Shallow-copy the items array so we don't mutate the input
  const result: CorpusItem[] = [...items];
  const queue = [...candidates];
  let fetchedCount = 0;
  let enrichedCount = 0;

  // Simple concurrency pool — no external dependency
  async function worker(): Promise<void> {
    while (true) {
      const entry = queue.shift();
      if (!entry) break;

      try {
        const pageContent = await extractPageContent(entry.item.url, timeoutMs);
        fetchedCount++;

        if (pageContent && pageContent.length > entry.item.content.length) {
          result[entry.idx] = {
            ...entry.item,
            content: pageContent,
            // Re-estimate tokens: Italian ~3.2 chars/token + 80 token rendering overhead
            tokenEstimate: Math.ceil(pageContent.length / 3.2) + 80,
          };
          enrichedCount++;
          log.info(`[PageExtractor] +${pageContent.length - entry.item.content.length} chars: ${entry.item.url.slice(0, 60)}`);
        }
      } catch (err) {
        log.warn(`[PageExtractor] Failed ${entry.item.url}: ${err}`);
      }
    }
  }

  const workerCount = Math.min(concurrency, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  log.info(
    `[PageExtractor] Done: ${enrichedCount}/${fetchedCount} pages enriched out of ${candidates.length} eligible`
  );

  return result;
}
