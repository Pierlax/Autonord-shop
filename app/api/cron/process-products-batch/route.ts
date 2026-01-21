/**
 * Endpoint per processare i prodotti in batch senza QStash
 * Processa i prodotti uno alla volta chiamando direttamente il worker
 * 
 * POST /api/cron/process-products-batch
 * Body: { startIndex?: number, batchSize?: number }
 */
import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const CRON_SECRET = 'autonord-cron-2024-xK9mP2vL8nQ4';
const BASE_URL = 'https://autonord-shop.vercel.app';

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
      };
    }>;
  };
}

// Funzione per ottenere tutti i prodotti da Shopify
async function getAllProducts(): Promise<ShopifyProduct[]> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
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
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables: { cursor },
      }),
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

// Funzione per processare un singolo prodotto
async function processProduct(product: ShopifyProduct): Promise<{ success: boolean; error?: string }> {
  const payload = {
    productId: product.id,
    title: product.title,
    vendor: product.vendor,
    productType: product.productType,
    sku: product.variants.edges[0]?.node.sku || null,
    barcode: product.variants.edges[0]?.node.barcode || null,
    tags: product.tags,
  };

  try {
    const response = await fetch(`${BASE_URL}/api/workers/regenerate-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return { success: result.success, error: result.error };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown error' };
  }
}

// Funzione per attendere
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to start batch processing',
    endpoint: '/api/cron/process-products-batch',
    params: {
      startIndex: 'Index to start from (default: 0)',
      batchSize: 'Number of products to process (default: 10)',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verifica autorizzazione
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parametri
    const body = await request.json().catch(() => ({}));
    const startIndex = body.startIndex || 0;
    const batchSize = body.batchSize || 10; // Default 10 prodotti per batch

    // Ottieni tutti i prodotti da Shopify
    const allProducts = await getAllProducts();
    
    if (allProducts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No products found on Shopify',
      });
    }

    // Seleziona il batch da processare
    const endIndex = Math.min(startIndex + batchSize, allProducts.length);
    const productsToProcess = allProducts.slice(startIndex, endIndex);

    const results: Array<{ title: string; success: boolean; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    // Processa ogni prodotto con un delay di 5 secondi tra uno e l'altro
    for (let i = 0; i < productsToProcess.length; i++) {
      const product = productsToProcess[i];
      
      console.log(`Processing [${startIndex + i + 1}/${allProducts.length}]: ${product.title}`);
      
      const result = await processProduct(product);
      
      results.push({
        title: product.title,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        processed++;
      } else {
        failed++;
      }

      // Attendi 5 secondi tra ogni prodotto (tranne l'ultimo)
      if (i < productsToProcess.length - 1) {
        await sleep(5000);
      }
    }

    const hasMore = endIndex < allProducts.length;

    return NextResponse.json({
      success: true,
      message: `Batch processed: ${processed} success, ${failed} failed`,
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
    console.error('Error processing batch:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
