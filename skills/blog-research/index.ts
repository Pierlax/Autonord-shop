/**
 * Blog Research Skill
 * 
 * Wraps the Blog Researcher module to discover trending topics,
 * research content, and generate article drafts following the
 * TAYA methodology (They Ask, You Answer).
 * 
 * Triggers: cron (weekly), manual
 */

import { createLogger } from '@/lib/logger';
import type {
  AgentSkill,
  SkillContext,
  SkillResult,
  SkillMetadata,
  SkillHealthStatus,
} from '@/lib/skills/types';
import {
  searchForTopics,
  groupByTopic,
  analyzeTopics,
  type SearchResult,
  type AnalysisResult,
} from '@/lib/blog-researcher';
import { generateEnhancedArticle, type EnhancedArticleDraft } from '@/lib/blog-researcher';
import { createDraftArticle } from '@/lib/blog-researcher';
import type { TopicAnalysis } from '@/lib/blog-researcher/analysis';
import type { ArticleType } from '@/lib/blog-researcher/article-template';

const log = createLogger('skill:blog-research');

// =============================================================================
// HEALTH TRACKING
// =============================================================================

let totalExecutions = 0;
let totalErrors = 0;
let totalDurationMs = 0;
let lastExecutedAt: string | undefined;
let lastResult: SkillResult['status'] | undefined;

// =============================================================================
// METADATA
// =============================================================================

const metadata: SkillMetadata = {
  name: 'blog-research',
  description: 'Discovers trending topics in the power tools industry, researches content from Reddit, forums, and news, and generates TAYA-compliant article drafts for the Autonord blog.',
  version: '1.0.0',
  author: 'Autonord Team',
  tags: ['blog', 'research', 'content', 'taya', 'seo'],
  triggers: ['cron', 'manual'],
  maxDurationSeconds: 120,
};

// =============================================================================
// PAYLOAD TYPES
// =============================================================================

type BlogResearchAction = 'discover-topics' | 'generate-article' | 'full-pipeline';

interface BlogResearchPayload {
  action: BlogResearchAction;
  /** For generate-article: the topic to write about */
  topic?: string;
  /** For generate-article: the article type */
  articleType?: string;
  /** For generate-article: target keywords */
  keywords?: string[];
}

// =============================================================================
// SKILL IMPLEMENTATION
// =============================================================================

