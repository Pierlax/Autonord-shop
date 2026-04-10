/**
 * Blog Researcher - Sentiment Analysis Module
 * 
 * Analyzes forum discussions to extract real opinions,
 * problems, and sentiment about products
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';
import { optionalEnv } from '@/lib/env';
import { cachedGenericDynamic } from '@/lib/shopify/rag-cache';

const log = loggers.blog;
import {
  FORUM_SOURCES,
  ForumSource,
  getProblemQueries,
  getOpinionQueries,
  getComparisonQueries,
} from './sources';

// =============================================================================
// TYPES
// =============================================================================

export interface ForumPost {
  source: string;
  url: string;
  title: string;
  content: string;
  author?: string;
  date?: Date;
  upvotes?: number;
  replies?: number;
}

export interface SentimentResult {
  positive: string[];
  negative: string[];
  neutral: string[];
  commonProblems: string[];
  praises: string[];
  quotes: QuotedOpinion[];
  overallSentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
  confidence: number;
}

export interface QuotedOpinion {
  quote: string;
  source: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  context: string;
}

export interface ForumResearchResult {
  product: string;
  postsAnalyzed: number;
  sentiment: SentimentResult;
  topProblems: ProblemReport[];
  topPraises: string[];
  italianInsights: string[];
  englishInsights: string[];
  rawPosts: ForumPost[];
}

export interface ProblemReport {
  issue: string;
  frequency: number; // How many times mentioned
  severity: 'minor' | 'moderate' | 'severe';
  sources: string[];
  possibleCauses: string[];
}

// =============================================================================
// FORUM SEARCH
// =============================================================================

/**
 * Search Reddit for posts about a product
 */
