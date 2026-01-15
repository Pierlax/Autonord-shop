/**
 * Blog Researcher Agent
 * 
 * Automated system that:
 * 1. Searches Reddit and forums for hot topics about power tools
 * 2. Identifies recurring pain points using AI
 * 3. Generates TAYA-style blog article drafts
 * 4. Creates drafts in Shopify Blog
 * 5. Sends notifications for review
 */

export { searchForTopics, groupByTopic } from './search';
export type { SearchResult, RedditPost } from './search';

export { analyzeTopics, scoreTopic } from './analysis';
export type { TopicAnalysis, AnalysisResult } from './analysis';

export { generateArticleDraft, formatForShopify } from './drafting';
export type { ArticleDraft } from './drafting';

export { createDraftArticle, getDraftArticles, publishArticle, deleteArticle } from './shopify-blog';

export { sendNotification, sendTestNotification } from './notifications';

// V2 Enhanced modules
export * from './sources';
export * from './sentiment';
export * from './article-template';
export { generateEnhancedArticle, generateLaunchArticles } from './drafting-v2';
export type { EnhancedArticleDraft } from './drafting-v2';

// CLaRa-inspired Query Expander module
export {
  smartExpandQuery,
  expandQueryWithAI,
  expandQueryWithTemplates,
  prioritizeQueries,
} from './query-expander';
export type { ExpandedQuery, QueryVariant, QueryType } from './query-expander';