async function execute(context: SkillContext): Promise<SkillResult> {
  const startMs = Date.now();
  totalExecutions++;

  try {
    const payload = (context.payload ?? { action: 'discover-topics' }) as unknown as BlogResearchPayload;
    const action = payload.action || 'discover-topics';

    log.info(`Blog research action: "${action}" [${context.executionId}]`);

    switch (action) {
      case 'discover-topics':
        return await executeDiscoverTopics(context, startMs);
      case 'generate-article':
        return await executeGenerateArticle(context, payload, startMs);
      case 'full-pipeline':
        return await executeFullPipeline(context, startMs);
      default:
        return {
          success: false,
          status: 'failed',
          message: `Unknown action: ${action}`,
          error: `Valid actions: discover-topics, generate-article, full-pipeline`,
          durationMs: Date.now() - startMs,
        };
    }
  } catch (error) {
    totalErrors++;
    lastResult = 'failed';
    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;

    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Blog research failed [${context.executionId}]: ${errorMsg}`, error);

    return {
      success: false,
      status: 'failed',
      message: 'Blog research failed',
      error: errorMsg,
      durationMs,
    };
  }
}

async function executeDiscoverTopics(
  context: SkillContext,
  startMs: number
): Promise<SkillResult> {
  log.info('Discovering trending topics...');

  const searchResults: SearchResult[] = await searchForTopics();
  const grouped = groupByTopic(searchResults);
  const analysis: AnalysisResult = await analyzeTopics(searchResults);

  const durationMs = Date.now() - startMs;
  totalDurationMs += durationMs;
  lastExecutedAt = new Date().toISOString();
  lastResult = 'success';

  return {
    success: true,
    status: 'success',
    message: `Discovered ${grouped.size} topic clusters from ${searchResults.length} results`,
    data: {
      totalResults: searchResults.length,
      topicClusters: grouped.size,
      topTopics: analysis.allTopics?.slice(0, 5).map((t) => ({
        topic: t.topic,
        painPoint: t.painPoint,
        tayaCategory: t.tayaCategory,
      })) ?? [],
    },
    durationMs,
  };
}

async function executeGenerateArticle(
  context: SkillContext,
  payload: BlogResearchPayload,
  startMs: number
): Promise<SkillResult> {
  if (!payload.topic) {
    return {
      success: false,
      status: 'failed',
      message: 'Missing "topic" in payload for article generation',
      error: 'topic is required for generate-article action',
      durationMs: Date.now() - startMs,
    };
  }

  log.info(`Generating article for topic: "${payload.topic}"`);

  // Build a TopicAnalysis-compatible object for the API
  const topicInput: TopicAnalysis = {
    topic: payload.topic,
    painPoint: '',
    frequency: 0,
    avgEngagement: 0,
    samplePosts: [],
    articleAngle: payload.topic,
    targetAudience: 'professionisti edilizia',
    tayaCategory: 'reviews',
    emotionalHook: '',
    searchIntent: payload.topic,
  };

  const articleType: ArticleType = (payload.articleType as ArticleType) || 'review';
  const draft: EnhancedArticleDraft = await generateEnhancedArticle(topicInput, articleType);

  // Save to Shopify as draft
  const shopifyResult = await createDraftArticle({
    title: draft.title,
    slug: draft.slug,
    metaDescription: draft.metaDescription,
    content: draft.content,
    excerpt: draft.excerpt,
    tags: draft.tags || [],
    category: draft.category,
    estimatedReadTime: draft.estimatedReadTime,
  });

  const durationMs = Date.now() - startMs;
  totalDurationMs += durationMs;
  lastExecutedAt = new Date().toISOString();
  lastResult = 'success';

  return {
    success: true,
    status: 'success',
    message: `Article "${draft.title}" generated and saved as draft`,
    data: {
      title: draft.title,
      wordCount: draft.htmlContent?.split(/\s+/).length ?? 0,
      savedToShopify: !!shopifyResult,
    },
    durationMs,
  };
}

async function executeFullPipeline(
  context: SkillContext,
  startMs: number
): Promise<SkillResult> {
  log.info('Running full blog research pipeline...');

  // Step 1: Discover topics
  const searchResults = await searchForTopics();
  const analysis = await analyzeTopics(searchResults);

  // Step 2: Pick the top topic and generate an article
  const topTopic = analysis.allTopics?.[0];
  if (!topTopic) {
    return {
      success: true,
      status: 'partial',
      message: 'No suitable topics found for article generation',
      data: { totalResults: searchResults.length },
      durationMs: Date.now() - startMs,
    };
  }

  const draft = await generateEnhancedArticle(topTopic, 'review');

  const shopifyResult = await createDraftArticle({
    title: draft.title,
    slug: draft.slug,
    metaDescription: draft.metaDescription,
    content: draft.content,
    excerpt: draft.excerpt,
    tags: draft.tags || [],
    category: draft.category,
    estimatedReadTime: draft.estimatedReadTime,
  });

  const durationMs = Date.now() - startMs;
  totalDurationMs += durationMs;
  lastExecutedAt = new Date().toISOString();
  lastResult = 'success';

  return {
    success: true,
    status: 'success',
    message: `Full pipeline complete: discovered ${searchResults.length} results, generated article "${draft.title}"`,
    data: {
      topicsDiscovered: searchResults.length,
      selectedTopic: topTopic.topic,
      articleTitle: draft.title,
      savedToShopify: !!shopifyResult,
    },
    durationMs,
  };
}

async function validate(context: SkillContext): Promise<string | null> {
  const payload = context.payload as Record<string, unknown> | undefined;
  if (payload?.action === 'generate-article' && !payload?.topic) {
    return 'The "topic" field is required for generate-article action';
  }
  return null;
}

function getStatus(): SkillHealthStatus {
  return {
    state: totalErrors > totalExecutions * 0.5 ? 'degraded' : 'healthy',
    lastExecutedAt,
    lastResult,
    totalExecutions,
    totalErrors,
    averageDurationMs: totalExecutions > 0 ? Math.round(totalDurationMs / totalExecutions) : 0,
  };
}

// =============================================================================
// EXPORT
// =============================================================================

export const blogResearchSkill: AgentSkill = {
  metadata,
  execute,
  validate,
  getStatus,
};