async function searchReddit(query: string, subreddits: string[]): Promise<ForumPost[]> {
  const posts: ForumPost[] = [];
  
  for (const subreddit of subreddits) {
    try {
      // Search Reddit's JSON API
      const searchUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=25`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'AutonordBlogResearcher/2.0',
        },
        signal: AbortSignal.timeout(10_000),
      });
      
      if (!response.ok) {
        log.info(`[Sentiment] Reddit search failed for r/${subreddit}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      for (const child of data.data.children) {
        const post = child.data;
        posts.push({
          source: `reddit.com/r/${subreddit}`,
          url: `https://reddit.com${post.permalink}`,
          title: post.title,
          content: post.selftext || '',
          author: post.author,
          date: new Date(post.created_utc * 1000),
          upvotes: post.score,
          replies: post.num_comments,
        });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      log.error(`[Sentiment] Error searching r/${subreddit}:`, error);
    }
  }
  
  return posts;
}

/**
 * Search Italian forums using web search.
 * Strategy 1: Google Custom Search (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX)
 * Strategy 2: Fallback direct Google scraping
 */
async function searchItalianForums(query: string): Promise<ForumPost[]> {
  const googleApiKey = optionalEnv.GOOGLE_SEARCH_API_KEY;
  const googleCx = optionalEnv.GOOGLE_SEARCH_CX;

  if (googleApiKey && googleCx) {
    const googleResults = await searchWithGoogleCustomSearch(query, googleApiKey, googleCx);
    if (googleResults.length > 0) {
      return googleResults;
    }
  }

  log.info('[Sentiment] GOOGLE_SEARCH_API_KEY not set, using fallback Google search');
  return searchWithGoogleFallback(query);
}

/**
 * Search using Google Custom Search API
 */
async function searchWithGoogleCustomSearch(
  query: string,
  apiKey: string,
  cx: string
): Promise<ForumPost[]> {
  const posts: ForumPost[] = [];
  const italianForumSites = 'site:plcforum.it OR site:forum-macchine.it OR site:electroyou.it OR site:faidatehobby.it';
  
  try {
    const searchQuery = `${query} ${italianForumSites}`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}&num=10&lr=lang_it`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!response.ok) {
      log.info(`[Sentiment] Google Custom Search failed: ${response.status}`);
      return posts;
    }
    
    const data = await response.json();
    
    if (data.items) {
      for (const item of data.items) {
        posts.push({
          source: extractSourceFromUrl(item.link),
          url: item.link,
          title: item.title,
          content: item.snippet || '',
        });
      }
    }
    
  } catch (error) {
    log.error('[Sentiment] Google Custom Search error:', error);
  }
  
  return posts;
}

/**
 * W-BR-2: DDG Lite fallback — uses lite.duckduckgo.com which has a simpler
 * table-based markup that is less fragile than the full DDG HTML endpoint.
 * Called automatically when the primary DDG HTML parse yields 0 results.
 *
 * The lite endpoint uses a different URL pattern for redirects (uddg= param)
 * and its anchor+snippet structure is simpler, making regex more stable.
 */
async function searchWithDdgLite(query: string, filterSite: string): Promise<ForumPost[]> {
  const posts: ForumPost[] = [];
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(`site:${filterSite} ${query}`)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return posts;

    const html = await response.text();

    // DDG Lite layout: <a class="result-link" href="...">Title</a>
    //                  followed by <td class="result-snippet">Snippet</td>
    const liteRegex = /<a class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
    let match: RegExpExecArray | null;

    while ((match = liteRegex.exec(html)) !== null && posts.length < 5) {
      const [, href, title, snippet] = match;
      // DDG Lite may use uddg= redirect param
      const uddgMatch = href.match(/uddg=([^&]+)/);
      const actualUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : href;

      if (actualUrl.includes(filterSite)) {
        posts.push({
          source: filterSite,
          url: actualUrl,
          title: decodeHtmlEntities(title.trim()),
          content: decodeHtmlEntities(snippet.replace(/<[^>]+>/g, '').trim()),
        });
      }
    }

    if (posts.length > 0) {
      log.info(`[Sentiment] W-BR-2: DDG Lite found ${posts.length} result(s) for ${filterSite}`);
    }
  } catch (error) {
    log.warn(`[Sentiment] W-BR-2: DDG Lite fallback error for ${filterSite}:`, error);
  }
  return posts;
}

/**
 * Fallback: Basic Google search (limited, may be rate-limited)
 * Uses Google's public search with site restrictions
 */
async function searchWithGoogleFallback(query: string): Promise<ForumPost[]> {
  const posts: ForumPost[] = [];
  
  // Italian forum sites to search
  const italianSites = [
    'plcforum.it',
    'forum-macchine.it',
    'electroyou.it',
    'faidatehobby.it',
  ];
  
  for (const site of italianSites) {
    try {
      // Use DuckDuckGo HTML as fallback (more permissive than Google)
      const searchQuery = `site:${site} ${query}`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10_000),
      });
      
      if (!response.ok) {
        continue;
      }
      
      const html = await response.text();

      // D29 fix: Try multiple selector patterns for DuckDuckGo HTML parsing.
      // DDG can change its DOM structure, breaking a single regex silently.
      // We try the known pattern first, then alternatives.
      const RESULT_PATTERNS = [
        // Primary: current DDG HTML layout
        /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/g,
        // Alternative 1: snippet in a <td> instead of <a>
        /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td class="result__snippet"[^>]*>([^<]*)<\/td>/g,
        // Alternative 2: different class naming
        /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?class="[^"]*snippet[^"]*"[^>]*>([^<]*)</g,
      ];

      let matchFound = false;
      for (const resultRegex of RESULT_PATTERNS) {
        resultRegex.lastIndex = 0;
        let match;

        while ((match = resultRegex.exec(html)) !== null && posts.length < 5) {
          matchFound = true;
          const [, encodedUrl, title, snippet] = match;

          // Decode DuckDuckGo redirect URL
          const urlMatch = encodedUrl.match(/uddg=([^&]+)/);
          const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : encodedUrl;

          if (actualUrl.includes(site)) {
            posts.push({
              source: site,
              url: actualUrl,
              title: decodeHtmlEntities(title),
              content: decodeHtmlEntities(snippet),
            });
          }
        }
        if (matchFound) break; // First working pattern is enough
      }

      // D29 fix: Health check — if DDG returned HTML but no pattern matched,
      // the DOM may have changed.
      // W-BR-2: additionally try DDG Lite endpoint as secondary fallback.
      if (!matchFound && html.length > 1000) {
        log.warn(
          `[Sentiment] D29 DDG HEALTH CHECK: ${site} returned ${html.length} bytes HTML but 0 results parsed. ` +
          `DuckDuckGo DOM may have changed — review RESULT_PATTERNS in searchWithGoogleFallback()`
        );
        // W-BR-2: DDG Lite has simpler markup — try it before giving up
        const litePosts = await searchWithDdgLite(query, site);
        posts.push(...litePosts);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      log.error(`[Sentiment] Fallback search error for ${site}:`, error);
    }
  }
  
  if (posts.length === 0) {
    log.warn('[Sentiment] WARNING: No Italian forum results found. Configure GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX for better coverage.');
  }
  
  return posts;
}

/**
 * Extract source name from URL
 */
function extractSourceFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// =============================================================================
// SENTIMENT ANALYSIS WITH CLAUDE
// =============================================================================

/**
 * Analyze forum posts with Gemini to extract sentiment and insights
 */
async function analyzePostsWithGemini(
  posts: ForumPost[],
  productName: string
): Promise<SentimentResult> {
  // D27 fix: Minimum post threshold guard.
  // With fewer than 3 posts, Gemini tends to over-generalize or invent patterns.
  // Return a low-confidence neutral result instead of hallucinating sentiment.
  if (posts.length < 3) {
    log.warn(
      `[Sentiment] D27: Only ${posts.length} post(s) for "${productName}" — ` +
      `too few for reliable sentiment analysis, returning neutral with low confidence`
    );
    return {
      positive: [],
      negative: [],
      neutral: [`Pochi dati disponibili (${posts.length} post)`],
      commonProblems: [],
      praises: [],
      quotes: posts.slice(0, 2).map(p => ({
        quote: p.content.slice(0, 200),
        source: p.source,
        url: p.url,
        sentiment: 'neutral' as const,
        context: p.title,
      })),
      overallSentiment: 'neutral',
      confidence: posts.length === 0 ? 0 : 0.2,
    };
  }

  // Prepare posts summary for Gemini
  const postsSummary = posts.slice(0, 30).map((post, i) =>
    `[Post ${i + 1}] Source: ${post.source}
Title: ${post.title}
Content: ${post.content.slice(0, 500)}${post.content.length > 500 ? '...' : ''}
Upvotes: ${post.upvotes || 'N/A'}, Replies: ${post.replies || 'N/A'}
URL: ${post.url}
---`
  ).join('\n');
  
  const prompt = `Analizza questi post dei forum riguardo "${productName}" ed estrai:

1. SENTIMENT GENERALE: Positivo, Negativo, Misto o Neutro
2. PROBLEMI COMUNI: Lista dei problemi menzionati più frequentemente
3. ELOGI: Cosa viene lodato del prodotto
4. CITAZIONI SIGNIFICATIVE: 3-5 citazioni dirette che rappresentano opinioni reali (con fonte)
5. INSIGHT ITALIANI: Se ci sono post in italiano, cosa dicono i professionisti italiani?

POST DA ANALIZZARE:
${postsSummary}

Rispondi in formato JSON:
{
  "overallSentiment": "positive|negative|mixed|neutral",
  "confidence": 0.0-1.0,
  "positive": ["punto positivo 1", "punto positivo 2"],
  "negative": ["punto negativo 1", "punto negativo 2"],
  "neutral": ["osservazione neutra 1"],
  "commonProblems": ["problema 1", "problema 2"],
  "praises": ["elogio 1", "elogio 2"],
  "quotes": [
    {
      "quote": "citazione esatta",
      "source": "nome fonte",
      "url": "url del post",
      "sentiment": "positive|negative|neutral",
      "context": "breve contesto"
    }
  ]
}`;

  try {
    const result = await generateTextSafe({
      prompt,
      maxTokens: 2000,
      temperature: 0.5,
    });
    const content = result.text;
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    return JSON.parse(jsonMatch[0]) as SentimentResult;
    
  } catch (error) {
    log.error('[Sentiment] Gemini analysis error:', error);
    
    // Return empty result on error
    return {
      positive: [],
      negative: [],
      neutral: [],
      commonProblems: [],
      praises: [],
      quotes: [],
      overallSentiment: 'neutral',
      confidence: 0,
    };
  }
}

/**
 * Extract and categorize problems from posts
 */
async function extractProblems(
  posts: ForumPost[],
  productName: string
): Promise<ProblemReport[]> {
  const problemPosts = posts.filter(post => {
    const text = `${post.title} ${post.content}`.toLowerCase();
    return (
      text.includes('problem') ||
      text.includes('issue') ||
      text.includes('broke') ||
      text.includes('fail') ||
      text.includes('problema') ||
      text.includes('guasto') ||
      text.includes('difetto')
    );
  });
  
  if (problemPosts.length === 0) {
    return [];
  }
  
  const postsSummary = problemPosts.slice(0, 20).map((post, i) =>
    `[${i + 1}] ${post.title}\n${post.content.slice(0, 300)}\nSource: ${post.source}`
  ).join('\n---\n');
  
  const prompt = `Analizza questi post che parlano di problemi con "${productName}".
Identifica i problemi ricorrenti e categorizzali.

POST:
${postsSummary}

Rispondi in JSON:
{
  "problems": [
    {
      "issue": "descrizione breve del problema",
      "frequency": numero di volte menzionato,
      "severity": "minor|moderate|severe",
      "sources": ["fonte1", "fonte2"],
      "possibleCauses": ["causa possibile 1", "causa possibile 2"]
    }
  ]
}`;

  try {
    const result = await generateTextSafe({
      prompt,
      maxTokens: 1500,
      temperature: 0.5,
    });
    const content = result.text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.problems || [];
    
  } catch (error) {
    log.error('[Sentiment] Problem extraction error:', error);
    return [];
  }
}

// =============================================================================
// MAIN RESEARCH FUNCTION
// =============================================================================

/**
 * Conduct comprehensive forum research for a product.
 *
 * @param preDiscoveredPosts - Optional posts already collected by the RAG Bridge.
 *   When provided, the search phase is skipped and Gemini analysis runs directly
 *   on the supplied posts. This eliminates the double-search pattern where
 *   rag-bridge.discoverBlogSources() and researchProductSentiment() both query
 *   the same forums for the same topic (audit fix R3).
 */
export async function researchProductSentiment(
  productName: string,
  options: {
    includeItalian?: boolean;
    maxPosts?: number;
    /** Pre-discovered posts from the RAG Bridge — skips the search phase. */
    preDiscoveredPosts?: ForumPost[];
  } = {}
): Promise<ForumResearchResult> {
  const { includeItalian = true, maxPosts = 100, preDiscoveredPosts } = options;

  log.info(`[Sentiment] Starting research for: ${productName}`);

  // R3: If posts were already discovered by the RAG Bridge, skip the search phase.
  if (preDiscoveredPosts && preDiscoveredPosts.length > 0) {
    log.info(`[Sentiment] R3: Using ${preDiscoveredPosts.length} pre-discovered posts (skipping search)`);
    const uniquePosts = Array.from(
      new Map(preDiscoveredPosts.map(p => [p.url, p])).values()
    ).slice(0, maxPosts);
    const sentiment = await analyzePostsWithGemini(uniquePosts, productName);
    const topProblems = await extractProblems(uniquePosts, productName);
    const italianInsights = sentiment.quotes
      .filter(q => q.source.includes('plcforum') || q.source.includes('forum-macchine'))
      .map(q => q.quote);
    const englishInsights = sentiment.quotes
      .filter(q => q.source.includes('reddit') || q.source.includes('garage'))
      .map(q => q.quote);
    return {
      product: productName,
      postsAnalyzed: uniquePosts.length,
      sentiment,
      topProblems,
      topPraises: sentiment.praises,
      italianInsights,
      englishInsights,
      rawPosts: uniquePosts,
    };
  }

  const allPosts: ForumPost[] = [];
  
  // 1. Search Reddit
  const redditSubreddits = ['Tools', 'MilwaukeeTool', 'Makita', 'DeWalt', 'Construction', 'electricians'];
  
  // Problem queries
  const problemQueries = getProblemQueries(productName);
  for (const query of problemQueries.slice(0, 3)) {
    const posts = await searchReddit(query, redditSubreddits);
    allPosts.push(...posts);
  }
  
  // Opinion queries
  const opinionQueries = getOpinionQueries(productName);
  for (const query of opinionQueries.slice(0, 2)) {
    const posts = await searchReddit(query, redditSubreddits);
    allPosts.push(...posts);
  }
  
  // 2. Search Italian forums (if enabled)
  let italianPosts: ForumPost[] = [];
  if (includeItalian) {
    const italianQueries = [
      `${productName} opinioni`,
      `${productName} problemi`,
      `${productName} recensione`,
    ];
    
    for (const query of italianQueries) {
      const posts = await searchItalianForums(query);
      italianPosts.push(...posts);
    }
    
    allPosts.push(...italianPosts);
  }
  
  // Deduplicate by URL
  const uniquePosts = Array.from(
    new Map(allPosts.map(p => [p.url, p])).values()
  ).slice(0, maxPosts);
  
  log.info(`[Sentiment] Collected ${uniquePosts.length} unique posts`);
  
  // 3. Analyze sentiment with Gemini
  const sentiment = await analyzePostsWithGemini(uniquePosts, productName);
  
  // 4. Extract problems
  const topProblems = await extractProblems(uniquePosts, productName);
  
  // 5. Separate insights by language
  const italianInsights = italianPosts.length > 0
    ? sentiment.quotes
        .filter(q => q.source.includes('plcforum') || q.source.includes('forum-macchine'))
        .map(q => q.quote)
    : [];
  
  const englishInsights = sentiment.quotes
    .filter(q => q.source.includes('reddit') || q.source.includes('garage'))
    .map(q => q.quote);
  
  const result: ForumResearchResult = {
    product: productName,
    postsAnalyzed: uniquePosts.length,
    sentiment,
    topProblems,
    topPraises: sentiment.praises,
    italianInsights,
    englishInsights,
    rawPosts: uniquePosts,
  };

  // R6 Phase B: persist sentiment data so the product pipeline (ai-enrichment-v3) can read it.
  // Cache key is deterministic by product name — shared across blog and product pipelines.
  const cacheKey = `sentiment:v1:${productName.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
  const SENTIMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — forums don't change hourly
  try {
    // Fire-and-forget: don't block on cache write
    cachedGenericDynamic(cacheKey, async () => result, () => SENTIMENT_TTL_MS).catch(() => undefined);
  } catch {
    // Cache unavailable — not critical
  }

  return result;
}

/**
 * Research sentiment for a product comparison
 */
export async function researchComparisonSentiment(
  product1: string,
  product2: string
): Promise<{
  product1Research: ForumResearchResult;
  product2Research: ForumResearchResult;
  headToHeadPosts: ForumPost[];
  communityPreference: string;
}> {
  // Research both products
  const [research1, research2] = await Promise.all([
    researchProductSentiment(product1),
    researchProductSentiment(product2),
  ]);
  
  // Search for direct comparison posts
  const comparisonQueries = getComparisonQueries(product1, product2);
  const headToHeadPosts: ForumPost[] = [];
  
  for (const query of comparisonQueries.slice(0, 2)) {
    const posts = await searchReddit(query, ['Tools', 'Construction', 'electricians']);
    headToHeadPosts.push(...posts);
  }
  
  // Determine community preference
  const pref1Score = research1.sentiment.positive.length - research1.sentiment.negative.length;
  const pref2Score = research2.sentiment.positive.length - research2.sentiment.negative.length;
  
  let communityPreference: string;
  if (pref1Score > pref2Score + 2) {
    communityPreference = `La community preferisce ${product1}`;
  } else if (pref2Score > pref1Score + 2) {
    communityPreference = `La community preferisce ${product2}`;
  } else {
    communityPreference = 'Le opinioni sono divise, dipende dall\'uso specifico';
  }
  
  return {
    product1Research: research1,
    product2Research: research2,
    headToHeadPosts,
    communityPreference,
  };
}
