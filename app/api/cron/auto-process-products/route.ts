// Vercel Pro: Allow up to 300 seconds for AI pipeline
export const maxDuration = 300;

/**
 * Cron Job per processare automaticamente i prodotti
 * Viene eseguito ogni 15 minuti da Vercel Cron
 * Processa 3 prodotti per volta per stare nei limiti di timeout
 * 
 * Tiene traccia del progresso usando i tag dei prodotti:
 * - Prodotti già processati hanno il tag "AI-Enhanced"
 * - Processa solo prodotti senza questo tag
 * 
 * SECURITY HARDENING (Phase 1):
 * - Removed hardcoded CRON_SECRET fallback
 * - Uses centralized env validation from lib/env.ts
 * - Uses VERCEL_URL for dynamic base URL
 */
import { NextRequest, NextResponse } from 'next/server';
import { env, optionalEnv } from '@/lib/env';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = env.SHOPIFY_ADMIN_ACCESS_TOKEN;

function getBaseUrl(): string {
  if (optionalEnv.VERCEL_URL) {
    return `https://${optionalEnv.VERCEL_URL}`;
  }
  return optionalEnv.NEXT_PUBLIC_BASE_URL || 'https://autonord-shop.vercel.app';
}

// Numero di prodotti da processare per ogni esecuzione del cron
// 1 prodotto per run perché Claude con ricerca web richiede ~2-3 minuti
const PRODUCTS_PER_RUN = 1;

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

// Funzione per ottenere prodotti NON ancora processati (senza tag AI-Enhanced)
async function getUnprocessedProducts(limit: number): Promise<ShopifyProduct[]> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  // Query per ottenere prodotti NON ancora processati (senza tag AI-Enhanced, TAYA, scheda arricchita)
  const query = `
    query getUnprocessedProducts {
      products(first: ${limit}, query: "NOT tag:AI-Enhanced AND NOT tag:TAYA AND NOT tag:'TAYA-V5'") {
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
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  
  if (result.data?.products?.edges) {
    return result.data.products.edges.map((edge: any) => edge.node);
  }
  
  return [];
}

// Funzione per contare tutti i prodotti e quelli già processati
async function getProductStats(): Promise<{ total: number; processed: number; remaining: number }> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;
  
  // Query per contare tutti i prodotti
  const totalQuery = `
    query countAll {
      productsCount {
        count
      }
    }
  `;
  
  // Query per contare prodotti processati (AI-Enhanced, TAYA, o TAYA-V5)
  const processedQuery = `
    query countProcessed {
      productsCount(query: "tag:AI-Enhanced OR tag:TAYA OR tag:'TAYA-V5'") {
        count
      }
    }
  `;

  const [totalRes, processedRes] = await Promise.all([
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: totalQuery }),
    }),
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: processedQuery }),
    }),
  ]);

  const totalResult = await totalRes.json();
  const processedResult = await processedRes.json();

  const total = totalResult.data?.productsCount?.count || 0;
  const processed = processedResult.data?.productsCount?.count || 0;

  return {
    total,
    processed,
    remaining: total - processed,
  };
}

// Funzione per processare un singolo prodotto
async function processProduct(product: ShopifyProduct): Promise<{ success: boolean; error?: string; newTitle?: string }> {
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
    const response = await fetch(`${getBaseUrl()}/api/workers/regenerate-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CRON_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return { 
      success: result.success, 
      error: result.error,
      newTitle: result.newTitle,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown error' };
  }
}

// Funzione per attendere
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  // Verifica autorizzazione per Vercel Cron
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronHeader = request.headers.get('x-vercel-cron-secret');
  
  const isAuthorized = 
    authHeader === `Bearer ${env.CRON_SECRET}` ||
    querySecret === env.CRON_SECRET ||
    !!cronHeader;

  if (!isAuthorized) {
    // Permetti accesso per vedere lo stato (senza processare)
    const stats = await getProductStats();
    return NextResponse.json({
      message: 'Auto-process cron job status (read-only, auth required to process)',
      stats,
      nextRun: 'Every 2 hours',
      productsPerRun: PRODUCTS_PER_RUN,
    });
  }

  // Esegui il processamento
  return handleProcessing();
}

export async function POST(request: NextRequest) {
  // Verifica autorizzazione con CRON_SECRET da env
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleProcessing();
}

async function handleProcessing() {
  try {
    // Ottieni statistiche
    const stats = await getProductStats();
    
    if (stats.remaining === 0) {
      return NextResponse.json({
        success: true,
        message: 'All products have been processed!',
        stats,
      });
    }

    // Ottieni prodotti da processare
    const products = await getUnprocessedProducts(PRODUCTS_PER_RUN);
    
    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unprocessed products found',
        stats,
      });
    }

    const results: Array<{ title: string; success: boolean; newTitle?: string; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    // Processa ogni prodotto
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      console.log(`[Cron] Processing: ${product.title}`);
      
      const result = await processProduct(product);
      
      results.push({
        title: product.title,
        success: result.success,
        newTitle: result.newTitle,
        error: result.error,
      });

      if (result.success) {
        processed++;
      } else {
        failed++;
      }

      // Attendi 3 secondi tra ogni prodotto (tranne l'ultimo)
      if (i < products.length - 1) {
        await sleep(3000);
      }
    }

    // Aggiorna statistiche dopo il processamento
    const newStats = await getProductStats();

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} products, ${failed} failed`,
      stats: newStats,
      results,
      estimatedTimeRemaining: `${Math.ceil(newStats.remaining / PRODUCTS_PER_RUN) * 15} minutes`,
    });

  } catch (error) {
    console.error('[Cron] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
