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
import { searchForTopics } from '@/lib/blog-researcher/search';
import { analyzeTopics } from '@/lib/blog-researcher/analysis';
import { generateArticleDraft, formatForShopify } from '@/lib/blog-researcher/drafting';
import { createDraftArticle } from '@/lib/blog-researcher/shopify-blog';
import { sendNotification } from '@/lib/blog-researcher/notifications';
import { leaveNoteForProductAgent, shareCategoryGuideline } from '@/lib/agent-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 5 minutes max for cron job

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
    
    // Step 4.5: Share insights with Product Agent via AgeMem
    log.info('[BlogResearcher] Step 4.5: Sharing insights with Product Agent via AgeMem...');
    shareInsightsWithProductAgent(analysis.selectedTopic, articleDraft.tags);

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

// =============================================================================
// HELPER — condivide gli insight del blog con il Product Agent via AgeMem
// =============================================================================

/**
 * Estrae brand e categorie dai tag dell'articolo e lascia note per il Product Agent.
 * Viene chiamata dopo ogni articolo generato con successo.
 */
function shareInsightsWithProductAgent(
  topic: { topic: string; painPoint: string; tayaCategory: string; emotionalHook: string },
  tags: string[]
): void {
  try {
    // Nomi di brand comuni nel settore utensili — usati per riconoscere tag brand
    const knownBrands = [
      'milwaukee', 'makita', 'dewalt', 'bosch', 'hikoki', 'metabo',
      'festool', 'hilti', 'flex', 'ryobi', 'stanley', 'fein',
    ];

    const detectedBrands = tags
      .map(t => t.toLowerCase())
      .filter(t => knownBrands.includes(t))
      .map(t => t.charAt(0).toUpperCase() + t.slice(1));

    // Se l'articolo tratta problemi noti di un brand, segnalalo al Product Agent
    if (topic.tayaCategory === 'problems' && detectedBrands.length > 0) {
      leaveNoteForProductAgent({
        title: `Problema noto discusso nel blog: ${topic.topic}`,
        content: `Il Blog Agent ha scritto un articolo sul problema: "${topic.painPoint}". ` +
                 `Emotional hook: "${topic.emotionalHook}". ` +
                 `Considera di menzionare questo punto nelle descrizioni dei prodotti relativi.`,
        targetBrands: detectedBrands,
        priority: 'medium',
      });
      log.info(`[BlogResearcher] Shared problem insight for brands: ${detectedBrands.join(', ')}`);
    }

    // Se l'articolo è un confronto, segnala i brand coinvolti
    if (topic.tayaCategory === 'comparisons' && detectedBrands.length >= 2) {
      leaveNoteForProductAgent({
        title: `Confronto brand nel blog: ${topic.topic}`,
        content: `Il Blog Agent ha scritto un articolo di confronto tra brand. ` +
                 `Nelle descrizioni prodotto, evita di ripetere gli stessi confronti in modo da non creare contraddizioni con il blog.`,
        targetBrands: detectedBrands,
        priority: 'low',
      });
      log.info(`[BlogResearcher] Shared comparison note for brands: ${detectedBrands.join(', ')}`);
    }

    // Condivide insight di categoria se i tag includono categorie prodotto
    const categoryKeywords = ['trapani', 'avvitatori', 'smerigliatrici', 'seghe', 'levigatrici', 'martelli', 'utensili'];
    const detectedCategories = tags.filter(t =>
      categoryKeywords.some(kw => t.toLowerCase().includes(kw))
    );

    if (detectedCategories.length > 0 && topic.painPoint) {
      shareCategoryGuideline({
        category: detectedCategories[0],
        guidelineType: 'pain_points',
        content: `Il Blog Agent ha identificato questo pain point nella categoria "${detectedCategories[0]}": "${topic.painPoint}". ` +
                 `Nelle descrizioni prodotto, assicurati di rispondere a questa preoccupazione.`,
        priority: 'low',
      });
      log.info(`[BlogResearcher] Shared category insight for: ${detectedCategories.join(', ')}`);
    }

    if (detectedBrands.length === 0 && detectedCategories.length === 0) {
      // Nessun brand o categoria rilevata — lascia una nota generica solo per argomenti importanti
      if (topic.tayaCategory === 'problems') {
        leaveNoteForProductAgent({
          title: `Pain point dal blog: ${topic.topic}`,
          content: `Il Blog Agent ha identificato questo problema ricorrente tra i clienti: "${topic.painPoint}". ` +
                   `Considera di affrontare questo punto nelle descrizioni prodotto pertinenti.`,
          priority: 'low',
        });
      }
    }
  } catch (error) {
    // Non far fallire il job se la condivisione memoria fallisce
    log.warn('[BlogResearcher] Could not share insights with Product Agent:', error);
  }
}
