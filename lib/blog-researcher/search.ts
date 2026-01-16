/**
 * Blog Researcher - Search Module
 * Scans Reddit and forums for hot topics about power tools
 */

import { loggers } from '@/lib/logger';

const log = loggers.blog;

// Types for search results
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
  source: 'reddit' | 'exa' | 'web';
  title: string;
  content: string;
  url: string;
  score: number;
  comments: number;
  date: Date;
  subreddit?: string;
}

// Subreddits to scan for power tool discussions
const TARGET_SUBREDDITS = [
  'Tools',
  'Construction', 
  'electricians',
  'Plumbing',
  'HVAC',
  'Carpentry',
  'HomeImprovement',
  'MilwaukeeTool',
  'Makita',
  'DeWalt',
];

// Search queries for TAYA topics (Big 5)
const SEARCH_QUERIES = [
  // Pricing questions
  'worth the money',
  'overpriced',
  'budget alternative',
  'cost vs',
  
  // Problems
  'problem with',
  'issue with',
  'broke after',
  'stopped working',
  'overheating',
  'battery drain',
  
  // Comparisons
  'vs',
  'better than',
  'compared to',
  'switch from',
  'upgrade from',
  
  // Reviews/Best
  'best',
  'recommend',
  'favorite',
  'worst',
  'avoid',
];

// Brand keywords to filter relevant posts
const BRAND_KEYWORDS = [
  'milwaukee',
  'makita',
  'dewalt',
  'bosch',
  'hilti',
  'metabo',
  'festool',
  'hikoki',
  'ryobi',
  'ridgid',
];

/**
 * Fetch hot posts from a subreddit using Manus Data API
 */
async function fetchRedditPosts(subreddit: string, limit: number = 50): Promise<RedditPost[]> {
  try {
    // Use fetch to call the Reddit API endpoint
    // In production, this would use the Manus Data API
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
      {
        headers: {
          'User-Agent': 'AutonordBlogResearcher/1.0',
        },
      }
    );

    if (!response.ok) {
      log.error(`[Search] Failed to fetch r/${subreddit}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    return data.data.children.map((child: any) => ({
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

/**
 * Filter posts that are relevant to power tools and TAYA topics
 */
function filterRelevantPosts(posts: RedditPost[]): RedditPost[] {
  return posts.filter(post => {
    const text = `${post.title} ${post.selftext}`.toLowerCase();
    
    // Must mention at least one brand
    const hasBrand = BRAND_KEYWORDS.some(brand => text.includes(brand));
    
    // Must match at least one TAYA query pattern
    const hasTayaTopic = SEARCH_QUERIES.some(query => text.includes(query.toLowerCase()));
    
    // Must have some engagement
    const hasEngagement = post.score >= 5 || post.num_comments >= 3;
    
    return hasBrand && (hasTayaTopic || hasEngagement);
  });
}

/**
 * Search Exa.ai for forum discussions (optional, requires API key)
 */
async function searchExa(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  
  if (!apiKey) {
    log.info('[Search] EXA_API_KEY not set, skipping Exa search');
    return [];
  }

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'neural',
        useAutoprompt: true,
        numResults: 10,
        includeDomains: [
          'reddit.com',
          'toolguyd.com',
          'protoolreviews.com',
          'contractortalk.com',
          'garagejournal.com',
        ],
      }),
    });

    if (!response.ok) {
      log.error(`[Search] Exa API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    return data.results.map((result: any) => ({
      source: 'exa' as const,
      title: result.title,
      content: result.text || '',
      url: result.url,
      score: result.score || 0,
      comments: 0,
      date: new Date(result.publishedDate || Date.now()),
    }));
  } catch (error) {
    log.error('[Search] Exa search error:', error);
    return [];
  }
}

/**
 * Main search function - scans all sources
 */
export async function searchForTopics(): Promise<SearchResult[]> {
  log.info('[Search] Starting topic search...');
  
  const allResults: SearchResult[] = [];
  
  // 1. Scan Reddit subreddits
  for (const subreddit of TARGET_SUBREDDITS) {
    log.info(`[Search] Scanning r/${subreddit}...`);
    
    const posts = await fetchRedditPosts(subreddit, 50);
    const relevantPosts = filterRelevantPosts(posts);
    
    log.info(`[Search] Found ${relevantPosts.length} relevant posts in r/${subreddit}`);
    
    for (const post of relevantPosts) {
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
    
    // Rate limiting - wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 2. Search Exa for broader forum discussions (if API key available)
  const exaQueries = [
    'Milwaukee tool problems forum',
    'Makita vs DeWalt professional opinion',
    'power tool battery issues',
    'best cordless drill for electricians',
  ];
  
  for (const query of exaQueries) {
    const exaResults = await searchExa(query);
    allResults.push(...exaResults);
  }
  
  log.info(`[Search] Total results collected: ${allResults.length}`);
  
  // Sort by engagement (score + comments)
  allResults.sort((a, b) => (b.score + b.comments) - (a.score + a.comments));
  
  return allResults;
}

/**
 * Group results by topic/theme
 */
export function groupByTopic(results: SearchResult[]): Map<string, SearchResult[]> {
  const topics = new Map<string, SearchResult[]>();
  
  // Topic patterns to detect
  const topicPatterns = [
    { pattern: /battery|batteries|charge|runtime/i, topic: 'Battery Issues' },
    { pattern: /overheat|hot|temperature|burn/i, topic: 'Overheating Problems' },
    { pattern: /milwaukee.*vs.*makita|makita.*vs.*milwaukee/i, topic: 'Milwaukee vs Makita' },
    { pattern: /milwaukee.*vs.*dewalt|dewalt.*vs.*milwaukee/i, topic: 'Milwaukee vs DeWalt' },
    { pattern: /makita.*vs.*dewalt|dewalt.*vs.*makita/i, topic: 'Makita vs DeWalt' },
    { pattern: /worth|price|expensive|cheap|budget/i, topic: 'Value & Pricing' },
    { pattern: /broke|break|fail|defect|warranty/i, topic: 'Reliability Issues' },
    { pattern: /best.*drill|drill.*recommend/i, topic: 'Best Drills' },
    { pattern: /best.*impact|impact.*recommend/i, topic: 'Best Impact Drivers' },
    { pattern: /best.*saw|saw.*recommend/i, topic: 'Best Saws' },
  ];
  
  for (const result of results) {
    const text = `${result.title} ${result.content}`;
    
    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(text)) {
        if (!topics.has(topic)) {
          topics.set(topic, []);
        }
        topics.get(topic)!.push(result);
        break; // Only assign to first matching topic
      }
    }
  }
  
  return topics;
}
