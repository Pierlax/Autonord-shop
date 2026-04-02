/**
 * TAYA Director - Central Orchestrator
 * 
 * The brain that coordinates all AI agents:
 * - Supervisor: Evaluates content quality
 * - Strategist: Plans editorial content
 * - Orchestrator: Coordinates agents via QStash
 * 
 * Usage:
 * ```typescript
 * import { runDirector } from '@/lib/taya-director';
 * const session = await runDirector();
 * ```
 */

// Export types
export * from './types';

// Export modules
export {
  evaluateProductQuality,
  evaluateProducts,
  generateReEnrichmentPrompt,
  needsEvaluation,
  getEvaluationStats,
} from './supervisor';

export {
  analyzeContentGaps,
  generateEditorialPlan,
  getEditorialPlanSummary,
} from './strategist';

export {
  queueProductReEnrichment,
  queueArticleCommission,
  queueBulkEnrichment,
  executeOrchestration,
  createSession,
  completeSession,
  getSessionSummary,
} from './orchestrator';

// CLaRa-inspired Verifier module
export {
  verifyContent,
  checkFactCoverage,
  checkFactualConsistency,
  regenerateWithFeedback,
  verifyAndRegenerateLoop,
} from './verifier';

// Import for main runner
import { evaluateProducts, getEvaluationStats } from './supervisor';
import { loggers } from '@/lib/logger';

const log = loggers.taya;
import { generateEditorialPlan, getEditorialPlanSummary } from './strategist';
import { 
  executeOrchestration, 
  createSession, 
  completeSession, 
  getSessionSummary 
} from './orchestrator';
import { 
  DirectorSession, 
  DirectorConfig, 
  DEFAULT_CONFIG,
  DirectorProduct,
  DirectorArticle,
} from './types';

/**
 * Fetch products from Shopify for evaluation
 */
async function fetchProductsForEvaluation(): Promise<DirectorProduct[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    log.warn('Shopify credentials not configured');
    return [];
  }

  try {
    // Fetch recently updated products
    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products.json?limit=50&updated_at_min=${getYesterdayISO()}`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.products.map((p: any) => ({
      id: String(p.id),
      handle: p.handle,
      title: p.title,
      productType: p.product_type,
      vendor: p.vendor,
      tags: p.tags ? p.tags.split(', ') : [],
      bodyHtml: p.body_html || '',
      hasAiEnhanced: p.tags?.includes('AI-Enhanced') || false,
      metafields: {
        // Would need additional API call to fetch metafields
        // For now, we'll check based on body_html content
      },
      updatedAt: p.updated_at,
    }));

  } catch (error) {
    log.error('Error fetching products:', error);
    return [];
  }
}

/**
 * Fetch blog articles from Shopify
 */
async function fetchBlogArticles(): Promise<DirectorArticle[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    log.warn('Shopify credentials not configured');
    return [];
  }

  try {
    // First get the blog ID
    const blogsResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/blogs.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!blogsResponse.ok) {
      throw new Error(`Shopify API error: ${blogsResponse.status}`);
    }

    const blogsData = await blogsResponse.json();
    
    if (!blogsData.blogs?.length) {
      return [];
    }

    const blogId = blogsData.blogs[0].id;

    // Fetch articles
    const articlesResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/blogs/${blogId}/articles.json?limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!articlesResponse.ok) {
      throw new Error(`Shopify API error: ${articlesResponse.status}`);
    }

    const articlesData = await articlesResponse.json();

    return articlesData.articles.map((a: any) => ({
      id: String(a.id),
      handle: a.handle,
      title: a.title,
      category: a.tags?.split(', ')[0] || 'Generale',
      publishedAt: a.published_at,
      tags: a.tags ? a.tags.split(', ') : [],
    }));

  } catch (error) {
    log.error('Error fetching articles:', error);
    return [];
  }
}

/**
 * Get yesterday's date in ISO format
 */
function getYesterdayISO(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString();
}

/**
 * Main entry point - Run the TAYA Director
 */
export async function runDirector(
  config: DirectorConfig = DEFAULT_CONFIG
): Promise<DirectorSession> {
  log.info('\n');
  log.info('╔════════════════════════════════════════════════════════════╗');
  log.info('║           🎭 TAYA DIRECTOR - STARTING SESSION              ║');
  log.info('╚════════════════════════════════════════════════════════════╝');
  log.info('\n');

  const session = createSession();

  try {
    // Phase 1: Fetch data
    log.info('📥 Fetching data from Shopify...');
    const [products, articles] = await Promise.all([
      fetchProductsForEvaluation(),
      fetchBlogArticles(),
    ]);
    log.info(`   Found ${products.length} products, ${articles.length} articles`);

    // Phase 2: Supervisor - Evaluate content quality
    if (config.modules.supervisor && products.length > 0) {
      log.info('\n👁️ SUPERVISOR: Evaluating content quality...');
      
      const aiEnhancedProducts = products.filter(p => p.hasAiEnhanced);
      log.info(`   ${aiEnhancedProducts.length} AI-enhanced products to evaluate`);

      if (aiEnhancedProducts.length > 0) {
        const evaluations = await evaluateProducts(aiEnhancedProducts, config);
        
        session.productsEvaluated = evaluations.length;
        session.productsPassed = evaluations.filter(e => e.passed).length;
        session.productsFailed = evaluations.filter(e => !e.passed).length;

        const stats = getEvaluationStats(evaluations);
        log.info(`   Results: ${stats.passed} passed, ${stats.failed} failed (avg score: ${stats.averageScore})`);

        // Store failed evaluations for orchestration
        const failedEvaluations = evaluations.filter(e => !e.passed);

        // Phase 3: Strategist - Generate editorial plan
        if (config.modules.strategist) {
          log.info('\n📋 STRATEGIST: Generating editorial plan...');
          const editorialPlan = await generateEditorialPlan(products, articles);
          log.info(getEditorialPlanSummary(editorialPlan));

          // Phase 4: Orchestrator - Execute decisions
          log.info('\n🎯 ORCHESTRATOR: Executing decisions...');
          await executeOrchestration(
            failedEvaluations,
            editorialPlan,
            session,
            config.rateLimits
          );
        }
      }
    }

  } catch (error) {
    session.errors.push({
      timestamp: new Date().toISOString(),
      phase: 'orchestrator',
      message: `Director error: ${error}`,
    });
    log.error('❌ Director error:', error);
  }

  // Complete session
  completeSession(session);
  log.info(getSessionSummary(session));

  return session;
}
