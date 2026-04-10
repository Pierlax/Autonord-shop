/**
 * Blog Researcher - Search Module
 *
 * Scans Reddit, RSS feeds, and Exa for hot topics on:
 * utensili elettrici, macchine cantiere, gruppi elettrogeni, attrezzatura edile.
 * Sources aligned with the Danea catalog (Autonord product range).
 */

import { loggers } from '@/lib/logger';
import { RSS_SOURCES, RssSource } from './sources';

const log = loggers.blog;

// =============================================================================
// W-BR-1: RSS FEED HEALTH TRACKER
// =============================================================================

/** W-BR-1: Consecutive failures before emitting a "dead feed" warning. */
const RSS_DEAD_FEED_THRESHOLD = 3;

const _rssFeedHealth = new Map<string, {
  failureCount: number;
  lastError: string;
  lastSuccess: Date | null;
}>();

/**
 * W-BR-1: Returns current RSS feed health.
 * Useful for admin/health-check endpoints to detect silently dead feeds.
 */
export function getRssFeedHealth(): Map<string, { failureCount: number; lastError: string; lastSuccess: Date | null }> {
  return _rssFeedHealth;
}

/**
 * W-BR-1: Generate fallback RSS URL candidates for a dead feed.
 * Tries common Atom/RSS path variants on the same origin.
 */
