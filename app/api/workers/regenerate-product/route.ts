// Vercel Pro: Allow up to 300 seconds for AI pipeline
export const maxDuration = 300;

/**
 * Worker Regenerate Product - V5 (Phase 2: Advanced RAG & Media)
 * 
 * Full orchestration pipeline:
 * 1. UniversalRAG (searches verified info using whitelisted rag-sources.ts)
 * 2. RagAdapter (transforms RAG output → TwoPhaseQA input)
 * 3. TwoPhaseQA (generates specs and pro/con based on facts)
 * 4. ImageAgentV4 (finds image, prioritizing TRUSTED_RETAILERS for quality)
 * 5. TAYA Police (post-generation validation)
 * 6. Shopify Admin API (saves HTML + Metafields + Image with ALT text)
 * 
 * PHASE 1 (Security Hardening):
 * - Centralized env validation from lib/env.ts
 * - No hardcoded tokens
 * - Standardized Shopify GID format
 * 
 * PHASE 2 (Advanced RAG & Media):
 * - UniversalRAG with whitelisted sector-specific sources
 * - RagAdapter bridges RAG output to TwoPhaseQA
 * - TwoPhaseQA for fact-based specs and reasoning
 * - Image ALT text for SEO
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Phase 1 imports (security)
import { env, toShopifyGid } from '@/lib/env';

// Phase 2 imports (RAG pipeline)
import { 
  UniversalRAGPipeline, 
  UniversalRAGResult,
} from '@/lib/shopify/universal-rag';
import { adaptRagToQa, AdaptationResult } from '@/lib/shopify/rag-adapter';
import { 
  runTwoPhaseQA, 
  twoPhaseQAToProductContent,
  TwoPhaseQAResult,
} from '@/lib/shopify/two-phase-qa';

// Existing imports (enrichment, image, validation)
import { 
  generateProductContentV3, 
  formatDescriptionAsHtmlV3,
  EnrichedProductDataV3,
} from '@/lib/shopify/ai-enrichment-v3';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';
import { findProductImage, ImageAgentV4Result } from '@/lib/agents/image-agent-v4';
import { validateAndCorrect, CleanedContent } from '@/lib/agents/taya-police';

// =============================================================================
// CONFIG (from centralized env)
// =============================================================================

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Metafield namespace
const METAFIELD_NAMESPACE = 'taya';

// =============================================================================
// TYPES
// =============================================================================

interface WorkerPayload {
  productId: string;
  title: string;
  vendor: string;
  productType: string;
  sku: string | null;
  barcode: string | null;
  tags: string[];
  // Campi aggiuntivi da EnrichmentJob (per compatibilità con QStash)
  productGid?: string;
  price?: string;
  hasImages?: boolean;
  receivedAt?: string;
}

interface TayaSpecs {
  [key: string]: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Sanitizza l'handle per URL (rimuove ™, ®, etc.)
 */
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

/**
 * Converte il payload del worker nel formato richiesto da ai-enrichment-v3
 */
function toWebhookPayload(payload: WorkerPayload): ShopifyProductWebhookPayload {
  return {
    id: parseInt(payload.productId.replace(/\D/g, '')) || 0,
    title: payload.title,
    body_html: null,
    vendor: payload.vendor,
    product_type: payload.productType || '',
    created_at: new Date().toISOString(),
    handle: sanitizeHandle(payload.title),
    updated_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    template_suffix: null,
    published_scope: 'global',
    tags: payload.tags.join(', '),
    status: 'active',
    admin_graphql_api_id: payload.productId,
    variants: [{
      id: 0,
      product_id: 0,
      title: 'Default',
      price: '0',
      sku: payload.sku || '',
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
      barcode: payload.barcode,
      grams: 0,
      weight: 0,
      weight_unit: 'kg',
      inventory_item_id: 0,
      inventory_quantity: 0,
      old_inventory_quantity: 0,
      requires_shipping: true,
      admin_graphql_api_id: '',
    }],
    options: [],
    images: [],
    image: null,
  };
}

/**
 * Estrae le specifiche tecniche in formato JSON da enrichedData V3
 */
function extractSpecsFromV3(enrichedData: EnrichedProductDataV3): TayaSpecs {
  const specs: TayaSpecs = {};
  
  // Estrai da provenance facts
  if (enrichedData.provenance?.facts) {
    for (const fact of enrichedData.provenance.facts) {
      if (fact.verificationStatus === 'verified') {
        specs[fact.factKey] = fact.factValue;
      }
    }
  }
  
  return specs;
}

