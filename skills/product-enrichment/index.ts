/**
 * Product Enrichment Skill
 * 
 * The core skill of the Autonord platform. Orchestrates the full
 * product enrichment pipeline:
 * 
 * 1. UniversalRAG — Search verified info from whitelisted sources
 * 2. RagAdapter — Transform RAG output for TwoPhaseQA
 * 3. TwoPhaseQA — Generate specs and pro/con based on facts
 * 4. AI Enrichment V3 — Generate full product content
 * 5. Content Validation (TAYA Police) — Validate and correct
 * 6. Image Search — Find product image
 * 7. Save to Shopify — Update product with HTML + Metafields + Image
 * 
 * Triggers: webhook (Shopify product create/update), cron, manual
 */

import { createLogger } from '@/lib/logger';
import type {
  AgentSkill,
  SkillContext,
  SkillResult,
  SkillMetadata,
  SkillHealthStatus,
} from '@/lib/skills/types';

// Pipeline imports
import { UniversalRAGPipeline, type UniversalRAGResult } from '@/lib/shopify/universal-rag';
import { adaptRagToQa, type AdaptationResult } from '@/lib/shopify/rag-adapter';
import { runTwoPhaseQA, twoPhaseQAToProductContent, type TwoPhaseQAResult } from '@/lib/shopify/two-phase-qa';
import { generateProductContentV3, formatDescriptionAsHtmlV3, type EnrichedProductDataV3 } from '@/lib/shopify/ai-enrichment-v3';
import { type ShopifyProductWebhookPayload, type ShopifyVariant } from '@/lib/shopify/webhook-types';
import { validateAndCorrect } from '@/lib/agents/taya-police';
import { findProductImage, type ImageAgentV4Result } from '@/lib/agents/image-agent-v4';
import { env, toShopifyGid } from '@/lib/env';
import { generateTextSafe } from '@/lib/shopify/ai-client';

const log = createLogger('skill:product-enrichment');

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
  name: 'product-enrichment',
  description: 'Full product enrichment pipeline: RAG research, TwoPhaseQA, AI content generation, TAYA validation, image search, and Shopify update. The core skill of the Autonord platform.',
  version: '5.0.0',
  author: 'Autonord Team',
  tags: ['product', 'enrichment', 'rag', 'shopify', 'ai', 'core'],
  triggers: ['webhook', 'cron', 'manual'],
  maxDurationSeconds: 300,
};

// =============================================================================
// PAYLOAD TYPE
// =============================================================================

