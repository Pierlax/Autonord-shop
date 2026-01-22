/**
 * Worker Regenerate Product - TAYA V3
 * 
 * Orchestratore che collega:
 * 1. ai-enrichment-v3.ts (la "Ferrari" - RAG + Knowledge Graph + Provenance)
 * 2. ImageDiscoveryAgent (ricerca immagini ufficiali)
 * 3. Shopify Admin API (salvataggio)
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  generateProductContentV3, 
  formatDescriptionAsHtmlV3,
  EnrichedProductDataV3,
} from '@/lib/shopify/ai-enrichment-v3';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';
import { discoverProductImage } from '@/lib/agents/image-discovery-agent';

// =============================================================================
// CONFIG
// =============================================================================

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

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

// =============================================================================
// SHOPIFY API
// =============================================================================

async function updateShopifyProduct(
  productId: string,
  enrichedData: EnrichedProductDataV3,
  imageUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  // Genera HTML dalla struttura V3
  const descriptionHtml = formatDescriptionAsHtmlV3(enrichedData);
  
  // Genera titolo SEO
  const seoTitle = enrichedData.description.substring(0, 60);
  const seoDescription = enrichedData.description.substring(0, 160);
  
  // Tags
  const tags = ['AI-Enhanced', 'TAYA-V3'];

  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
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
          },
        },
      }),
    });

    const result = await response.json();
    
    if (result.data?.productUpdate?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.data.productUpdate.userErrors[0].message,
      };
    }

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

    console.log(`[Worker V3] 🚀 Processing: ${payload.title}`);
    const startTime = Date.now();

    // ===========================================
    // STEP 1: Genera contenuto con la "Ferrari" V3
    // ===========================================
    console.log('[Worker V3] Step 1: Running ai-enrichment-v3 (RAG + KG + Provenance)...');
    
    const webhookPayload = toWebhookPayload(payload);
    const enrichedData = await generateProductContentV3(webhookPayload);
    
    console.log(`[Worker V3] Content generated. Confidence: ${enrichedData.provenance.overallConfidence}%`);
    console.log(`[Worker V3] Sources used: ${enrichedData.sourcesUsed.join(', ')}`);
    console.log(`[Worker V3] Warnings: ${enrichedData.provenance.warnings.length}`);

    // ===========================================
    // STEP 2: Cerca immagine ufficiale
    // ===========================================
    console.log('[Worker V3] Step 2: Running ImageDiscoveryAgent...');
    
    const imageResult = await discoverProductImage(
      payload.title,
      payload.vendor,
      payload.sku,
      payload.barcode
    );
    
    if (imageResult.success) {
      console.log(`[Worker V3] ✅ Image found: ${imageResult.source}`);
    } else {
      console.log(`[Worker V3] ⚠️ No image: ${imageResult.error}`);
    }

    // ===========================================
    // STEP 3: Salva su Shopify
    // ===========================================
    console.log('[Worker V3] Step 3: Updating Shopify...');
    
    const updateResult = await updateShopifyProduct(
      payload.productId,
      enrichedData,
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
      version: 'V3-TAYA',
      metrics: {
        timeMs: totalTime,
        confidence: enrichedData.provenance.overallConfidence,
        sourcesCount: enrichedData.sourcesUsed.length,
        warningsCount: enrichedData.provenance.warnings.length,
        hasImage: imageResult.success,
        imageSource: imageResult.source,
        prosCount: enrichedData.pros.length,
        consCount: enrichedData.cons.length,
        faqsCount: enrichedData.faqs.length,
        accessoriesCount: enrichedData.accessories.length,
      },
    });

  } catch (error) {
    console.error('[Worker V3] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
