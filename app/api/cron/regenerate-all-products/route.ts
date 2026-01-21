/**
 * Endpoint per rigenerare tutte le schede prodotto
 * 
 * 1. Legge i 70 prodotti da Shopify (dati base)
 * 2. Cancella tutti i prodotti esistenti
 * 3. Accoda la rigenerazione di ogni prodotto con QStash
 * 
 * POST /api/cron/regenerate-all-products
 */

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const QSTASH_TOKEN = process.env.QSTASH_TOKEN!;
const CRON_SECRET = process.env.CRON_SECRET;
const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

// Use production URL
const BASE_URL = 'https://autonord-shop.vercel.app';

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  variants: {
    edges: Array<{
      node: {
        sku: string;
        price: string;
        compareAtPrice: string | null;
        barcode: string | null;
        inventoryQuantity: number;
      };
    }>;
  };
}

async function getAllProducts(): Promise<ShopifyProduct[]> {
  const query = `
    query {
      products(first: 100) {
        edges {
          node {
            id
            title
            vendor
            productType
            tags
            status
            variants(first: 1) {
              edges {
                node {
                  sku
                  price
                  compareAtPrice
                  barcode
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  `;
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query })
  });
  
  const data = await response.json();
  return data.data?.products?.edges?.map((e: any) => e.node) || [];
}

async function deleteProduct(productId: string): Promise<boolean> {
  const mutation = `
    mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: mutation,
      variables: { input: { id: productId } }
    })
  });
  
  const data = await response.json();
  return !!data.data?.productDelete?.deletedProductId;
}

async function deleteAllProducts(products: ShopifyProduct[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  
  for (const product of products) {
    try {
      const success = await deleteProduct(product.id);
      if (success) {
        deleted++;
        console.log(`🗑️ Deleted: ${product.title}`);
      } else {
        failed++;
        console.log(`❌ Failed to delete: ${product.title}`);
      }
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      failed++;
      console.error(`Error deleting ${product.title}:`, error);
    }
  }
  
  return { deleted, failed };
}

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('🚀 Starting product regeneration process...');
  
  try {
    // Step 1: Get all products
    console.log('📦 Fetching all products from Shopify...');
    const products = await getAllProducts();
    console.log(`   Found ${products.length} products`);
    
    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No products found to regenerate'
      }, { status: 400 });
    }
    
    // Save product data for regeneration
    const productData = products.map(p => ({
      sku: p.variants.edges[0]?.node.sku || p.id.split('/').pop(),
      title: p.title,
      vendor: p.vendor,
      productType: p.productType,
      price: p.variants.edges[0]?.node.price || '0',
      compareAtPrice: p.variants.edges[0]?.node.compareAtPrice,
      barcode: p.variants.edges[0]?.node.barcode,
      inventoryQuantity: p.variants.edges[0]?.node.inventoryQuantity || 0,
      tags: p.tags
    }));
    
    // Step 2: Delete all existing products
    console.log('🗑️ Deleting all existing products...');
    const deleteResult = await deleteAllProducts(products);
    console.log(`   Deleted: ${deleteResult.deleted}, Failed: ${deleteResult.failed}`);
    
    // Step 3: Queue regeneration for each product
    console.log('📤 Queueing product regeneration with QStash...');
    const qstash = new Client({ token: QSTASH_TOKEN });
    
    let queued = 0;
    let queueFailed = 0;
    
    for (let i = 0; i < productData.length; i++) {
      const product = productData[i];
      
      try {
        // Queue with delay to avoid rate limiting
        // Each product gets 90 seconds delay (Claude + SerpAPI + Shopify)
        await qstash.publishJSON({
          url: `${BASE_URL}/api/workers/regenerate-product`,
          body: product,
          delay: i * 90 // 90 seconds between each product
        });
        
        console.log(`✅ Queued [${i + 1}/${productData.length}]: ${product.title}`);
        queued++;
        
      } catch (error) {
        console.error(`❌ Failed to queue [${i + 1}]: ${error}`);
        queueFailed++;
      }
    }
    
    const estimatedMinutes = Math.ceil((queued * 90) / 60);
    
    return NextResponse.json({
      success: true,
      message: `Product regeneration started`,
      summary: {
        totalProducts: products.length,
        deleted: deleteResult.deleted,
        deleteFailed: deleteResult.failed,
        queued,
        queueFailed,
        estimatedCompletionMinutes: estimatedMinutes
      }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  // Get current product count
  try {
    const products = await getAllProducts();
    return NextResponse.json({
      message: 'Use POST to start product regeneration',
      currentProductCount: products.length,
      warning: 'This will DELETE all existing products and regenerate them with AI',
      estimatedTimeMinutes: Math.ceil((products.length * 90) / 60)
    });
  } catch (error) {
    return NextResponse.json({
      message: 'Use POST to start product regeneration',
      error: 'Could not fetch product count'
    });
  }
}
