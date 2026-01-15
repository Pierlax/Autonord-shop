/**
 * TAYA Director - Orchestrator Module (The Coordinator)
 * 
 * Coordinates all AI agents via QStash:
 * - Queues product re-enrichment jobs
 * - Commissions blog articles
 * - Manages rate limits
 * - Logs all decisions
 */

import { Client } from '@upstash/qstash';
import {
  DirectorDecision,
  DirectorAction,
  DirectorSession,
  DirectorError,
  QualityEvaluation,
  ContentGap,
  EditorialPlan,
  RateLimits,
  DEFAULT_RATE_LIMITS,
} from './types';
import { generateReEnrichmentPrompt } from './supervisor';

// Initialize QStash client
function getQStashClient(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error('QSTASH_TOKEN not configured');
  }
  return new Client({ token });
}

// Get base URL for the app
function getBaseUrl(): string {
  return process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

/**
 * Queue a product for re-enrichment with stricter prompt
 */
export async function queueProductReEnrichment(
  evaluation: QualityEvaluation,
  session: DirectorSession
): Promise<DirectorDecision> {
  const decision: DirectorDecision = {
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action: {
      type: 're_enrich_product',
      productId: evaluation.productId,
      reason: `Quality score ${evaluation.score.overall}/100 below threshold`,
      previousScore: evaluation.score.overall,
    },
    priority: evaluation.score.overall < 50 ? 1 : 2,
    estimatedImpact: evaluation.score.overall < 50 ? 'high' : 'medium',
    status: 'pending',
  };

  try {
    const qstash = getQStashClient();
    const baseUrl = getBaseUrl();

    // Generate stricter prompt for re-enrichment
    const stricterPrompt = generateReEnrichmentPrompt(evaluation);

    // Queue the job
    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/workers/enrich-product`,
      body: {
        productId: evaluation.productId,
        productHandle: evaluation.productHandle,
        forceReEnrich: true,
        additionalInstructions: stricterPrompt,
        directorSessionId: session.sessionId,
      },
      retries: 2,
      delay: '30s', // Small delay to avoid overwhelming
    });

    decision.status = 'queued';
    decision.qstashMessageId = result.messageId;

    console.log(`✅ Queued re-enrichment for ${evaluation.productHandle} (score: ${evaluation.score.overall})`);

  } catch (error) {
    decision.status = 'failed';
    session.errors.push({
      timestamp: new Date().toISOString(),
      phase: 'orchestrator',
      message: `Failed to queue re-enrichment: ${error}`,
      context: { productId: evaluation.productId },
    });
    console.error(`❌ Failed to queue re-enrichment for ${evaluation.productHandle}:`, error);
  }

  session.decisions.push(decision);
  return decision;
}

/**
 * Queue a blog article commission
 */
export async function queueArticleCommission(
  gap: ContentGap,
  session: DirectorSession
): Promise<DirectorDecision> {
  const decision: DirectorDecision = {
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action: {
      type: 'commission_article',
      gap,
    },
    priority: gap.priority === 'critical' ? 0 : gap.priority === 'high' ? 1 : 2,
    estimatedImpact: gap.priority === 'critical' || gap.priority === 'high' ? 'high' : 'medium',
    status: 'pending',
  };

  try {
    const qstash = getQStashClient();
    const baseUrl = getBaseUrl();

    // Queue the blog researcher with specific topic
    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/cron/blog-researcher`,
      body: {
        mode: 'commissioned',
        topic: gap.suggestedArticleTitle,
        articleType: gap.suggestedArticleType,
        context: gap.description,
        directorSessionId: session.sessionId,
      },
      retries: 2,
      delay: '1m', // Delay to spread out API calls
    });

    decision.status = 'queued';
    decision.qstashMessageId = result.messageId;

    console.log(`✅ Commissioned article: "${gap.suggestedArticleTitle}"`);

  } catch (error) {
    decision.status = 'failed';
    session.errors.push({
      timestamp: new Date().toISOString(),
      phase: 'orchestrator',
      message: `Failed to commission article: ${error}`,
      context: { gap },
    });
    console.error(`❌ Failed to commission article:`, error);
  }

  session.decisions.push(decision);
  return decision;
}

/**
 * Queue multiple products for initial enrichment
 */
