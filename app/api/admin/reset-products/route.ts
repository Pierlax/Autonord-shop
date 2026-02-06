/**
 * Admin API: Reset Products for V3.1 Reprocessing
 * 
 * Removes "AI-Enhanced" and related TAYA tags from products so they get
 * reprocessed by the cron job with the new RAG+QA pipeline.
 * 
 * Usage:
 *   POST /api/admin/reset-products?count=5      → Reset 5 products
 *   POST /api/admin/reset-products?all=true      → Reset ALL products (paginated)
 *   GET  /api/admin/reset-products               → Show stats and usage
 * 
 * FIX ARCHITETTURALE (Feb 2026):
 * After the V3 fix, products need to be reprocessed so their content
 * is generated using real RAG+QA data instead of hallucinated research.
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // Allow up to 5 minutes for bulk reset

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Tags to remove during reset
const TAGS_TO_REMOVE = [
  'AI-Enhanced',
  'TAYA',
  'TAYA-V3',
  'TAYA-V3.1',
  'TAYA-V5',
  'scheda arricchita',
  'Scheda Arricchita',
  'Scheda arricchita',
];

function shouldRemoveTag(tag: string): boolean {
  const tagLower = tag.toLowerCase().trim();
  return TAGS_TO_REMOVE.some(t => t.toLowerCase() === tagLower) 
    || tag.startsWith('AI-')
    || tagLower.includes('scheda arricchita');
}

async function shopifyAdminQuery(query: string, variables?: Record<string, unknown>) {
  if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN) {
    throw new Error('Missing Shopify credentials');
  }

  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// PAGINATED FETCH: Get all products with AI-Enhanced tag
// =============================================================================

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  tags: string[];
}

async function getTaggedProducts(limit: number): Promise<ProductNode[]> {
  // Fetch products with ANY enrichment-related tag (TAYA, AI-Enhanced, scheda arricchita)
  const query = `
    query GetTaggedProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, query: "tag:TAYA OR tag:AI-Enhanced OR tag:'TAYA-V3.1' OR tag:'TAYA-V5'") {
        edges {
          node {
            id
            title
            handle
            tags
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const allProducts: ProductNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  const pageSize = Math.min(limit, 250); // Shopify max per page

  while (hasNextPage && allProducts.length < limit) {
    const remaining = limit - allProducts.length;
    const fetchCount = Math.min(remaining, pageSize);

    const variables: Record<string, unknown> = { first: fetchCount };
    if (cursor) variables.after = cursor;

    const result = await shopifyAdminQuery(query, variables);
    const edges = result.data?.products?.edges || [];

    for (const edge of edges) {
      allProducts.push(edge.node);
      cursor = edge.cursor;
    }

    hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;

    console.log(`[ResetProducts] Fetched ${allProducts.length} products so far...`);
  }

  return allProducts;
}

// =============================================================================
// COUNT: Get total number of AI-Enhanced products
// =============================================================================

async function countTaggedProducts(): Promise<number> {
  const query = `
    query CountTagged {
      productsCount(query: "tag:TAYA OR tag:AI-Enhanced OR tag:'TAYA-V3.1' OR tag:'TAYA-V5'") {
        count
      }
    }
  `;

  try {
    const result = await shopifyAdminQuery(query);
    return result.data?.productsCount?.count || 0;
  } catch {
    // Fallback: count manually
    const products = await getTaggedProducts(1000);
    return products.length;
  }
}

// =============================================================================
// RESET: Remove tags from a single product
// =============================================================================

async function resetProductTags(product: ProductNode): Promise<{
  success: boolean;
  removedTags: string[];
  errors: any[];
}> {
  const removedTags = product.tags.filter(shouldRemoveTag);
  const newTags = product.tags.filter(tag => !shouldRemoveTag(tag));

  if (removedTags.length === 0) {
    return { success: true, removedTags: [], errors: [] };
  }

  const updateMutation = `
    mutation UpdateProductTags($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          tags
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const updateResult = await shopifyAdminQuery(updateMutation, {
    input: {
      id: product.id,
      tags: newTags,
    },
  });

  const errors = updateResult.data?.productUpdate?.userErrors || [];

  return {
    success: errors.length === 0,
    removedTags,
    errors,
  };
}

// =============================================================================
// POST: Reset products
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const resetAll = searchParams.get('all') === 'true';
    const count = resetAll ? 10000 : parseInt(searchParams.get('count') || '5', 10);
    
    console.log(`[ResetProducts] Starting reset: ${resetAll ? 'ALL products' : `${count} products`}`);

    // Step 1: Get products with enrichment tags (TAYA, AI-Enhanced, etc.)
    const products = await getTaggedProducts(count);

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products with AI-Enhanced tag found. Nothing to reset.',
        totalReset: 0,
      });
    }

    console.log(`[ResetProducts] Found ${products.length} products to reset`);

    // Step 2: Remove tags from each product
    const resetResults = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        const result = await resetProductTags(product);
        
        resetResults.push({
          id: product.id,
          title: product.title,
          handle: product.handle,
          success: result.success,
          removedTags: result.removedTags,
          errors: result.errors,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }

        // Log progress every 10 products
        if ((i + 1) % 10 === 0 || i === products.length - 1) {
          console.log(`[ResetProducts] Progress: ${i + 1}/${products.length} (${successCount} ok, ${failCount} failed)`);
        }

        // Small delay to avoid rate limiting (Shopify allows ~2 req/sec for mutations)
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        failCount++;
        resetResults.push({
          id: product.id,
          title: product.title,
          handle: product.handle,
          success: false,
          removedTags: [],
          errors: [{ message: err instanceof Error ? err.message : 'Unknown error' }],
        });
      }
    }

    console.log(`[ResetProducts] Complete: ${successCount}/${products.length} products reset`);

    return NextResponse.json({
      success: true,
      message: `Reset ${successCount}/${products.length} products for V3.1 reprocessing`,
      totalFound: products.length,
      totalReset: successCount,
      totalFailed: failCount,
      tagsRemoved: TAGS_TO_REMOVE,
      resetProducts: resetResults,
      nextSteps: [
        'Products will be picked up by the cron job (auto-process-products)',
        'Or trigger manually: GET /api/cron/auto-process-products',
        'Or use: GET /api/cron/regenerate-all-products for bulk regeneration',
        'Each product will now be processed with the fixed RAG → QA → V3 pipeline',
      ],
    });

  } catch (error) {
    console.error('[ResetProducts] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// =============================================================================
// GET: Show stats and usage
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const taggedCount = await countTaggedProducts();

    return NextResponse.json({
      message: 'Reset Products API — V3.1 Fix Architetturale',
      stats: {
        productsWithEnrichmentTags: taggedCount,
        description: 'These products will have their AI/TAYA tags removed and will be reprocessed with the fixed pipeline',
      },
      usage: {
        resetSome: 'POST /api/admin/reset-products?count=10',
        resetAll: 'POST /api/admin/reset-products?all=true',
      },
      tagsToRemove: TAGS_TO_REMOVE,
      pipeline: 'UniversalRAG → TwoPhaseQA → AI Enrichment V3.1 → TAYA Police → Shopify',
    });

  } catch (error) {
    return NextResponse.json({
      message: 'Reset Products API',
      usage: {
        resetSome: 'POST /api/admin/reset-products?count=10',
        resetAll: 'POST /api/admin/reset-products?all=true',
      },
      error: error instanceof Error ? error.message : 'Could not fetch stats',
    });
  }
}