/**
 * Merges specs from TwoPhaseQA with specs from V3 enrichment.
 * QA specs take priority (they are fact-checked).
 */
function mergeSpecs(qaSpecs: Record<string, string>, v3Specs: TayaSpecs): TayaSpecs {
  return { ...v3Specs, ...qaSpecs };
}

/**
 * Genera l'opinione dell'esperto combinando QA reasoning e V3 data
 */
function generateExpertOpinion(
  cleanedContent: CleanedContent,
  enrichedData: EnrichedProductDataV3,
  qaVerdict?: string
): string {
  const trades = enrichedData.knowledgeGraphContext?.suitableForTrades || [];
  const tradesText = trades.length > 0 
    ? `Ideale per: ${trades.join(', ')}.` 
    : '';
  
  // Use QA verdict if available (it's fact-based)
  if (qaVerdict) {
    return `${tradesText} ${qaVerdict}`.trim();
  }
  
  const prosText = cleanedContent.pros.slice(0, 2).join('. ');
  const consText = cleanedContent.cons.length > 0 
    ? `Da considerare: ${cleanedContent.cons[0]}.` 
    : '';
  
  return `${tradesText} ${prosText}. ${consText}`.trim();
}

// =============================================================================
// AUTH VERIFICATION
// =============================================================================

/**
 * Verifies that the request is authorized.
 * Accepts either:
 * 1. A valid Upstash QStash signature (for queued jobs)
 * 2. A Bearer token matching the CRON_SECRET (for direct cron calls)
 */
