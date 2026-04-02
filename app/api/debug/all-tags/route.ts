/**
 * Debug API: List ALL product tags from Shopify
 * 
 * Returns every product with its tags, plus a summary of all unique tags found.
 * Useful for understanding what tags exist before running a reset.
 * 
 * GET /api/debug/all-tags
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

async function shopifyGraphQL(query: string, variables?: Record<string, unknown>) {
  if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN) {
    throw new Error('Missing Shopify credentials');
  }

  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
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

export async function GET(request: NextRequest) {
  try {
    // Fetch ALL products with pagination
    const allProducts: { id: string; title: string; tags: string[]; handle: string }[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetAllProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
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

      const variables: Record<string, unknown> = { first: 250 };
      if (cursor) variables.after = cursor;

      const result = await shopifyGraphQL(query, variables);
      const edges = result.data?.products?.edges || [];

      for (const edge of edges) {
        allProducts.push(edge.node);
        cursor = edge.cursor;
      }

      hasNextPage = result.data?.products?.pageInfo?.hasNextPage || false;
    }

    // Analyze tags
    const tagCounts: Record<string, number> = {};
    const productsWithTags: { title: string; handle: string; tags: string[] }[] = [];

    for (const product of allProducts) {
      productsWithTags.push({
        title: product.title,
        handle: product.handle,
        tags: product.tags,
      });

      for (const tag of product.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // Sort tags by count (descending)
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    // Find AI-related tags specifically
    const aiRelatedTags = sortedTags.filter(({ tag }) => {
      const lower = tag.toLowerCase();
      return lower.includes('ai') 
        || lower.includes('enhanced') 
        || lower.includes('enriched')
        || lower.includes('arricchit')
        || lower.includes('taya')
        || lower.includes('scheda');
    });

    return NextResponse.json({
      totalProducts: allProducts.length,
      totalUniqueTags: sortedTags.length,
      aiRelatedTags,
      allUniqueTags: sortedTags,
      products: productsWithTags,
    });

  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
