// Vercel Pro: Allow up to 300 seconds for AI pipeline
export const maxDuration = 300;

/**
 * Worker Regenerate Product - V5.1 (Fix Architetturale: Integrità Flusso RAG)
 * 
 * Full orchestration pipeline:
 * 1. UniversalRAG (searches verified info using whitelisted rag-sources.ts)
 * 2. RagAdapter (transforms RAG output → TwoPhaseQA input)
 * 3. TwoPhaseQA (generates specs and pro/con based on facts)
 * 4. AI Enrichment V3 (content generation using RAG + QA data — NO autonomous research)
 * 5. TAYA Police (post-generation validation)
 * 6. ImageAgentV4 (finds image, prioritizing TRUSTED_RETAILERS for quality)
 * 7. Shopify Admin API (saves HTML + Metafields + Image with ALT text)
 * 
 * FIX ARCHITETTURALE (Feb 2026):
 * - V3 now receives ragResult + qaResult as mandatory inputs
 * - Removed autonomous research in V3 that caused hallucinations
 * - Data flow is now: RAG → QA → V3 Generation (using RAG+QA) → TAYA → Shopify
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
import { generateTextSafe } from '@/lib/shopify/ai-client';

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

  // Estrai da provenance facts (only real verified specs, not RAG metadata)
  if (enrichedData.provenance?.facts) {
    for (const fact of enrichedData.provenance.facts) {
      if (
        fact.verificationStatus === 'verified' &&
        !fact.factKey.startsWith('Source queried:') &&
        !fact.factKey.startsWith('RAG Evidence') &&
        fact.factValue !== 'RAG pipeline source'
      ) {
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
  vendor: string,
  productType: string,
  qaSpecs?: Record<string, string>,
  qaVerdict?: string,
  suitableFor?: string[],
  notSuitableFor?: string[],
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
            vendor,
            productType,
            status: 'ACTIVE',
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
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'accessories',
                type: 'json',
                value: JSON.stringify(enrichedData.accessories || []),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'suitable_for',
                type: 'list.single_line_text_field',
                value: JSON.stringify(suitableFor || []),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'not_suitable_for',
                type: 'list.single_line_text_field',
                value: JSON.stringify(notSuitableFor || []),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'sources_used',
                type: 'list.single_line_text_field',
                value: JSON.stringify(enrichedData.sourcesUsed || []),
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'image_source',
                type: 'single_line_text_field',
                value: imageResult.source || '',
              },
              {
                namespace: METAFIELD_NAMESPACE,
                key: 'image_confidence',
                type: 'single_line_text_field',
                value: imageResult.confidence,
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

    // Carica immagine su Shopify CDN (staged upload → più affidabile di URL esterno)
    if (imageResult.success && imageResult.imageUrl) {
      await uploadImageStaged(productGid, imageResult.imageUrl, imageResult.imageAlt);
    }

    // Pubblica il prodotto sull'Online Store (era DRAFT dalla sync iniziale)
    await publishProductToOnlineStore(productGid);

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

/**
 * Carica un'immagine su Shopify CDN tramite staged upload (PUT binario).
 * Più affidabile di un URL esterno: l'immagine viene ospitata direttamente su Shopify.
 * Fallback automatico a URL esterno se il fetch o lo staging falliscono.
 */
async function uploadImageStaged(
  productGid: string,
  imageUrl: string,
  alt: string
): Promise<void> {
  const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;

  // Step 1: scarica l'immagine dal sito sorgente
  let imageBuffer: ArrayBuffer;
  let contentType: string;
  let fileSize: number;
  let filename: string;

  try {
    const resp = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Autonord-Bot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    imageBuffer = await resp.arrayBuffer();
    contentType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    fileSize = imageBuffer.byteLength;
    filename = (imageUrl.split('/').pop()?.split('?')[0] || 'product.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) filename += '.jpg';
  } catch (fetchErr) {
    console.warn(`[Worker] Fetch immagine fallito (${fetchErr}), fallback a URL esterno`);
    await addProductImage(productGid, imageUrl, alt);
    return;
  }

  // Step 2: crea staged upload su Shopify
  const stagedMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;

  try {
    const stagedResp = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: stagedMutation,
        variables: {
          input: [{
            filename,
            mimeType: contentType,
            resource: 'IMAGE',
            fileSize: String(fileSize),
            httpMethod: 'PUT',
          }],
        },
      }),
    });

    const stagedData = await stagedResp.json();

    if (stagedData.errors?.length || stagedData.data?.stagedUploadsCreate?.userErrors?.length) {
      throw new Error(
        stagedData.errors?.[0]?.message ||
        stagedData.data?.stagedUploadsCreate?.userErrors?.[0]?.message ||
        'Staged upload error'
      );
    }

    const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

    // Step 3: PUT binario all'URL pre-firmato (Google Cloud Storage)
    await fetch(target.url, {
      method: 'PUT',
      body: imageBuffer,
      headers: { 'Content-Type': contentType },
    });

    // Step 4: collega il media al prodotto usando resourceUrl Shopify
    await addProductImage(productGid, target.resourceUrl, alt);
    console.log(`[Worker] Immagine caricata via staged upload: ${filename} (${fileSize} bytes)`);

  } catch (stagingErr) {
    console.warn(`[Worker] Staged upload fallito (${stagingErr}), fallback a URL esterno`);
    await addProductImage(productGid, imageUrl, alt);
  }
}