function getFeedFallbackUrls(originalUrl: string): string[] {
  try {
    const { origin } = new URL(originalUrl);
    return [
      `${origin}/feed/`,
      `${origin}/feed`,
      `${origin}/rss/`,
      `${origin}/rss.xml`,
      `${origin}/atom.xml`,
      `${origin}/blog/feed/`,
    ].filter(u => u !== originalUrl);
  } catch {
    return [];
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  permalink: string;
  url: string;
}

export interface SearchResult {
  source: 'reddit' | 'exa' | 'rss' | 'web';
  title: string;
  content: string;
  url: string;
  score: number;
  comments: number;
  date: Date;
  subreddit?: string;
  feedDomain?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Reddit subreddits — EN professionals + brand-specific
const TARGET_SUBREDDITS = [
  // Core professional communities
  'Tools',
  'Contractor',
  'Construction',
  'electricians',
  'Plumbing',
  'HVAC',
  'Carpentry',
  'woodworking',
  'DIY',
  // Brand-specific
  'MilwaukeeTool',
  'Makita',
  'DeWalt',
];

// TAYA query patterns — EN + IT
const SEARCH_QUERIES = [
  // Pricing (IT + EN)
  'worth the money', 'overpriced', 'budget alternative', 'cost vs',
  'vale la pena', 'troppo caro', 'alternativa economica', 'prezzo',

  // Problems (IT + EN)
  'problem with', 'issue with', 'broke after', 'stopped working',
  'overheating', 'battery drain',
  'problemi', 'guasto', 'si è rotto', 'surriscalda', 'batteria scarica',

  // Comparisons (IT + EN)
  'vs', 'better than', 'compared to', 'switch from', 'upgrade from',
  'confronto', 'meglio di', 'quale scegliere', 'o il',

  // Reviews / Best (IT + EN)
  'best', 'recommend', 'favorite', 'worst', 'avoid',
  'migliori', 'consigliato', 'sconsigliato', 'da evitare',
];

// Brand keywords — utensili elettrici + macchine catalogo Danea
const BRAND_KEYWORDS = [
  // Utensili cordless
  'milwaukee', 'makita', 'dewalt', 'bosch', 'hilti', 'metabo',
  'festool', 'hikoki', 'ryobi', 'ridgid', 'fein', 'flex',
  // Macchine cantiere / escavatori
  'yanmar', 'komatsu', 'doosan', 'kubota', 'cat', 'case',
  // Benne e attrezzi escavatore
  'cangini', 'hammer', 'tm benne',
  // Gruppi elettrogeni
  'tecnogen', 'sdmo', 'honda', 'briggs', 'kohler', 'generac',
];

// =============================================================================
// REDDIT FETCHER
// =============================================================================

/**
 * D25 fix: Retry with exponential backoff for Reddit API.
 *
 * Reddit rate-limits unauthenticated requests to 60/min per IP.
 * On Vercel serverless with shared IPs, this is hit easily.
 * Retries 429/5xx responses with 2s/4s/8s backoff (3 attempts total).
 */
async function fetchRedditPosts(subreddit: string, limit = 50): Promise<RedditPost[]> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
        { headers: { 'User-Agent': 'AutonordBlogResearcher/1.0 (professional tool research)' }, signal: AbortSignal.timeout(10_000) }
      );

      // D25: Retry on rate limit (429) or server errors (5xx)
      if (response.status === 429 || response.status >= 500) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn(`[Search] Reddit r/${subreddit} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        log.error(`[Search] Failed to fetch r/${subreddit}: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.data.children.map((child: { data: RedditPost }) => ({
        id: child.data.id,
        title: child.data.title,
        selftext: child.data.selftext || '',
        author: child.data.author,
        score: child.data.score,
        num_comments: child.data.num_comments,
        created_utc: child.data.created_utc,
        subreddit: child.data.subreddit,
        permalink: child.data.permalink,
        url: child.data.url,
      }));
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        log.warn(`[Search] Error fetching r/${subreddit} (attempt ${attempt + 1}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      log.error(`[Search] Error fetching r/${subreddit} after ${MAX_RETRIES} attempts:`, error);
      return [];
    }
  }
  return [];
}

function filterRelevantPosts(posts: RedditPost[]): RedditPost[] {
  return posts.filter(post => {
    const text = `${post.title} ${post.selftext}`.toLowerCase();
    const hasBrand = BRAND_KEYWORDS.some(brand => text.includes(brand));
    const hasTayaTopic = SEARCH_QUERIES.some(q => text.includes(q.toLowerCase()));
    const hasEngagement = post.score >= 5 || post.num_comments >= 3;
    return hasBrand && (hasTayaTopic || hasEngagement);
  });
}

// =============================================================================
// RSS FEED FETCHER
// =============================================================================

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

/**
 * Fetch and parse an RSS feed using native XML parsing via regex.
 * No external libraries required — works in Node.js edge/serverless.
 *
 * W-BR-1: Tries the primary feedUrl, then common fallback URL patterns on
 * the same origin if the primary fails. Tracks per-feed failure counts and
 * emits a structured warning when a feed hits RSS_DEAD_FEED_THRESHOLD
 * consecutive failures so the silent-failure mode is detectable.
 */
async function fetchRssFeed(source: RssSource): Promise<SearchResult[]> {
  // W-BR-1: primary URL first, then fallbacks
  const urlsToTry = [source.feedUrl, ...getFeedFallbackUrls(source.feedUrl)];

  for (const feedUrl of urlsToTry) {
    try {
      const response = await fetch(feedUrl, {
        headers: { 'User-Agent': 'AutonordBlogResearcher/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        // W-BR-1: track failure
        const h = _rssFeedHealth.get(source.domain) ?? { failureCount: 0, lastError: '', lastSuccess: null };
        h.failureCount++;
        h.lastError = `HTTP ${response.status}`;
        _rssFeedHealth.set(source.domain, h);
        if (h.failureCount >= RSS_DEAD_FEED_THRESHOLD) {
          log.warn(
            `[Search] W-BR-1: RSS "${source.domain}" has failed ${h.failureCount}× (${h.lastError}). ` +
            `Feed may be dead — verify feedUrl in sources.ts RSS_SOURCES. Tried: ${feedUrl}`
          );
        } else {
          log.warn(`[Search] RSS fetch failed for ${source.domain} (${feedUrl}): ${response.status}`);
        }
        continue; // W-BR-1: try next fallback URL
      }

      const xml = await response.text();

      // Extract <item> blocks
      const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

      const items: RssItem[] = itemMatches.map(block => ({
        title: (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/) ?? [])[1] ?? (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/) ?? [])[2] ?? '',
        link: (block.match(/<link>(.*?)<\/link>/) ?? [])[1] ?? '',
        description: (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/) ?? [])[1] ?? '',
        pubDate: (block.match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1] ?? '',
      }));

      // Filter to brand-relevant items only
      const relevant = items.filter(item => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        return BRAND_KEYWORDS.some(b => text.includes(b)) ||
               SEARCH_QUERIES.some(q => text.includes(q.toLowerCase()));
      });

      // W-BR-1: success — reset failure count
      _rssFeedHealth.set(source.domain, { failureCount: 0, lastError: '', lastSuccess: new Date() });
      log.info(
        `[Search] RSS ${source.domain}: ${relevant.length}/${items.length} relevant items` +
        (feedUrl !== source.feedUrl ? ` (fallback URL: ${feedUrl})` : '')
      );

      return relevant.map(item => ({
        source: 'rss' as const,
        title: item.title.replace(/<[^>]+>/g, '').trim(),
        content: item.description.replace(/<[^>]+>/g, '').slice(0, 500),
        url: item.link.trim(),
        score: source.priority,
        comments: 0,
        date: item.pubDate ? new Date(item.pubDate) : new Date(),
        feedDomain: source.domain,
      }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // W-BR-1: track failure
      const h = _rssFeedHealth.get(source.domain) ?? { failureCount: 0, lastError: '', lastSuccess: null };
      h.failureCount++;
      h.lastError = errMsg;
      _rssFeedHealth.set(source.domain, h);
      if (h.failureCount >= RSS_DEAD_FEED_THRESHOLD) {
        log.warn(
          `[Search] W-BR-1: RSS "${source.domain}" failed ${h.failureCount}× total. Last error: ${errMsg}`
        );
      } else {
        log.warn(`[Search] RSS error for ${source.domain} (${feedUrl}):`, error);
      }
      // W-BR-1: continue to next fallback URL
    }
  }

  return [];
}


// =============================================================================
// MAIN SEARCH ORCHESTRATOR
// =============================================================================

/**
 * Collect trending topics from Reddit, RSS feeds, and Exa.
 * Results are merged and sorted by engagement.
 */
export async function searchForTopics(): Promise<SearchResult[]> {
  log.info('[Search] Starting topic search...');
  const allResults: SearchResult[] = [];

  // ── 1. Reddit subreddits ──────────────────────────────────────────────────
  for (const subreddit of TARGET_SUBREDDITS) {
    log.info(`[Search] Scanning r/${subreddit}...`);
    const posts = await fetchRedditPosts(subreddit, 50);
    const relevant = filterRelevantPosts(posts);
    log.info(`[Search] r/${subreddit}: ${relevant.length} relevant posts`);

    for (const post of relevant) {
      allResults.push({
        source: 'reddit',
        title: post.title,
        content: post.selftext,
        url: `https://reddit.com${post.permalink}`,
        score: post.score,
        comments: post.num_comments,
        date: new Date(post.created_utc * 1000),
        subreddit: post.subreddit,
      });
    }

    // Polite rate limiting between Reddit requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // ── 2. RSS feeds ──────────────────────────────────────────────────────────
  log.info(`[Search] Fetching ${RSS_SOURCES.length} RSS feeds...`);
  const rssResults = await Promise.allSettled(RSS_SOURCES.map(fetchRssFeed));
  for (const result of rssResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  log.info(`[Search] Total collected: ${allResults.length} results`);

  // Sort by engagement
  allResults.sort((a, b) => (b.score + b.comments) - (a.score + a.comments));

  return allResults;
}

