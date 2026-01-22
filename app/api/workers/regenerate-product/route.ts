// Vercel Pro: Allow up to 300 seconds for AI pipeline
export const maxDuration = 300;

/**
 * Worker Regenerate Product - V4
 * 
 * Orchestratore che collega:
 * 1. ai-enrichment-v3.ts (RAG + Knowledge Graph + Provenance)
 * 2. ImageAgent V4 (ricerca immagini UNIFICATA - Cross-Code + Gold Standard + Vision)
 * 3. TAYA Police (validazione post-generazione)
 * 4. Shopify Admin API (salvataggio HTML + Metafields)
 * 
 * NOVITÀ V4:
 * - ImageAgent V4 unificato (no più Deep Research separato)
 * - Flusso ottimizzato: meno chiamate API, più veloce
 * - Cross-Code e Gold Standard integrati in un unico agente
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  generateProductContentV3, 
  formatDescriptionAsHtmlV3,
  EnrichedProductDataV3,
} from '@/lib/shopify/ai-enrichment-v3';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';
import { findProductImage, ImageAgentV4Result } from '@/lib/agents/image-agent-v4';
import { validateAndCorrect, CleanedContent } from '@/lib/agents/taya-police';

// =============================================================================
// CONFIG
// =============================================================================

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

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
 * Estrae le specifiche tecniche in formato JSON
 */
function extractSpecs(enrichedData: EnrichedProductDataV3): TayaSpecs {
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
 * Genera l'opinione dell'esperto dal contenuto
 */
function generateExpertOpinion(
  cleanedContent: CleanedContent,
  enrichedData: EnrichedProductDataV3
): string {
  const trades = enrichedData.knowledgeGraphContext?.suitableForTrades || [];
  const tradesText = trades.length > 0 
    ? `Ideale per: ${trades.join(', ')}.` 
    : '';
  
  const prosText = cleanedContent.pros.slice(0, 2).join('. ');
  const consText = cleanedContent.cons.length > 0 
    ? `Da considerare: ${cleanedContent.cons[0]}.` 
    : '';
  
  return `${tradesText} ${prosText}. ${consText}`.trim();
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
  imageUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
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
  const tags = ['AI-Enhanced', 'TAYA-V3.1'];
  
  // Estrai specs e genera expert opinion
  const specs = extractSpecs(enrichedData);
  const expertOpinion = cleanedContent.expertOpinion || generateExpertOpinion(cleanedContent, enrichedData);

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
            id: productId,
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

    console.log('[Worker V3.1] ✅ Product updated with Metafields');

    // Aggiungi immagine se trovata
    if (imageUrl) {
      await addProductImage(productId, imageUrl);
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

async function addProductImage(productId: string, imageUrl: string): Promise<void> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id } }
        mediaUserErrors { field message }
      }
    }
  `;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          productId,
          media: [{
            originalSource: imageUrl,
            mediaContentType: 'IMAGE',
          }],
        },
      }),
    });
    console.log(`[Worker] Image added: ${imageUrl}`);
  } catch (error) {
    console.error('[Worker] Image add error:', error);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    const upstashSignature = request.headers.get('upstash-signature');
    
    if (!upstashSignature && authHeader !== 'Bearer autonord-cron-2024-xK9mP2vL8nQ4') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: WorkerPayload = await request.json();
    
    if (!payload.productId || !payload.title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[Worker V3.1] 🚀 Processing: ${payload.title}`);
    const startTime = Date.now();

    // ===========================================
    // STEP 1: Genera contenuto con la "Ferrari" V3
    // ===========================================
    console.log('[Worker V3.1] Step 1: Running ai-enrichment-v3 (RAG + KG + Provenance)...');
    
    const webhookPayload = toWebhookPayload(payload);
    const enrichedData = await generateProductContentV3(webhookPayload);
    
    console.log(`[Worker V3.1] Content generated. Confidence: ${enrichedData.provenance.overallConfidence}%`);
    console.log(`[Worker V3.1] Sources used: ${enrichedData.sourcesUsed.join(', ')}`);

    // ===========================================
    // STEP 2: TAYA Police - Validazione contenuti
    // ===========================================
    console.log('[Worker V3.1] Step 2: Running TAYA Police validation...');
    
    const validationResult = await validateAndCorrect({
      description: enrichedData.description,
      pros: enrichedData.pros,
      cons: enrichedData.cons,
      faqs: enrichedData.faqs,
    });
    
    if (validationResult.wasFixed) {
      console.log(`[Worker V3.1] 🔧 Fixed ${validationResult.violations.length} TAYA violations`);
    } else {
      console.log('[Worker V3.1] ✅ Content passed TAYA validation');
    }

    // ===========================================
    // STEP 3: Cerca immagine con ImageAgent V4 (unificato)
    // ===========================================
    console.log('[Worker V4] Step 3: Running ImageAgent V4 (unified)...');
    
    const imageResult = await findProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );
    
    if (imageResult.success) {
      console.log(`[Worker V4] ✅ Image found via ${imageResult.method}: ${imageResult.source}`);
      console.log(`[Worker V4] Confidence: ${imageResult.confidence}, Time: ${imageResult.totalTimeMs}ms`);
      if (imageResult.alternativeCodes.length > 0) {
        console.log(`[Worker V4] Alternative codes found: ${imageResult.alternativeCodes.join(', ')}`);
      }
    } else {
      console.log(`[Worker V4] ⚠️ No image after ${imageResult.searchAttempts} attempts: ${imageResult.error}`);
    }

    // ===========================================
    // STEP 4: Salva su Shopify (HTML + Metafields)
    // ===========================================
    console.log('[Worker V3.1] Step 4: Updating Shopify with Metafields...');
    
    const updateResult = await updateShopifyProductWithMetafields(
      payload.productId,
      enrichedData,
      validationResult.content,
      imageResult.imageUrl
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
      version: 'V3.1-TAYA',
      metrics: {
        timeMs: totalTime,
        confidence: enrichedData.provenance.overallConfidence,
        sourcesCount: enrichedData.sourcesUsed.length,
        warningsCount: enrichedData.provenance.warnings.length,
        hasImage: imageResult.success,
        imageSource: imageResult.source,
        prosCount: validationResult.content.pros.length,
        consCount: validationResult.content.cons.length,
        faqsCount: validationResult.content.faqs.length,
        accessoriesCount: enrichedData.accessories.length,
        tayaViolationsFixed: validationResult.violations.length,
        metafieldsCreated: 7,
      },
    });

  } catch (error) {
    console.error('[Worker V3.1] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