interface ProductEnrichmentPayload {
  productId: string;
  title: string;
  vendor: string;
  productType: string;
  sku: string | null;
  barcode: string | null;
  tags: string[];
  productGid?: string;
  price?: string;
  hasImages?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const METAFIELD_NAMESPACE = 'taya';

// =============================================================================
// HELPERS
// =============================================================================

function sanitizeHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

function toWebhookPayload(payload: ProductEnrichmentPayload): ShopifyProductWebhookPayload {
  const variants: ShopifyVariant[] = payload.sku ? [{
    id: 0,
    product_id: parseInt(payload.productId.replace(/\D/g, '')) || 0,
    title: 'Default',
    price: payload.price || '0.00',
    sku: payload.sku,
    position: 1,
    inventory_policy: 'deny',
    compare_at_price: null,
    fulfillment_service: 'manual',
    inventory_management: null,
    option1: null,
    option2: null,
    option3: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    taxable: true,
    barcode: payload.barcode || null,
    grams: 0,
    weight: 0,
    weight_unit: 'kg',
    inventory_item_id: 0,
    inventory_quantity: 0,
    old_inventory_quantity: 0,
    requires_shipping: true,
    admin_graphql_api_id: '',
  }] : [];

  return {
    id: parseInt(payload.productId.replace(/\D/g, '')) || 0,
    title: payload.title,
    body_html: null,
    vendor: payload.vendor,
    product_type: payload.productType || '',
    created_at: new Date().toISOString(),
    handle: sanitizeHandle(payload.title),
    updated_at: new Date().toISOString(),
    published_at: null,
    template_suffix: null,
    published_scope: 'web',
    tags: payload.tags?.join(', ') || '',
    status: 'active',
    admin_graphql_api_id: '',
    variants,
    options: [],
    images: [],
    image: null,
  };
}

// =============================================================================
// SHOPIFY UPDATE (extracted from worker)
// =============================================================================

async function updateShopifyProduct(
  productGid: string,
  enrichedData: EnrichedProductDataV3,
  validatedContent: any,
  imageResult: ImageAgentV4Result,
  qaSpecs?: Record<string, string>,
  qaVerdict?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const finalData: EnrichedProductDataV3 = {
      ...enrichedData,
      description: validatedContent.description || enrichedData.description,
      pros: validatedContent.pros || enrichedData.pros,
      cons: validatedContent.cons || enrichedData.cons,
      faqs: validatedContent.faqs || enrichedData.faqs,
    };

    const html = formatDescriptionAsHtmlV3(finalData);

    // Build metafields
    const metafields: Array<{ namespace: string; key: string; value: string; type: string }> = [
      { namespace: METAFIELD_NAMESPACE, key: 'pros', value: JSON.stringify(finalData.pros), type: 'json' },
      { namespace: METAFIELD_NAMESPACE, key: 'cons', value: JSON.stringify(finalData.cons), type: 'json' },
      { namespace: METAFIELD_NAMESPACE, key: 'faqs', value: JSON.stringify(finalData.faqs), type: 'json' },
      { namespace: METAFIELD_NAMESPACE, key: 'accessories', value: JSON.stringify(finalData.accessories), type: 'json' },
      { namespace: METAFIELD_NAMESPACE, key: 'provenance', value: JSON.stringify(finalData.provenance), type: 'json' },
      { namespace: METAFIELD_NAMESPACE, key: 'enriched_at', value: new Date().toISOString(), type: 'single_line_text_field' },
      { namespace: METAFIELD_NAMESPACE, key: 'version', value: 'v5-skill', type: 'single_line_text_field' },
    ];

    if (qaSpecs) {
      metafields.push({ namespace: METAFIELD_NAMESPACE, key: 'specs', value: JSON.stringify(qaSpecs), type: 'json' });
    }
    if (qaVerdict) {
      metafields.push({ namespace: METAFIELD_NAMESPACE, key: 'verdict', value: qaVerdict, type: 'single_line_text_field' });
    }

    // GraphQL mutation
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        id: productGid,
        descriptionHtml: html,
        metafields,
      },
    };

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );

    const json = await response.json();
    if (json.data?.productUpdate?.userErrors?.length > 0) {
      return { success: false, error: json.data.productUpdate.userErrors[0].message };
    }

    // Upload image if found
    if (imageResult.success && imageResult.imageUrl) {
      await uploadProductImage(productGid, imageResult.imageUrl, imageResult.imageAlt || '');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function uploadProductImage(productGid: string, imageUrl: string, altText: string): Promise<void> {
  try {
    const mutation = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { alt }
          mediaUserErrors { field message }
        }
      }
    `;

    await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            productId: productGid,
            media: [{ alt: altText, mediaContentType: 'IMAGE', originalSource: imageUrl }],
          },
        }),
      }
    );
  } catch (error) {
    log.warn(`Failed to upload image for ${productGid}: ${error}`);
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function execute(context: SkillContext): Promise<SkillResult> {
  const startMs = Date.now();
  totalExecutions++;

  try {
    const payload = context.payload as unknown as ProductEnrichmentPayload;
    const productGid = toShopifyGid(payload.productId, 'Product');

    log.info(`Starting enrichment for "${payload.title}" [${context.executionId}]`, {
      productId: payload.productId,
      vendor: payload.vendor,
      sku: payload.sku,
    });

    // =========================================================================
    // STEP 1: UniversalRAG — Research
    // =========================================================================
    log.info('Step 1: Running UniversalRAG...');
    const ragPipeline = new UniversalRAGPipeline();
    const ragResult: UniversalRAGResult = await ragPipeline.enrichProduct(
      payload.title,
      payload.vendor,
      payload.productType || '',
      payload.sku || '',
      'full'
    );

    // =========================================================================
    // STEP 2: RagAdapter — Transform for QA
    // =========================================================================
    log.info('Step 2: Running RagAdapter...');
    const adaptation: AdaptationResult = adaptRagToQa(
      ragResult,
      payload.title,
      payload.vendor,
      payload.sku || '',
      payload.productType || ''
    );

    // =========================================================================
    // STEP 3: TwoPhaseQA — Fact extraction and reasoning
    // =========================================================================
    let qaResult: TwoPhaseQAResult | null = null;
    let qaContent: { pros: string[]; cons: string[]; specs: Record<string, string>; verdict: string } | null = null;

    if ((adaptation.qaInput?.sourceData?.length ?? 0) > 100) {
      log.info('Step 3: Running TwoPhaseQA...');
      try {
        qaResult = await runTwoPhaseQA(adaptation.qaInput);
        qaContent = twoPhaseQAToProductContent(qaResult);
      } catch (error) {
        log.warn(`TwoPhaseQA failed (non-fatal): ${error}`);
      }
    } else {
      log.info('Step 3: Skipping TwoPhaseQA (insufficient data)');
    }

    // =========================================================================
    // STEP 4: AI Enrichment V3 — Full content generation
    // =========================================================================
    log.info('Step 4: Generating V3 content...');
    const webhookPayload = toWebhookPayload(payload);
    const enrichedData = await generateProductContentV3(webhookPayload, ragResult, qaResult);

    // =========================================================================
    // STEP 5: TAYA Police — Content validation
    // =========================================================================
    log.info('Step 5: Running TAYA Police validation...');
    const prosToValidate = qaContent
      ? [...qaContent.pros, ...enrichedData.pros.filter(p => !qaContent!.pros.some(qp => qp.includes(p.substring(0, 20))))]
      : enrichedData.pros;
    const consToValidate = qaContent
      ? [...qaContent.cons, ...enrichedData.cons.filter(c => !qaContent!.cons.some(qc => qc.includes(c.substring(0, 20))))]
      : enrichedData.cons;

    const validationResult = await validateAndCorrect({
      description: enrichedData.description,
      pros: prosToValidate,
      cons: consToValidate,
      faqs: enrichedData.faqs,
    });

    if (validationResult.wasFixed) {
      log.info(`Fixed ${validationResult.violations.length} TAYA violations`);
    }

    // =========================================================================
    // STEP 6: ImageAgent V4 — Find product image
    // =========================================================================
    log.info('Step 6: Running ImageAgent V4...');
    const imageResult = await findProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );

    // =========================================================================
    // STEP 7: Save to Shopify
    // =========================================================================
    log.info('Step 7: Updating Shopify...');
    const updateResult = await updateShopifyProduct(
      productGid,
      enrichedData,
      validationResult.content,
      imageResult,
      qaContent?.specs,
      qaContent?.verdict
    );

    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;
    lastExecutedAt = new Date().toISOString();

    if (!updateResult.success) {
      lastResult = 'failed';
      return {
        success: false,
        status: 'failed',
        message: `Shopify update failed: ${updateResult.error}`,
        error: updateResult.error,
        durationMs,
      };
    }

    lastResult = 'success';
    return {
      success: true,
      status: 'success',
      message: `Product "${payload.title}" enriched successfully (V5-Skill)`,
      data: {
        version: 'V5-Skill',
        ragSuccess: ragResult.success,
        ragSourcesQueried: ragResult.metadata.sourcesQueried.length,
        qaVerifiedFacts: qaResult?.simpleQA.rawFacts.filter(f => f.verified).length || 0,
        v3Confidence: enrichedData.provenance.overallConfidence,
        hasImage: imageResult.success,
        imageSource: imageResult.source,
        tayaViolationsFixed: validationResult.violations.length,
        prosCount: validationResult.content.pros.length,
        consCount: validationResult.content.cons.length,
        faqsCount: validationResult.content.faqs.length,
      },
      durationMs,
    };
  } catch (error) {
    totalErrors++;
    lastResult = 'failed';
    const durationMs = Date.now() - startMs;
    totalDurationMs += durationMs;

    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Product enrichment failed [${context.executionId}]: ${errorMsg}`, error);

    return {
      success: false,
      status: 'failed',
      message: 'Product enrichment pipeline failed',
      error: errorMsg,
      durationMs,
    };
  }
}

async function validate(context: SkillContext): Promise<string | null> {
  if (!context.payload) {
    return 'Payload is required with product data';
  }
  const payload = context.payload as Record<string, unknown>;
  if (!payload.productId) return 'Missing productId';
  if (!payload.title || typeof payload.title !== 'string') return 'Missing or invalid title';
  if (!payload.vendor || typeof payload.vendor !== 'string') return 'Missing or invalid vendor';
  return null;
}

function getStatus(): SkillHealthStatus {
  return {
    state: totalErrors > totalExecutions * 0.3 ? 'degraded' : 'healthy',
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

export const productEnrichmentSkill: AgentSkill = {
  metadata,
  execute,
  validate,
  getStatus,
};
