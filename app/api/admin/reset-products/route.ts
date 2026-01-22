/**
 * Admin API: Reset Products for V3 Reprocessing
 * 
 * Removes "AI-Enhanced" tag from products so they get reprocessed by the cron job.
 * 
 * Usage: POST /api/admin/reset-products?count=5
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

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

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '5', 10);
    
    console.log(`[ResetProducts] Resetting ${count} products for V3 reprocessing...`);

    // Step 1: Get products with AI-Enhanced tag
    const getProductsQuery = `
      query GetAIEnhancedProducts($first: Int!) {
        products(first: $first, query: "tag:AI-Enhanced") {
          edges {
            node {
              id
              title
              handle
              tags
            }
          }
        }
      }
    `;

    const productsResult = await shopifyAdminQuery(getProductsQuery, { first: count });
    const products = productsResult.data?.products?.edges || [];

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No products with AI-Enhanced tag found',
      });
    }

    console.log(`[ResetProducts] Found ${products.length} products to reset`);

    // Step 2: Remove AI-Enhanced and TAYA tags from each product
    const resetResults = [];

    for (const { node: product } of products) {
      const newTags = product.tags
        .filter((tag: string) => 
          tag !== 'AI-Enhanced' && 
          tag !== 'TAYA' && 
          tag !== 'TAYA-V3' &&
          !tag.startsWith('AI-')
        );

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
      
      resetResults.push({
        id: product.id,
        title: product.title,
        handle: product.handle,
        oldTags: product.tags,
        newTags: newTags,
        success: errors.length === 0,
        errors: errors,
      });

      console.log(`[ResetProducts] Reset: ${product.title} - ${errors.length === 0 ? 'SUCCESS' : 'FAILED'}`);
    }

    const successCount = resetResults.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Reset ${successCount}/${products.length} products for V3 reprocessing`,
      resetProducts: resetResults,
      nextSteps: [
        'Products will be picked up by the cron job (every 15 minutes)',
        'Or trigger manually: GET /api/cron/auto-process-products',
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

export async function GET(request: NextRequest) {
  // GET shows current status
  try {
    const getStatsQuery = `
      query GetProductStats {
        aiEnhanced: products(first: 1, query: "tag:AI-Enhanced") {
          edges { node { id } }
        }
        total: products(first: 1) {
          edges { node { id } }
        }
      }
    `;

    // Can't get exact count easily, so just return instructions
    return NextResponse.json({
      message: 'Reset Products API',
      usage: 'POST /api/admin/reset-products?count=5',
      description: 'Removes AI-Enhanced tag from N products so they get reprocessed with V3 engine',
    });

  } catch (error) {
    return NextResponse.json({
      message: 'Reset Products API',
      usage: 'POST /api/admin/reset-products?count=5',
    });
  }
}
