/**
 * Admin Dashboard API — Stato Servizi, Statistiche e Test Arricchimento
 * 
 * GET  /api/admin/dashboard           → Stato servizi + statistiche prodotti
 * POST /api/admin/dashboard/test      → Test arricchimento di un prodotto specifico
 * 
 * Protetto da CRON_SECRET (Bearer token) o ADMIN_SECRET (query param).
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// =============================================================================
// AUTH
// =============================================================================

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;

  // Bearer token
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  
  // Query param
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (cronSecret && secret === cronSecret) return true;
  if (adminSecret && secret === adminSecret) return true;

  // Dev mode
  if (process.env.NODE_ENV === 'development') return true;

  return false;
}

// =============================================================================
// SERVICE HEALTH CHECKS
// =============================================================================

interface ServiceStatus {
  name: string;
  status: 'connected' | 'error' | 'not_configured';
  latencyMs?: number;
  details?: string;
}

async function checkShopify(): Promise<ServiceStatus> {
  const store = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  
  if (!store || !token) {
    return { name: 'Shopify', status: 'not_configured', details: 'Missing credentials' };
  }

  const start = Date.now();
  try {
    const res = await fetch(`https://${store}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });
    const latencyMs = Date.now() - start;
    
    if (res.ok) {
      const data = await res.json();
      return { 
        name: 'Shopify', 
        status: 'connected', 
        latencyMs,
        details: `Store: ${data.data?.shop?.name || store}` 
      };
    }
    return { name: 'Shopify', status: 'error', latencyMs, details: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Shopify', status: 'error', latencyMs: Date.now() - start, details: String(err) };
  }
}

async function checkGemini(): Promise<ServiceStatus> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    return { name: 'Gemini AI', status: 'not_configured', details: 'Missing GOOGLE_AI_API_KEY' };
  }

  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    );
    const latencyMs = Date.now() - start;
    
    if (res.ok) {
      return { name: 'Gemini AI', status: 'connected', latencyMs, details: 'API key valid' };
    }
    return { name: 'Gemini AI', status: 'error', latencyMs, details: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Gemini AI', status: 'error', latencyMs: Date.now() - start, details: String(err) };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    return { name: 'Redis (Upstash)', status: 'not_configured', details: 'Missing UPSTASH credentials' };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latencyMs = Date.now() - start;
    
    if (res.ok) {
      return { name: 'Redis (Upstash)', status: 'connected', latencyMs, details: 'PONG received' };
    }
    return { name: 'Redis (Upstash)', status: 'error', latencyMs, details: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Redis (Upstash)', status: 'error', latencyMs: Date.now() - start, details: String(err) };
  }
}

async function checkQStash(): Promise<ServiceStatus> {
  const token = process.env.QSTASH_TOKEN;
  
  if (!token) {
    return { name: 'QStash', status: 'not_configured', details: 'Missing QSTASH_TOKEN' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://qstash.upstash.io/v2/topics', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latencyMs = Date.now() - start;
    
    if (res.ok) {
      return { name: 'QStash', status: 'connected', latencyMs, details: 'Token valid' };
    }
    return { name: 'QStash', status: 'error', latencyMs, details: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'QStash', status: 'error', latencyMs: Date.now() - start, details: String(err) };
  }
}

// =============================================================================
// SHOPIFY PRODUCT STATS
// =============================================================================

interface ProductStats {
  totalProducts: number;
  enrichedProducts: number;
  pendingProducts: number;
  enrichmentRate: string;
}

async function getProductStats(): Promise<ProductStats> {
  const store = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  
  if (!store || !token) {
    return { totalProducts: 0, enrichedProducts: 0, pendingProducts: 0, enrichmentRate: '0%' };
  }

  const url = `https://${store}/admin/api/2024-01/graphql.json`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  };

  // Count total products
  const totalRes = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ query: '{ productsCount { count } }' }),
  });
  const totalData = await totalRes.json();
  const total = totalData.data?.productsCount?.count || 0;

  // Count enriched products (with TAYA or AI-Enhanced tag)
  const enrichedRes = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ 
      query: '{ productsCount(query: "tag:TAYA OR tag:AI-Enhanced OR tag:\'TAYA-V5\'") { count } }' 
    }),
  });
  const enrichedData = await enrichedRes.json();
  const enriched = enrichedData.data?.productsCount?.count || 0;

  const pending = total - enriched;
  const rate = total > 0 ? `${Math.round((enriched / total) * 100)}%` : '0%';

  return {
    totalProducts: total,
    enrichedProducts: enriched,
    pendingProducts: pending,
    enrichmentRate: rate,
  };
}

// =============================================================================
// GET: Dashboard data
// =============================================================================

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Run all health checks in parallel
    const [shopify, gemini, redis, qstash] = await Promise.all([
      checkShopify(),
      checkGemini(),
      checkRedis(),
      checkQStash(),
    ]);

    // Get product stats
    const productStats = await getProductStats();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      services: [shopify, gemini, redis, qstash],
      productStats,
      pipeline: {
        version: 'V5.1 — Fix Architetturale',
        flow: 'UniversalRAG → TwoPhaseQA → AI Enrichment V3.1 → TAYA Police → Shopify',
        description: 'V3 ora usa dati reali da RAG+QA, nessuna ricerca autonoma',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// =============================================================================
// POST: Test arricchimento di un prodotto
// =============================================================================

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { productId } = body as { productId: string };

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    // Fetch product from Shopify
    const store = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    if (!store || !token) {
      return NextResponse.json({ error: 'Missing Shopify credentials' }, { status: 500 });
    }

    // Normalize product ID
    const gid = productId.startsWith('gid://') 
      ? productId 
      : `gid://shopify/Product/${productId}`;

    const productQuery = `
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          vendor
          productType
          tags
          handle
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
    `;

    const productRes = await fetch(`https://${store}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: productQuery, variables: { id: gid } }),
    });

    const productData = await productRes.json();
    const product = productData.data?.product;

    if (!product) {
      return NextResponse.json({ error: `Product not found: ${gid}` }, { status: 404 });
    }

    const variant = product.variants?.edges?.[0]?.node;

    // Trigger the regenerate-product worker
    // IMPORTANT: Non usare VERCEL_URL — punta al deployment specifico con Deployment Protection
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://autonord-shop.vercel.app';

    const workerPayload = {
      id: product.id,
      title: product.title,
      vendor: product.vendor || '',
      product_type: product.productType || '',
      tags: product.tags?.join(', ') || '',
      variants: variant ? [{
        sku: variant.sku || null,
        barcode: variant.barcode || null,
      }] : [],
    };

    const workerRes = await fetch(`${baseUrl}/api/workers/regenerate-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workerPayload),
    });

    const workerResult = await workerRes.json();

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        title: product.title,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        handle: product.handle,
        sku: variant?.sku,
        barcode: variant?.barcode,
      },
      workerResponse: workerResult,
      message: `Arricchimento avviato per "${product.title}"`,
    });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