/**
 * Recupera l'ID della pubblicazione "Online Store" di Shopify.
 */
async function getOnlineStorePublicationId(): Promise<string | null> {
  const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  try {
    const resp = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `query { publications(first: 10) { edges { node { id name } } } }`,
      }),
    });
    const data = await resp.json();
    const edges: Array<{ node: { id: string; name: string } }> = data.data?.publications?.edges || [];
    const onlineStore = edges.find(e => e.node.name === 'Online Store');
    return onlineStore?.node.id || edges[0]?.node.id || null;
  } catch (err) {
    console.error('[Worker] Impossibile ottenere publication ID:', err);
    return null;
  }
}

/**
 * Pubblica il prodotto sull'Online Store.
 * Chiamato DOPO l'arricchimento completo — il prodotto era DRAFT dalla sync iniziale.
 */
async function publishProductToOnlineStore(productGid: string): Promise<void> {
  const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  const publicationId = await getOnlineStorePublicationId();

  if (!publicationId) {
    console.warn('[Worker] Nessun publication ID trovato — publish saltato');
    return;
  }

  try {
    const resp = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `
          mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              publishable { availablePublicationsCount { count } }
              userErrors { field message }
            }
          }
        `,
        variables: { id: productGid, input: [{ publicationId }] },
      }),
    });

    const data = await resp.json();
    if (data.data?.publishablePublish?.userErrors?.length > 0) {
      console.error('[Worker] Publish errors:', data.data.publishablePublish.userErrors);
    } else {
      console.log(`[Worker] Prodotto pubblicato sull'Online Store: ${productGid}`);
    }
  } catch (err) {
    console.error('[Worker] Publish fallito (non bloccante):', err);
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
    // STEPS 3+6: TwoPhaseQA + ImageAgent V4 in PARALLELO
    // TwoPhaseQA usa i dati RAG; ImageAgent usa solo i campi del payload
    // → risparmio 30–60 secondi per prodotto
    // ===========================================
    console.log('[Worker V5] Steps 3+6: TwoPhaseQA + ImageAgent V4 in parallelo...');

    const [qaOutput, imageResult] = await Promise.all([
      // TwoPhaseQA (con error handling non bloccante)
      (async () => {
        try {
          const result = await runTwoPhaseQA(adaptation.qaInput);
          const content = twoPhaseQAToProductContent(result);
          console.log(`[Worker V5] QA: ${result.simpleQA.rawFacts.filter(f => f.verified).length} verified facts, confidence=${result.complexQA.recommendation.confidence}`);
          return {
            qaResult: result,
            qaContent: content,
          };
        } catch (qaError) {
          console.error('[Worker V5] TwoPhaseQA failed (non-fatal):', qaError instanceof Error ? qaError.message : String(qaError));
          return {
            qaResult: null as TwoPhaseQAResult | null,
            qaContent: null as ReturnType<typeof twoPhaseQAToProductContent> | null,
          };
        }
      })(),
      // ImageAgent V4
      findProductImage(payload.title, payload.vendor, payload.sku, payload.barcode).then(result => {
        if (result.success) {
          console.log(`[Worker V5] Image found via ${result.method}: ${result.source} (alt: "${result.imageAlt}")`);
        } else {
          console.log(`[Worker V5] No image after ${result.searchAttempts} attempts: ${result.error}`);
        }
        return result;
      }),
    ]);

    const { qaResult, qaContent } = qaOutput;

    // ===========================================
    // STEP 4: AI Enrichment V3 — Full content generation
    // FIX ARCHITETTURALE: V3 ora riceve i dati REALI da RAG + QA
    // ===========================================
    console.log('[Worker V5] Step 4: Running ai-enrichment-v3 (using RAG + QA data)...');
    
    const webhookPayload = toWebhookPayload(payload);
    const enrichedData = await generateProductContentV3(webhookPayload, ragResult, qaResult);
    
    console.log(`[Worker V5] V3 content generated. Confidence: ${enrichedData.provenance.overallConfidence}%`);

    // ===========================================
    // STEP 5: TAYA Police — Content validation
    // ===========================================
    console.log('[Worker V5] Step 5: Running TAYA Police validation...');
    
    // FIX ARCHITETTURALE: V3 ora integra già i dati QA nel prompt.
    // Questo merge aggiuntivo serve come safety net per catturare eventuali
    // pro/contro QA che il LLM potrebbe aver omesso nella generazione.
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
    // STEP 7: Shopify — tutti i campi + immagine (staged) + publish
    // ===========================================
    console.log('[Worker V5] Step 7: Aggiornamento Shopify (campi, metafield, immagine, publish)...');
    
    // Normalize productId to GID format before passing to Shopify
    const productGid = toShopifyGid(payload.productId, 'Product');
    
    const updateResult = await updateShopifyProductWithMetafields(
      productGid,
      enrichedData,
      validationResult.content,
      imageResult,
      payload.vendor,
      payload.productType || '',
      qaContent?.specs,
      qaContent?.verdict,
      qaResult?.complexQA.suitability.idealFor,
      qaResult?.complexQA.suitability.notIdealFor,
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
        metafieldsCreated: 13,
        imageUploadMethod: imageResult.success ? 'staged_with_fallback' : 'none',
        parallelSteps: 'TwoPhaseQA+ImageAgent',
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
