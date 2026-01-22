/**
 * Pipeline Diagnostic Test - V3 Dry Run
 * 
 * Testa l'intera pipeline senza salvare su Shopify.
 * Stampa log dettagliati per ogni step.
 * 
 * Usage: GET /api/test/pipeline?productId=gid://shopify/Product/123
 *    or: GET /api/test/pipeline?sku=4932472062
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  generateProductContentV3, 
  formatDescriptionAsHtmlV3,
} from '@/lib/shopify/ai-enrichment-v3';
import { ShopifyProductWebhookPayload } from '@/lib/shopify/webhook-types';
import { discoverProductImage } from '@/lib/agents/image-discovery-agent';
import { validateAndCorrect, BANNED_PHRASES } from '@/lib/agents/taya-police';

// =============================================================================
// CONFIG
// =============================================================================

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

// =============================================================================
// TYPES
// =============================================================================

interface DiagnosticLog {
  step: number;
  name: string;
  status: 'success' | 'warning' | 'error';
  duration: number;
  details: Record<string, unknown>;
}

interface DiagnosticResult {
  success: boolean;
  productTitle: string;
  totalDuration: number;
  logs: DiagnosticLog[];
  finalOutput: {
    descriptionHtml: string;
    metafields: Record<string, unknown>;
    tags: string[];
    seo: { title: string; description: string };
    imageUrl: string | null;
  } | null;
}

// =============================================================================
// SHOPIFY FETCH
// =============================================================================

async function fetchProductFromShopify(
  productId?: string,
  sku?: string
): Promise<{ product: ShopifyProductWebhookPayload; raw: Record<string, unknown> } | null> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  let query: string;
  
  if (productId) {
    query = `
      query {
        product(id: "${productId}") {
          id
          title
          vendor
          productType
          tags
          descriptionHtml
          handle
          status
          variants(first: 1) {
            edges {
              node {
                sku
                barcode
                price
              }
            }
          }
        }
      }
    `;
  } else if (sku) {
    query = `
      query {
        products(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              title
              vendor
              productType
              tags
              descriptionHtml
              handle
              status
              variants(first: 1) {
                edges {
                  node {
                    sku
                    barcode
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;
  } else {
    return null;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  
  const productData = productId 
    ? result.data?.product 
    : result.data?.products?.edges?.[0]?.node;
  
  if (!productData) return null;

  const variant = productData.variants?.edges?.[0]?.node;
  
  // Convert to webhook format
  const webhookPayload: ShopifyProductWebhookPayload = {
    id: parseInt(productData.id.replace(/\D/g, '')) || 0,
    title: productData.title,
    body_html: productData.descriptionHtml,
    vendor: productData.vendor,
    product_type: productData.productType || '',
    created_at: new Date().toISOString(),
    handle: productData.handle,
    updated_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    template_suffix: null,
    published_scope: 'global',
    tags: productData.tags?.join(', ') || '',
    status: productData.status?.toLowerCase() || 'active',
    admin_graphql_api_id: productData.id,
    variants: [{
      id: 0,
      product_id: 0,
      title: 'Default',
      price: variant?.price || '0',
      sku: variant?.sku || '',
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
      barcode: variant?.barcode || null,
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

  return { product: webhookPayload, raw: productData };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const productId = searchParams.get('productId');
  const sku = searchParams.get('sku');
  
  if (!productId && !sku) {
    return NextResponse.json({
      error: 'Missing productId or sku parameter',
      usage: '/api/test/pipeline?productId=gid://shopify/Product/123 or /api/test/pipeline?sku=4932472062',
    }, { status: 400 });
  }

  const logs: DiagnosticLog[] = [];
  const totalStart = Date.now();
  let productTitle = 'Unknown';

  console.log('\n' + '='.repeat(80));
  console.log('🔬 PIPELINE DIAGNOSTIC TEST - V3 DRY RUN');
  console.log('='.repeat(80) + '\n');

  try {
    // =========================================================================
    // STEP 1: Fetch from Shopify
    // =========================================================================
    console.log('📥 STEP 1: Fetching product from Shopify...');
    const step1Start = Date.now();
    
    const shopifyResult = await fetchProductFromShopify(productId || undefined, sku || undefined);
    
    if (!shopifyResult) {
      logs.push({
        step: 1,
        name: 'Shopify Fetch',
        status: 'error',
        duration: Date.now() - step1Start,
        details: { error: 'Product not found' },
      });
      
      return NextResponse.json({
        success: false,
        error: 'Product not found in Shopify',
        logs,
      }, { status: 404 });
    }

    const { product, raw } = shopifyResult;
    productTitle = product.title;
    
    console.log(`   ✅ Found: "${product.title}"`);
    console.log(`   📦 Vendor: ${product.vendor}`);
    console.log(`   🏷️ SKU: ${product.variants[0]?.sku || 'N/A'}`);
    console.log(`   📊 Barcode: ${product.variants[0]?.barcode || 'N/A'}`);
    console.log(`   🏷️ Tags: ${product.tags || 'None'}`);
    
    logs.push({
      step: 1,
      name: 'Shopify Fetch',
      status: 'success',
      duration: Date.now() - step1Start,
      details: {
        title: product.title,
        vendor: product.vendor,
        sku: product.variants[0]?.sku,
        barcode: product.variants[0]?.barcode,
        tags: product.tags,
        productType: product.product_type,
      },
    });

    // =========================================================================
    // STEP 2: AI Enrichment V3 (RAG + KG + Provenance)
    // =========================================================================
    console.log('\n🧠 STEP 2: Running AI Enrichment V3 (RAG + Knowledge Graph + Provenance)...');
    const step2Start = Date.now();
    
    const enrichedData = await generateProductContentV3(product);
    
    console.log(`   ✅ Content generated`);
    console.log(`   📊 Confidence: ${enrichedData.provenance.overallConfidence}%`);
    console.log(`   📚 Sources used: ${enrichedData.sourcesUsed.length}`);
    enrichedData.sourcesUsed.forEach(s => console.log(`      - ${s}`));
    console.log(`   ⚠️ Warnings: ${enrichedData.provenance.warnings.length}`);
    if (enrichedData.provenance.warnings.length > 0) {
      enrichedData.provenance.warnings.forEach(w => console.log(`      - ${w}`));
    }
    console.log(`   👍 Pros: ${enrichedData.pros.length}`);
    console.log(`   👎 Cons: ${enrichedData.cons.length}`);
    console.log(`   ❓ FAQs: ${enrichedData.faqs.length}`);
    console.log(`   🔧 Accessories: ${enrichedData.accessories.length}`);
    
    // Show KG context
    const kgContext = enrichedData.knowledgeGraphContext;
    if (kgContext) {
      console.log(`   🎯 Suitable for trades: ${kgContext.suitableForTrades.join(', ') || 'N/A'}`);
      console.log(`   📋 Use cases: ${kgContext.relatedUseCases.join(', ') || 'N/A'}`);
    }
    
    logs.push({
      step: 2,
      name: 'AI Enrichment V3',
      status: enrichedData.provenance.warnings.length > 0 ? 'warning' : 'success',
      duration: Date.now() - step2Start,
      details: {
        confidence: enrichedData.provenance.overallConfidence,
        sourcesCount: enrichedData.sourcesUsed.length,
        sources: enrichedData.sourcesUsed,
        warnings: enrichedData.provenance.warnings,
        prosCount: enrichedData.pros.length,
        consCount: enrichedData.cons.length,
        faqsCount: enrichedData.faqs.length,
        accessoriesCount: enrichedData.accessories.length,
        knowledgeGraph: kgContext,
        descriptionPreview: enrichedData.description.substring(0, 200) + '...',
      },
    });

    // =========================================================================
    // STEP 3: TAYA Police Validation
    // =========================================================================
    console.log('\n🚔 STEP 3: Running TAYA Police validation...');
    const step3Start = Date.now();
    
    console.log(`   📋 Checking against ${BANNED_PHRASES.length} banned phrases...`);
    
    const validationResult = await validateAndCorrect({
      description: enrichedData.description,
      pros: enrichedData.pros,
      cons: enrichedData.cons,
      faqs: enrichedData.faqs,
    });
    
    if (validationResult.wasFixed) {
      console.log(`   ⚠️ VIOLATIONS FOUND: ${validationResult.violations.length}`);
      validationResult.violations.forEach(v => {
        console.log(`      - "${v.phrase}" in ${v.field}`);
        console.log(`        Context: ${v.context.substring(0, 80)}...`);
      });
      console.log(`   🔧 Content was auto-corrected`);
    } else {
      console.log(`   ✅ Content is CLEAN - no banned phrases found`);
    }
    
    logs.push({
      step: 3,
      name: 'TAYA Police',
      status: validationResult.wasFixed ? 'warning' : 'success',
      duration: Date.now() - step3Start,
      details: {
        wasFixed: validationResult.wasFixed,
        violationsCount: validationResult.violations.length,
        violations: validationResult.violations.map(v => ({
          phrase: v.phrase,
          field: v.field,
          context: v.context.substring(0, 100),
        })),
      },
    });

    // =========================================================================
    // STEP 4: Image Discovery
    // =========================================================================
    console.log('\n🖼️ STEP 4: Running Image Discovery Agent...');
    const step4Start = Date.now();
    
    const imageResult = await discoverProductImage(
      product.title,
      product.vendor,
      product.variants[0]?.sku || null,
      product.variants[0]?.barcode || null
    );
    
    if (imageResult.success) {
      console.log(`   ✅ Image found!`);
      console.log(`   🔗 URL: ${imageResult.imageUrl}`);
      console.log(`   📍 Source: ${imageResult.source}`);
      console.log(`   🔍 Validated: ${imageResult.success ? 'YES' : 'NO'}`);
    } else {
      console.log(`   ❌ No image found`);
      console.log(`   📝 Error: ${imageResult.error}`);
    }
    
    logs.push({
      step: 4,
      name: 'Image Discovery',
      status: imageResult.success ? 'success' : 'warning',
      duration: Date.now() - step4Start,
      details: {
        success: imageResult.success,
        imageUrl: imageResult.imageUrl,
        source: imageResult.source,
        validated: imageResult.success,
        error: imageResult.error,
      },
    });

    // =========================================================================
    // STEP 5: Generate Final Output (DRY RUN - no save)
    // =========================================================================
    console.log('\n📤 STEP 5: Generating final output (DRY RUN - not saving)...');
    const step5Start = Date.now();
    
    // Generate HTML
    const enrichedWithCleanContent = {
      ...enrichedData,
      description: validationResult.content.description,
      pros: validationResult.content.pros,
      cons: validationResult.content.cons,
      faqs: validationResult.content.faqs,
    };
    const descriptionHtml = formatDescriptionAsHtmlV3(enrichedWithCleanContent);
    
    // Extract specs
    const specs: Record<string, string> = {};
    if (enrichedData.provenance?.facts) {
      for (const fact of enrichedData.provenance.facts) {
        if (fact.verificationStatus === 'verified') {
          specs[fact.factKey] = fact.factValue;
        }
      }
    }
    
    // Generate expert opinion
    const trades = enrichedData.knowledgeGraphContext?.suitableForTrades || [];
    const expertOpinion = `${trades.length > 0 ? `Ideale per: ${trades.join(', ')}.` : ''} ${validationResult.content.pros.slice(0, 2).join('. ')}. ${validationResult.content.cons.length > 0 ? `Da considerare: ${validationResult.content.cons[0]}.` : ''}`.trim();
    
    // Build metafields
    const metafields = {
      'taya.pros': validationResult.content.pros,
      'taya.cons': validationResult.content.cons,
      'taya.specs': specs,
      'taya.expert_opinion': expertOpinion,
      'taya.faqs': validationResult.content.faqs,
      'taya.confidence': enrichedData.provenance.overallConfidence,
      'taya.generated_at': new Date().toISOString(),
    };
    
    const tags = ['AI-Enhanced', 'TAYA-V3.1'];
    const seo = {
      title: validationResult.content.description.substring(0, 60),
      description: validationResult.content.description.substring(0, 160),
    };
    
    console.log(`   ✅ Final output generated`);
    console.log(`   📝 HTML length: ${descriptionHtml.length} chars`);
    console.log(`   🏷️ Tags: ${tags.join(', ')}`);
    console.log(`   📊 Metafields: ${Object.keys(metafields).length}`);
    console.log(`   🔍 SEO title: ${seo.title.substring(0, 50)}...`);
    
    logs.push({
      step: 5,
      name: 'Final Output Generation',
      status: 'success',
      duration: Date.now() - step5Start,
      details: {
        htmlLength: descriptionHtml.length,
        tagsCount: tags.length,
        metafieldsCount: Object.keys(metafields).length,
        specsCount: Object.keys(specs).length,
      },
    });

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    const totalDuration = Date.now() - totalStart;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Product: ${productTitle}`);
    console.log(`   Total duration: ${totalDuration}ms`);
    console.log(`   Steps completed: ${logs.length}/5`);
    console.log(`   Errors: ${logs.filter(l => l.status === 'error').length}`);
    console.log(`   Warnings: ${logs.filter(l => l.status === 'warning').length}`);
    console.log('='.repeat(80) + '\n');

    const result: DiagnosticResult = {
      success: true,
      productTitle,
      totalDuration,
      logs,
      finalOutput: {
        descriptionHtml,
        metafields,
        tags,
        seo,
        imageUrl: imageResult.imageUrl,
      },
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('\n❌ PIPELINE ERROR:', error);
    
    logs.push({
      step: logs.length + 1,
      name: 'Pipeline Error',
      status: 'error',
      duration: Date.now() - totalStart,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return NextResponse.json({
      success: false,
      productTitle,
      totalDuration: Date.now() - totalStart,
      logs,
      finalOutput: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
