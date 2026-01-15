/**
 * Blog Researcher - Sentiment Analysis Module
 * 
 * Analyzes forum discussions to extract real opinions,
 * problems, and sentiment about products
 */

import Anthropic from '@anthropic-ai/sdk';
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
      });
      
      if (!response.ok) {
        console.log(`[Sentiment] Reddit search failed for r/${subreddit}: ${response.status}`);
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
      console.error(`[Sentiment] Error searching r/${subreddit}:`, error);
    }
  }
  
  return posts;
}

/**
 * Search Italian forums using web search
 * Note: This requires SERPAPI_API_KEY or similar
 */
async function searchItalianForums(query: string): Promise<ForumPost[]> {
  const posts: ForumPost[] = [];
  const serpApiKey = process.env.SERPAPI_API_KEY;
  
  if (!serpApiKey) {
    console.log('[Sentiment] SERPAPI_API_KEY not set, skipping Italian forum search');
    return posts;
  }
  
  const italianForums = FORUM_SOURCES.filter(f => f.language === 'it');
  
  for (const forum of italianForums) {
    try {
      const searchQuery = `${forum.searchPatterns[0]} ${query}`;
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}&num=10`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`[Sentiment] SerpAPI search failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.organic_results) {
        for (const result of data.organic_results) {
          posts.push({
            source: forum.name,
            url: result.link,
            title: result.title,
            content: result.snippet || '',
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[Sentiment] Error searching ${forum.name}:`, error);
    }
  }
  
  return posts;
}

// =============================================================================
// SENTIMENT ANALYSIS WITH CLAUDE
// =============================================================================

/**
 * Analyze forum posts with Claude to extract sentiment and insights
 */
async function analyzePostsWithClaude(
  posts: ForumPost[],
  productName: string
): Promise<SentimentResult> {
  const anthropic = new Anthropic();
  
  // Prepare posts summary for Claude
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    return JSON.parse(jsonMatch[0]) as SentimentResult;
    
  } catch (error) {
    console.error('[Sentiment] Claude analysis error:', error);
    
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
  const anthropic = new Anthropic();
  
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') return [];
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const result = JSON.parse(jsonMatch[0]);
    return result.problems || [];
    
  } catch (error) {
    console.error('[Sentiment] Problem extraction error:', error);
    return [];
  }
}

// =============================================================================
// MAIN RESEARCH FUNCTION
// =============================================================================

/**
 * Conduct comprehensive forum research for a product
 */
export async function researchProductSentiment(
  productName: string,
  options: {
    includeItalian?: boolean;
    maxPosts?: number;
  } = {}
): Promise<ForumResearchResult> {
  const { includeItalian = true, maxPosts = 100 } = options;
  
  console.log(`[Sentiment] Starting research for: ${productName}`);
  
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
  
  console.log(`[Sentiment] Collected ${uniquePosts.length} unique posts`);
  
  // 3. Analyze sentiment with Claude
  const sentiment = await analyzePostsWithClaude(uniquePosts, productName);
  
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