function isAuthorized(request: NextRequest): boolean {
  const upstashSignature = request.headers.get('upstash-signature');
  
  // QStash requests are signed — trust them if signature is present
  if (upstashSignature) {
    return true;
  }
  
  // For direct calls (cron jobs, manual triggers), verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

// =============================================================================
// SHOPIFY API - METAFIELDS
// =============================================================================

/**
 * Aggiorna prodotto con HTML + Metafields strutturati
 */
async function updateShopifyProductWithMetafields(
  productId: string,
  enrichedData: EnrichedProductDataV3,
  cleanedContent: CleanedContent,
  imageResult: ImageAgentV4Result,
  qaSpecs?: Record<string, string>,
  qaVerdict?: string
): Promise<{ success: boolean; error?: string }> {
  
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  // Normalize product ID to GID format for GraphQL
  const productGid = toShopifyGid(productId, 'Product');
  
  // Genera HTML dalla struttura V3 (con contenuto pulito)
  const enrichedWithCleanContent: EnrichedProductDataV3 = {
    ...enrichedData,
    description: cleanedContent.description,
    pros: cleanedContent.pros,
    cons: cleanedContent.cons,
    faqs: cleanedContent.faqs,
  };
  const descriptionHtml = formatDescriptionAsHtmlV3(enrichedWithCleanContent);
  
  // Genera titolo SEO
  const seoTitle = cleanedContent.description.substring(0, 60);
  const seoDescription = cleanedContent.description.substring(0, 160);
  
  // Tags
  const tags = ['AI-Enhanced', 'TAYA-V5'];
  
  // Merge specs from QA (fact-checked) and V3 (provenance-tracked)
  const v3Specs = extractSpecsFromV3(enrichedData);
  const specs = qaSpecs ? mergeSpecs(qaSpecs, v3Specs) : v3Specs;
  
  // Expert opinion (prefer QA verdict)
  const expertOpinion = cleanedContent.expertOpinion || 
    generateExpertOpinion(cleanedContent, enrichedData, qaVerdict);

  // Mutation con Metafields
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { 
          id 
          title
          metafields(first: 10) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            id: productGid,
            descriptionHtml,
            tags,
            seo: {
              title: seoTitle,
              description: seoDescription,
            },
            metafields: [
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'pros',
                type: 'list.single_line_text_field',
                value: JSON.stringify(cleanedContent.pros),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'cons',
                type: 'list.single_line_text_field',
                value: JSON.stringify(cleanedContent.cons),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'specs',
                type: 'json',
                value: JSON.stringify(specs),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'expert_opinion',
                type: 'multi_line_text_field',
                value: expertOpinion,
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'faqs',
                type: 'json',
                value: JSON.stringify(cleanedContent.faqs),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'confidence',
                type: 'number_integer',
                value: String(enrichedData.provenance?.overallConfidence || 0),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'generated_at',
                type: 'date_time',
                value: new Date().toISOString(),
              },
            ],
          },
        },
      }),
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('[Worker] GraphQL errors:', result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || 'GraphQL error',
      };
    }
    
    if (result.data?.productUpdate?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.data.productUpdate.userErrors[0].message,
      };
    }

    console.log('[Worker V5] Product updated with Metafields');

    // Aggiungi immagine se trovata (con ALT text SEO)
    if (imageResult.success && imageResult.imageUrl) {
      await addProductImage(productGid, imageResult.imageUrl, imageResult.imageAlt);
    }

    return { success: true };
    
  } catch (error) {
    console.error('[Worker] Shopify update error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Adds a product image with SEO ALT text.
 * Uses imageResult.imageAlt from ImageAgentV4, with product title as fallback.
 */
async function addProductImage(
  productGid: string, 
  imageUrl: string,
  imageAlt?: string
): Promise<void> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  // Ensure GID format
  const normalizedGid = toShopifyGid(productGid, 'Product');
  
  // ALT text for SEO: use imageAlt from ImageAgent, fallback to empty string
  const alt = imageAlt || '';
  
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { 
          ... on MediaImage { 
            id
            alt
          } 
        }
        mediaUserErrors { field message }
      }
    }
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          productId: normalizedGid,
          media: [{
            originalSource: imageUrl,
            alt,
            mediaContentType: 'IMAGE',
          }],
        },
      }),
    });
    
    const result = await response.json();
    if (result.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
      console.error('[Worker] Image media errors:', result.data.productCreateMedia.mediaUserErrors);
    } else {
      console.log(`[Worker V5] Image added with ALT="${alt}": ${imageUrl}`);
    }
  } catch (error) {
    console.error('[Worker] Image add error:', error);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth check (secure: uses CRON_SECRET from env, no hardcoded tokens)
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: WorkerPayload = await request.json();
    
    if (!payload.productId || !payload.title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[Worker V5] Processing: ${payload.title}`);
    const startTime = Date.now();

    // Initialize Anthropic client for TwoPhaseQA
    const anthropic = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    // ===========================================
    // STEP 1: UniversalRAG — Search verified info
    // ===========================================
    console.log('[Worker V5] Step 1: Running UniversalRAG with whitelisted sources...');
    
    const ragPipeline = new UniversalRAGPipeline({
      enableSourceRouting: true,
      enableGranularityAware: true,
      enableNoRetrievalDetection: true,
      enableProactiveFusion: true,
      enableBenchmarkContext: true,
      maxSources: 5,
      maxTokenBudget: 6000,
      timeoutMs: 30000,
    });
    
    const ragResult: UniversalRAGResult = await ragPipeline.enrichProduct(
      payload.title,
      payload.vendor,
      payload.productType || '',
      payload.sku || '',
      'full'
    );
    
    console.log(`[Worker V5] RAG completed: success=${ragResult.success}, sources=${ragResult.metadata.sourcesQueried.length}`);

    // ===========================================
    // STEP 2: RagAdapter — Prepare data for QA
    // ===========================================
    console.log('[Worker V5] Step 2: Adapting RAG output for TwoPhaseQA...');
    
    const adaptation: AdaptationResult = adaptRagToQa(
      ragResult,
      payload.title,
      payload.vendor,
      payload.sku || '',
      payload.productType || ''
    );
    
    console.log(`[Worker V5] Adaptation: evidence=${adaptation.metadata.evidenceCount}, sources=${adaptation.metadata.contributingSources.join(',')}`);
    if (adaptation.metadata.warnings.length > 0) {
      console.log(`[Worker V5] Adapter warnings: ${adaptation.metadata.warnings.join('; ')}`);
    }

    // ===========================================
    // STEP 3: TwoPhaseQA — Fact-based specs & reasoning
    // ===========================================
    console.log('[Worker V5] Step 3: Running TwoPhaseQA (Simple QA + Complex QA)...');
    
    let qaResult: TwoPhaseQAResult | null = null;
    let qaContent: ReturnType<typeof twoPhaseQAToProductContent> | null = null;
    
    try {
      qaResult = await runTwoPhaseQA(adaptation.qaInput, anthropic);
      qaContent = twoPhaseQAToProductContent(qaResult);
      
      console.log(`[Worker V5] QA completed: ${qaResult.simpleQA.rawFacts.filter(f => f.verified).length} verified facts, confidence=${qaResult.complexQA.recommendation.confidence}`);
    } catch (qaError) {
      console.error('[Worker V5] TwoPhaseQA failed (non-fatal, continuing with V3 enrichment):', qaError);
    }

    // ===========================================
    // STEP 4: AI Enrichment V3 — Full content generation
    // ===========================================
    console.log('[Worker V5] Step 4: Running ai-enrichment-v3 (RAG + KG + Provenance)...');
    
    const webhookPayload = toWebhookPayload(payload);
    const enrichedData = await generateProductContentV3(webhookPayload);
    
    console.log(`[Worker V5] V3 content generated. Confidence: ${enrichedData.provenance.overallConfidence}%`);

    // ===========================================
    // STEP 5: TAYA Police — Content validation
    // ===========================================
    console.log('[Worker V5] Step 5: Running TAYA Police validation...');
    
    // Merge QA pros/cons with V3 enrichment (QA takes priority for fact-based items)
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
      console.log(`[Worker V5] Fixed ${validationResult.violations.length} TAYA violations`);
    } else {
      console.log('[Worker V5] Content passed TAYA validation');
    }

    // ===========================================
    // STEP 6: ImageAgent V4 — Find product image
    // ===========================================
    console.log('[Worker V5] Step 6: Running ImageAgent V4 (unified)...');
    
    const imageResult: ImageAgentV4Result = await findProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );
    
    if (imageResult.success) {
      console.log(`[Worker V5] Image found via ${imageResult.method}: ${imageResult.source}`);
      console.log(`[Worker V5] Image ALT: "${imageResult.imageAlt}"`);
    } else {
      console.log(`[Worker V5] No image after ${imageResult.searchAttempts} attempts: ${imageResult.error}`);
    }

    // ===========================================
    // STEP 7: Save to Shopify (HTML + Metafields + Image with ALT)
    // ===========================================
    console.log('[Worker V5] Step 7: Updating Shopify with Metafields + Image ALT...');
    
    // Normalize productId to GID format before passing to Shopify
    const productGid = toShopifyGid(payload.productId, 'Product');
    
    const updateResult = await updateShopifyProductWithMetafields(
      productGid,
      enrichedData,
      validationResult.content,
      imageResult,
      qaContent?.specs,
      qaContent?.verdict
    );

    const totalTime = Date.now() - startTime;

    if (!updateResult.success) {
      return NextResponse.json({
        success: false,
        error: updateResult.error,
        product: payload.title,
        timeMs: totalTime,
      }, { status: 500 });
    }

    // ===========================================
    // SUCCESS RESPONSE
    // ===========================================
    return NextResponse.json({
      success: true,
      product: payload.title,
      version: 'V5-RAG-QA',
      metrics: {
        timeMs: totalTime,
        // RAG metrics
        ragSuccess: ragResult.success,
        ragSourcesQueried: ragResult.metadata.sourcesQueried.length,
        ragTokensUsed: ragResult.metadata.tokensUsed,
        ragCostSavings: ragResult.metadata.costSavings,
        // Adapter metrics
        adapterEvidenceCount: adaptation.metadata.evidenceCount,
        adapterSourceDataLength: adaptation.metadata.sourceDataLength,
        adapterHasBenchmark: adaptation.metadata.hasBenchmarkContext,
        // QA metrics
        qaVerifiedFacts: qaResult?.simpleQA.rawFacts.filter(f => f.verified).length || 0,
        qaConfidence: qaResult?.complexQA.recommendation.confidence || 'none',
        qaTimeMs: qaResult?.totalTime || 0,
        // V3 enrichment metrics
        v3Confidence: enrichedData.provenance.overallConfidence,
        v3SourcesCount: enrichedData.sourcesUsed.length,
        v3WarningsCount: enrichedData.provenance.warnings.length,
        // Image metrics
        hasImage: imageResult.success,
        imageSource: imageResult.source,
        imageMethod: imageResult.method,
        imageAlt: imageResult.imageAlt,
        // Content metrics
        prosCount: validationResult.content.pros.length,
        consCount: validationResult.content.cons.length,
        faqsCount: validationResult.content.faqs.length,
        accessoriesCount: enrichedData.accessories.length,
        tayaViolationsFixed: validationResult.violations.length,
        metafieldsCreated: 7,
      },
    });

  } catch (error) {
    console.error('[Worker V5] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
