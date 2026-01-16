/**
 * Blog Researcher Agent - Vercel Cron Job
 * 
 * Automatically searches forums for hot topics and generates
 * TAYA-style blog article drafts.
 * 
 * Schedule: Every Monday at 8:00 AM (configured in vercel.json)
 * 
 * Flow:
 * 1. Search Reddit and forums for power tool discussions
 * 2. Analyze results to identify recurring pain points
 * 3. Generate a TAYA-style article draft with Claude
 * 4. Create draft article in Shopify Blog
 * 5. Send notification for review
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggers } from '@/lib/logger';

const log = loggers.blog;
import { searchForTopics, groupByTopic } from '@/lib/blog-researcher/search';
import { analyzeTopics } from '@/lib/blog-researcher/analysis';
import { generateArticleDraft, formatForShopify } from '@/lib/blog-researcher/drafting';
import { createDraftArticle } from '@/lib/blog-researcher/shopify-blog';
import { sendNotification } from '@/lib/blog-researcher/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for cron job

/**
 * Verify the request is from Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // If CRON_SECRET is set, verify it
  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
  }
  
  // Check for Vercel cron header
  const vercelCron = request.headers.get('x-vercel-cron');
  return vercelCron === '1';
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  log.info('[BlogResearcher] Starting cron job...');
  log.info(`[BlogResearcher] Time: ${new Date().toISOString()}`);
  
  // Verify request origin
  if (!verifyCronRequest(request)) {
    log.error('[BlogResearcher] Unauthorized request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Step 1: Search for topics
    log.info('[BlogResearcher] Step 1: Searching for topics...');
    const searchResults = await searchForTopics();
    
    if (searchResults.length === 0) {
      log.info('[BlogResearcher] No relevant topics found');
      return NextResponse.json({
        success: true,
        message: 'No relevant topics found this week',
        articlesCreated: 0,
        processingTime: `${Date.now() - startTime}ms`,
      });
    }
    
    log.info(`[BlogResearcher] Found ${searchResults.length} relevant posts`);
    
    // Step 2: Analyze and select best topic
    log.info('[BlogResearcher] Step 2: Analyzing topics...');
    const analysis = await analyzeTopics(searchResults);
    
    log.info(`[BlogResearcher] Selected topic: ${analysis.selectedTopic.topic}`);
    log.info(`[BlogResearcher] Pain point: ${analysis.selectedTopic.painPoint}`);
    
    // Step 3: Generate article draft
    log.info('[BlogResearcher] Step 3: Generating article...');
    const articleDraft = await generateArticleDraft(analysis.selectedTopic);
    
    // Format content for Shopify
    articleDraft.content = formatForShopify(articleDraft);
    
    log.info(`[BlogResearcher] Generated: ${articleDraft.title}`);
    log.info(`[BlogResearcher] Word count: ~${articleDraft.content.split(/\s+/).length}`);
    
    // Step 4: Create draft in Shopify
    log.info('[BlogResearcher] Step 4: Creating Shopify draft...');
    const shopifyArticle = await createDraftArticle(articleDraft);
    
    log.info(`[BlogResearcher] Created draft article ID: ${shopifyArticle.id}`);
    
    // Step 5: Send notification
    log.info('[BlogResearcher] Step 5: Sending notifications...');
    const notificationResults = await sendNotification(articleDraft, shopifyArticle.id);
    
    const successfulNotifications = notificationResults.filter(r => r.success);
    log.info(`[BlogResearcher] Sent ${successfulNotifications.length} notifications`);
    
    const duration = Date.now() - startTime;
    log.info(`[BlogResearcher] Completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      article: {
        id: shopifyArticle.id,
        title: articleDraft.title,
        slug: articleDraft.slug,
        category: articleDraft.category,
        readTime: articleDraft.estimatedReadTime,
        tags: articleDraft.tags,
      },
      topic: {
        name: analysis.selectedTopic.topic,
        painPoint: analysis.selectedTopic.painPoint,
        tayaCategory: analysis.selectedTopic.tayaCategory,
      },
      search: {
        totalResults: searchResults.length,
        topicsIdentified: analysis.allTopics.length + 1,
      },
      notifications: {
        sent: successfulNotifications.length,
        channels: successfulNotifications.map(r => r.channel),
      },
      processingTime: `${duration}ms`,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`[BlogResearcher] Error after ${duration}ms:`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: `${duration}ms`,
    }, { status: 500 });
  }
}

// POST endpoint for manual trigger
export async function POST(request: NextRequest) {
  // Allow manual trigger with same logic
  return GET(request);
}