export async function queueBulkEnrichment(
  productIds: string[],
  session: DirectorSession,
  limit: number = 10
): Promise<DirectorDecision[]> {
  const decisions: DirectorDecision[] = [];
  const toProcess = productIds.slice(0, limit);

  const qstash = getQStashClient();
  const baseUrl = getBaseUrl();

  for (let i = 0; i < toProcess.length; i++) {
    const productId = toProcess[i];

    const decision: DirectorDecision = {
      id: `decision-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      action: {
        type: 'enrich_product',
        productId,
        reason: 'Product not yet AI-enhanced',
      },
      priority: 2,
      estimatedImpact: 'medium',
      status: 'pending',
    };

    try {
      const result = await qstash.publishJSON({
        url: `${baseUrl}/api/workers/enrich-product`,
        body: {
          productId,
          directorSessionId: session.sessionId,
        },
        retries: 2,
        delay: `${i * 30}s`, // Stagger requests
      });

      decision.status = 'queued';
      decision.qstashMessageId = result.messageId;

    } catch (error) {
      decision.status = 'failed';
      session.errors.push({
        timestamp: new Date().toISOString(),
        phase: 'orchestrator',
        message: `Failed to queue enrichment: ${error}`,
        context: { productId },
      });
    }

    decisions.push(decision);
    session.decisions.push(decision);
  }

  console.log(`✅ Queued ${decisions.filter(d => d.status === 'queued').length}/${toProcess.length} products for enrichment`);

  return decisions;
}

/**
 * Execute the full orchestration based on supervisor results and editorial plan
 */
export async function executeOrchestration(
  failedEvaluations: QualityEvaluation[],
  editorialPlan: EditorialPlan,
  session: DirectorSession,
  rateLimits: RateLimits = DEFAULT_RATE_LIMITS
): Promise<void> {
  console.log('\n🎭 TAYA Director - Orchestration Phase');
  console.log('═'.repeat(50));

  // 1. Queue re-enrichment for failed products (up to daily limit)
  const productsToReEnrich = failedEvaluations.slice(0, rateLimits.maxProductReEnrichmentsPerDay);
  
  if (productsToReEnrich.length > 0) {
    console.log(`\n📦 Re-enriching ${productsToReEnrich.length} products with low quality scores...`);
    
    for (const evaluation of productsToReEnrich) {
      await queueProductReEnrichment(evaluation, session);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // 2. Commission article if we have a high-priority gap
  if (editorialPlan.nextArticleToWrite && 
      (editorialPlan.nextArticleToWrite.priority === 'critical' || 
       editorialPlan.nextArticleToWrite.priority === 'high')) {
    console.log(`\n✍️ Commissioning article: "${editorialPlan.nextArticleToWrite.suggestedArticleTitle}"`);
    await queueArticleCommission(editorialPlan.nextArticleToWrite, session);
    session.articlesCommissioned++;
  }

  // 3. Queue initial enrichment for products without AI content
  const productsToEnrich = editorialPlan.productsNeedingEnrichment.slice(0, 5);
  
  if (productsToEnrich.length > 0) {
    console.log(`\n🆕 Enriching ${productsToEnrich.length} new products...`);
    await queueBulkEnrichment(productsToEnrich, session, 5);
  }

  console.log('\n✅ Orchestration complete');
}

/**
 * Create a new Director session
 */
export function createSession(): DirectorSession {
  return {
    sessionId: `director-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    productsEvaluated: 0,
    productsPassed: 0,
    productsFailed: 0,
    articlesCommissioned: 0,
    codeImprovementsQueued: 0,
    decisions: [],
    errors: [],
  };
}

/**
 * Complete a session and return summary
 */
export function completeSession(session: DirectorSession): DirectorSession {
  session.completedAt = new Date().toISOString();
  return session;
}

/**
 * Get session summary for logging
 */
export function getSessionSummary(session: DirectorSession): string {
  const duration = session.completedAt 
    ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
    : 0;

  const queuedDecisions = session.decisions.filter(d => d.status === 'queued').length;
  const failedDecisions = session.decisions.filter(d => d.status === 'failed').length;

  return `
╔════════════════════════════════════════════════════════════╗
║              TAYA DIRECTOR - SESSION SUMMARY               ║
╠════════════════════════════════════════════════════════════╣
║ Session ID: ${session.sessionId.slice(0, 30).padEnd(30)}       ║
║ Duration: ${String(duration).padEnd(5)}s                                        ║
╠════════════════════════════════════════════════════════════╣
║ SUPERVISOR RESULTS                                         ║
║   Products evaluated: ${String(session.productsEvaluated).padEnd(5)}                            ║
║   Passed: ${String(session.productsPassed).padEnd(5)}                                        ║
║   Failed: ${String(session.productsFailed).padEnd(5)}                                        ║
╠════════════════════════════════════════════════════════════╣
║ ORCHESTRATION                                              ║
║   Decisions made: ${String(session.decisions.length).padEnd(5)}                               ║
║   Jobs queued: ${String(queuedDecisions).padEnd(5)}                                  ║
║   Jobs failed: ${String(failedDecisions).padEnd(5)}                                  ║
║   Articles commissioned: ${String(session.articlesCommissioned).padEnd(5)}                        ║
╠════════════════════════════════════════════════════════════╣
║ ERRORS: ${String(session.errors.length).padEnd(5)}                                          ║
╚════════════════════════════════════════════════════════════╝
`;
}
