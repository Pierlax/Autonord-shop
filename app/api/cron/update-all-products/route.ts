/**
 * Endpoint per aggiornare tutte le schede prodotto esistenti
 * Legge i prodotti da Shopify e accoda l'aggiornamento con QStash
 */
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN!;

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

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to start product update',
    endpoint: '/api/cron/update-all-products',
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verifica autorizzazione
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ottieni tutti i prodotti da Shopify
    const products = await getAllProducts();
    
    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No products found on Shopify',
      });
    }

    // Inizializza QStash
    const qstash = new Client({ token: QSTASH_TOKEN });
    
    // URL del worker
    const workerUrl = `${BASE_URL}/api/workers/regenerate-product`;

    let queued = 0;
    let failed = 0;
    let firstError: string | null = null;

    // Accoda ogni prodotto con un delay progressivo (120 secondi tra uno e l'altro)
    // per dare tempo a Claude di fare le ricerche web
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const delay = i * 120; // 2 minuti tra ogni prodotto

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
        await qstash.publishJSON({
          url: workerUrl,
          body: payload,
          delay: delay,
          retries: 2,
        });
        queued++;
      } catch (e: any) {
        console.error(`Failed to queue product ${product.title}:`, e?.message || e);
        // Capture first error for debugging
        if (failed === 0) {
          firstError = e?.message || String(e);
        }
        failed++;
      }
    }

    const estimatedMinutes = Math.ceil((products.length * 120) / 60);

    return NextResponse.json({
      success: true,
      message: 'Product update started',
      summary: {
        totalProducts: products.length,
        queued,
        queueFailed: failed,
        firstError: firstError,
        delayBetweenProducts: '120 seconds',
        estimatedCompletionMinutes: estimatedMinutes,
      },
    });

  } catch (error) {
    console.error('Error starting product update:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
