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
import { env } from '@/lib/env';

const log = loggers.blog;
import { searchForTopics } from '@/lib/blog-researcher/search';
import { analyzeTopics } from '@/lib/blog-researcher/analysis';
import { generateArticleDraft, formatForShopify } from '@/lib/blog-researcher/drafting';
import { createDraftArticle } from '@/lib/blog-researcher/shopify-blog';
import { sendNotification } from '@/lib/blog-researcher/notifications';
import { leaveNoteForProductAgent, shareCategoryGuideline } from '@/lib/agent-memory';
import { discoverBlogSources } from '@/lib/blog-researcher/rag-bridge';
import { generateArticleBrief, generateBriefedArticle } from '@/lib/blog-researcher/blog-brief';
import { clusterTopics, pickBestCluster } from '@/lib/blog-researcher/topic-clusterer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 5 minutes max for cron job

/**
 * Verify the request is from Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = env.CRON_SECRET;
  
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Security] Dev bypass active — auth skipped (NODE_ENV=development)');
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

    // Step 2.5: Cluster topics to avoid keyword cannibalization
    log.info('[BlogResearcher] Step 2.5: Clustering topics...');
    let selectedTopic = analysis.selectedTopic;
    let bestCluster: import('@/lib/blog-researcher/topic-clusterer').TopicCluster | null = null;
    try {
      // Normalizza: filtra topic nulli e samplePosts undefined/null
      const rawTopics = [analysis.selectedTopic, ...(analysis.allTopics ?? [])].filter(Boolean);
      const safeTopics = rawTopics.map(t => ({
        ...t,
        samplePosts: Array.isArray(t.samplePosts) ? t.samplePosts.filter((p): p is string => typeof p === 'string') : [],
      }));
      const clusters = clusterTopics(safeTopics);
      bestCluster = pickBestCluster(clusters);
      if (bestCluster?.representativeTopic) selectedTopic = bestCluster.representativeTopic;
      log.info(`[BlogResearcher] Clusters: ${clusters.length} | Best: "${bestCluster?.clusterLabel ?? 'none'}" (score=${bestCluster?.editorialScore ?? 0})`);
      if (selectedTopic.topic !== analysis.selectedTopic.topic) {
        log.info(`[BlogResearcher] Clusterer overrode LLM pick: "${analysis.selectedTopic.topic}" → "${selectedTopic.topic}"`);
      }
    } catch (clusterErr) {
      log.warn('[BlogResearcher] Step 2.5 clustering failed, using LLM selection:', clusterErr);
    }

    // Step 3: RAG Bridge — deep discovery on selected topic
    log.info('[BlogResearcher] Step 3: RAG Bridge discovery...');
    const topicSignal = {
      topic: selectedTopic.topic,
      painPoint: selectedTopic.painPoint,
      brands: extractBrandsFromTags([
        ...searchResults.slice(0, 5).map(r => r.title),
        selectedTopic.topic,
        ...(bestCluster?.topBrands ?? []),
      ]),
      tayaCategory: selectedTopic.tayaCategory,
    };
    const discovery = await discoverBlogSources(topicSignal);
    log.info(`[BlogResearcher] RAG Bridge: ${discovery.sources.length} sources | ${discovery.executionTimeMs}ms`);

    // Step 3.5: Generate editorial brief from RAG corpus
    log.info('[BlogResearcher] Step 3.5: Generating editorial brief...');
    const brief = await generateArticleBrief(selectedTopic, discovery);
    log.info(`[BlogResearcher] Brief: "${brief.recommendedTitle}" | confidence: ${brief.confidence}`);

    // Step 4: Generate article from brief (RAG-informed drafting)
    log.info('[BlogResearcher] Step 4: Drafting article from brief...');
    let articleTitle: string;
    let articleSlug: string;
    let articleContent: string;
    let articleTags: string[];
    let articleCategory: string;
    let articleReadTime: number;
    let shopifyArticle: { id: number };

    try {
      const briefedArticle = await generateBriefedArticle(brief);
      articleTitle = briefedArticle.titleIT || briefedArticle.title;
      articleSlug = briefedArticle.slug;
      articleContent = briefedArticle.htmlContent;
      articleTags = briefedArticle.tags;
      articleCategory = briefedArticle.category;
      articleReadTime = briefedArticle.estimatedReadTime;
      log.info(`[BlogResearcher] Briefed article: "${articleTitle}" | ~${briefedArticle.estimatedReadTime}min`);

      // Publish to Shopify using existing createDraftArticle with compatible shape
      const draftCompat = {
        title: articleTitle,
        slug: articleSlug,
        content: articleContent,
        excerpt: briefedArticle.excerpt,
        metaDescription: briefedArticle.metaDescription,
        tags: articleTags,
        category: articleCategory,
        estimatedReadTime: articleReadTime,
      };
      shopifyArticle = await createDraftArticle(draftCompat as Parameters<typeof createDraftArticle>[0]);
    } catch (briefError) {
      // Graceful degradation: fall back to classic drafting
      log.warn('[BlogResearcher] Briefed drafting failed, falling back to classic drafting:', briefError);
      const articleDraft = await generateArticleDraft(selectedTopic);
      articleDraft.content = formatForShopify(articleDraft);
      articleTitle = articleDraft.title;
      articleSlug = articleDraft.slug;
      articleContent = articleDraft.content;
      articleTags = articleDraft.tags;
      articleCategory = articleDraft.category;
      articleReadTime = articleDraft.estimatedReadTime;
      shopifyArticle = await createDraftArticle(articleDraft);
    }

    log.info(`[BlogResearcher] Word count: ~${articleContent.replace(/<[^>]+>/g, ' ').split(/\s+/).length}`);
    
    log.info(`[BlogResearcher] Created draft article ID: ${shopifyArticle.id}`);

    // Step 4.5: Share insights with Product Agent via AgeMem
    log.info('[BlogResearcher] Step 4.5: Sharing insights with Product Agent via AgeMem...');
    await shareInsightsWithProductAgent(selectedTopic, articleTags);

    // Step 5: Send notification — build a compatible notification shape
    log.info('[BlogResearcher] Step 5: Sending notifications...');
    const notifShape = {
      title: articleTitle,
      slug: articleSlug,
      content: articleContent,
      tags: articleTags,
      category: articleCategory,
      estimatedReadTime: articleReadTime,
      excerpt: brief.painPoint,
      metaDescription: brief.articleAngle,
    };
    const notificationResults = await sendNotification(
      notifShape as Parameters<typeof sendNotification>[0],
      shopifyArticle.id
    );
    
    const successfulNotifications = notificationResults.filter(r => r.success);
    log.info(`[BlogResearcher] Sent ${successfulNotifications.length} notifications`);
    
    const duration = Date.now() - startTime;
    log.info(`[BlogResearcher] Completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      article: {
        id: shopifyArticle.id,
        title: articleTitle,
        slug: articleSlug,
        category: articleCategory,
        readTime: articleReadTime,
        tags: articleTags,
      },
      brief: {
        recommendedTitle: brief.recommendedTitle,
        articleAngle: brief.articleAngle,
        confidence: brief.confidence,
        outline: brief.outline.map(s => s.sectionTitle),
        seoKeywords: brief.seoKeywords,
      },
      ragBridge: {
        sourcesFound: discovery.sources.length,
        corpusItems: discovery.corpusCollection.totalItems,
        quality: discovery.evaluation.qualityScore.toFixed(2),
        secondPassRan: discovery.secondPassRan,
        // Layer 5 routing buckets
        routed: {
          forumVoices:      discovery.routed.forum_voices?.length ?? 0,
          expertValidation: discovery.routed.expert_validation?.length ?? 0,
          editorialAngle:   discovery.routed.editorial_angle?.length ?? 0,
          officialClaims:   discovery.routed.official_claim?.length ?? 0,
        },
        // Layer 7 evidence graph
        evidenceGraph: {
          nodes:     discovery.evidenceGraphSummary.nodeCount,
          edges:     discovery.evidenceGraphSummary.edgeCount,
          reviews:   discovery.evidenceGraphSummary.reviewCount,
          conflicts: discovery.evidenceGraphSummary.conflictCount,
        },
        gaps: discovery.evaluation.gaps,
        executionTimeMs: discovery.executionTimeMs,
      },
      topic: {
        name: selectedTopic.topic,
        painPoint: selectedTopic.painPoint,
        tayaCategory: selectedTopic.tayaCategory,
        clusterLabel: bestCluster?.clusterLabel,
        clusterScore: bestCluster?.editorialScore,
        relatedTopicsCount: bestCluster?.relatedTopics.length ?? 0,
        topBrands: bestCluster?.topBrands ?? [],
        searchVolume: bestCluster?.estimatedSearchVolume,
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
async function shareInsightsWithProductAgent(
  topic: { topic: string; painPoint: string; tayaCategory: string; emotionalHook: string },
  tags: string[]
): Promise<void> {
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
      await leaveNoteForProductAgent({
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
      await leaveNoteForProductAgent({
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
      await shareCategoryGuideline({
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
        await leaveNoteForProductAgent({
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

// =============================================================================
// HELPER — estrae brand riconosciuti dai titoli dei post
// =============================================================================

const KNOWN_BRANDS_LOWER = [
  'milwaukee', 'makita', 'dewalt', 'bosch', 'hikoki', 'metabo',
  'festool', 'hilti', 'flex', 'ryobi', 'stanley', 'fein',
  'yanmar', 'komatsu', 'kubota', 'doosan', 'honda', 'sdmo',
];

function extractBrandsFromTags(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase();
  return KNOWN_BRANDS_LOWER
    .filter(b => combined.includes(b))
    .map(b => b.charAt(0).toUpperCase() + b.slice(1));
}