// =============================================================================
// TOPIC GROUPER
// =============================================================================

/**
 * Cluster results into named topics for the analysis phase.
 */
export function groupByTopic(results: SearchResult[]): Map<string, SearchResult[]> {
  const topics = new Map<string, SearchResult[]>();

  const topicPatterns: { pattern: RegExp; topic: string }[] = [
    // Brand confronti
    { pattern: /milwaukee.{0,10}(vs|contro|o il).{0,10}makita|makita.{0,10}(vs|contro|o il).{0,10}milwaukee/i, topic: 'Milwaukee vs Makita' },
    { pattern: /milwaukee.{0,10}(vs|contro|o il).{0,10}dewalt|dewalt.{0,10}(vs|contro|o il).{0,10}milwaukee/i, topic: 'Milwaukee vs DeWalt' },
    { pattern: /makita.{0,10}(vs|contro|o il).{0,10}dewalt|dewalt.{0,10}(vs|contro|o il).{0,10}makita/i, topic: 'Makita vs DeWalt' },
    { pattern: /hi-?koki/i, topic: 'HiKOKI Tools' },

    // Problemi tecnici utensili — singolare + plurale IT
    { pattern: /batter(?:y|ies|ia|ie)|charge|runtime|ricaric/i, topic: 'Battery Issues' },
    { pattern: /overheat|surriscald(?:a|amento)|temperatura.*alta|hot.*tool/i, topic: 'Overheating Problems' },
    { pattern: /broke|break|fail|defect|warranty|guast[oi]|difett[oi]|si.{0,5}rompe/i, topic: 'Reliability Issues' },

    // Categorie prodotto — singolare + plurale IT
    { pattern: /best.*drill|drill.*recommend|miglior[ie]?.{0,5}trapan[oi]/i, topic: 'Best Drills' },
    { pattern: /best.*impact|impact.*recommend|avvitator[ei]/i, topic: 'Best Impact Drivers' },
    { pattern: /best.*saw|saw.*recommend|seg[ae]\b/i, topic: 'Best Saws' },
    { pattern: /tassellator[ei]|rotary.*hammer|sds.{0,5}plus/i, topic: 'Rotary Hammers' },
    { pattern: /smerigliatric[ei]|angle.*grinder|flex.*grinding/i, topic: 'Angle Grinders' },

    // Generatori — singolare + plurale IT
    { pattern: /generator[es]?|generator[ei]\b|gruppi?.{0,5}elettrogen[io]/i, topic: 'Generators' },
    { pattern: /tecnogen|sdmo/i, topic: 'Generators' },
    { pattern: /silenzios[oa]|noise.*level|db[a]?\b|rumorosit[àa]/i, topic: 'Generator Noise' },
    { pattern: /autonomi[ae].*generatore|fuel.*consumption|consumo.*carburante/i, topic: 'Generator Fuel & Autonomy' },

    // Macchine cantiere — singolare + plurale IT
    { pattern: /mini.?escavator[ei]|mini.?digger|compact.*excavat/i, topic: 'Mini Excavators' },
    { pattern: /escavator[ei]|excavat(?:or|ing)|yanmar|komatsu|kubota|doosan/i, topic: 'Excavators' },
    { pattern: /benn[ae]|bucket.*attach|cangini|hammer.*attach|tm.{0,5}benn/i, topic: 'Excavator Attachments' },
    { pattern: /demolizion[ei]|demolition.*hammer|martell[oi].*demolitore/i, topic: 'Demolition' },

    // Pricing
    { pattern: /worth.*money|price.*quality|expensive|budget.{0,10}alternat|prezzo|vale.{0,5}pena|troppo.{0,5}car/i, topic: 'Value & Pricing' },
  ];

  for (const result of results) {
    const text = `${result.title} ${result.content}`;
    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(text)) {
        if (!topics.has(topic)) topics.set(topic, []);
        topics.get(topic)!.push(result);
        break;
      }
    }
  }

  return topics;
}
