/**
 * Endpoint per accodare prodotti in batch su QStash con delay distribuito
 *
 * POST /api/cron/process-products-batch
 * Body: { startIndex?: number, batchSize?: number }
 *
 * Ogni prodotto viene pubblicato su QStash con delay = (startIndex + localIndex) * 30s
 * in modo che prodotti di batch diversi non collidano e restino sotto i 15 RPM di Gemini.
 *
 * L'endpoint risponde immediatamente (< 5s) con la lista dei job accodati.
 * L'effettivo processing avviene in modo asincrono tramite il worker /api/workers/regenerate-product.
 */
import { NextRequest, NextResponse } from 'next/server';
import { env, optionalEnv, fromShopifyGid } from '@/lib/env';
import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getBaseUrl(request?: Request): string {
  if (request) {
    return new URL(request.url).origin;
  }
  return optionalEnv.NEXT_PUBLIC_BASE_URL || 'https://autonord-shop.vercel.app';
}

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  variants: {
    edges: Array<{
      node: {
        sku: string | null;
        barcode: string | null;
        price: string;
      };
    }>;
  };
  images: {
    edges: Array<{ node: { id: string } }>;
  };
}

async function getAllProducts(): Promise<ShopifyProduct[]> {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'autonord-service.myshopify.com';
  const url = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              vendor
              productType
              tags
              variants(first: 1) {
                edges {
                  node {
                    sku
                    barcode
                    price
                  }
                }
              }
              images(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response: Response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });

    const result = await response.json();

    if (result.data?.products?.edges) {
      for (const edge of result.data.products.edges) {
        products.push(edge.node);
      }
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = result.data.products.pageInfo.endCursor;
    } else {
      hasNextPage = false;
    }
  }

  return products;
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to start batch processing',
    endpoint: '/api/cron/process-products-batch',
    params: {
      startIndex: 'Index to start from (default: 0)',
      batchSize: 'Number of products to queue (default: 10)',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const startIndex: number = body.startIndex || 0;
    const batchSize: number = body.batchSize || 10;

    const allProducts = await getAllProducts();

    if (allProducts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No products found on Shopify',
      });
    }

    const endIndex = Math.min(startIndex + batchSize, allProducts.length);
    const productsToProcess = allProducts.slice(startIndex, endIndex);

    const baseUrl = getBaseUrl(request);

    // Queue each product to QStash with a globally-offset delay so batches don't collide.
    // delay = (startIndex + localIndex) * 30s ensures 30s between every two consecutive workers,
    // keeping Gemini usage well under 15 RPM regardless of batch boundaries.
    const results: Array<{ title: string; success: boolean; error?: string; delaySeconds?: number }> = [];
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < productsToProcess.length; i++) {
      const product = productsToProcess[i];
      const globalIndex = startIndex + i;
      const delaySeconds = globalIndex * 30;

      const job: EnrichmentJob = {
        productId: fromShopifyGid(product.id),
        productGid: product.id,
        title: product.title,
        vendor: product.vendor || '',
        sku: product.variants.edges[0]?.node.sku || '',
        price: product.variants.edges[0]?.node.price || '0',
        productType: product.productType || '',
        tags: product.tags || [],
        hasImages: product.images.edges.length > 0,
        receivedAt: new Date().toISOString(),
      };

      const result = await queueProductEnrichment(job, baseUrl, { delaySeconds });

      results.push({
        title: product.title,
        success: result.queued,
        error: result.queued ? undefined : result.error,
        delaySeconds,
      });

      if (result.queued) {
        processed++;
      } else {
        failed++;
      }
    }

    const hasMore = endIndex < allProducts.length;

    return NextResponse.json({
      success: true,
      message: `Batch queued: ${processed} scheduled, ${failed} failed`,
      summary: {
        totalProducts: allProducts.length,
        batchStart: startIndex,
        batchEnd: endIndex,
        processed,
        failed,
        hasMore,
        nextStartIndex: hasMore ? endIndex : null,
      },
      results,
    });

  } catch (error) {
    console.error('[process-products-batch] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
