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

async function fetchRedditPosts(subreddit: string, limit = 50): Promise<RedditPost[]> {
  try {
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
      { headers: { 'User-Agent': 'AutonordBlogResearcher/1.0 (professional tool research)' } }
    );

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
    log.error(`[Search] Error fetching r/${subreddit}:`, error);
    return [];
  }
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
 */
async function fetchRssFeed(source: RssSource): Promise<SearchResult[]> {
  try {
    const response = await fetch(source.feedUrl, {
      headers: { 'User-Agent': 'AutonordBlogResearcher/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      log.warn(`[Search] RSS fetch failed for ${source.domain}: ${response.status}`);
      return [];
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

    log.info(`[Search] RSS ${source.domain}: ${relevant.length}/${items.length} relevant items`);

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
    log.warn(`[Search] RSS error for ${source.domain}:`, error);
    return [];
  }
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
