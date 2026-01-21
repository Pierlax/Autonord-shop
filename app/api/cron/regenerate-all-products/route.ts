/**
 * Endpoint per rigenerare tutte le schede prodotto
 * 
 * 1. Usa i dati dal backup dei prodotti originali
 * 2. Accoda la rigenerazione di ogni prodotto con QStash
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

// Backup dei 70 prodotti originali da Danea
const PRODUCTS_BACKUP = [
  { sku: "0411", title: "0411", vendor: "autonord-service", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459783", title: "ADAT.1/2\"a 1/4\" 50mm 1pz xbit", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471828", title: "ADAT.1/2\"Q.1/4\"ES.50mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471829", title: "ADAT.1/2\"Q.3/4\"Q.50mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932498628", title: "ACCETTA 40 CM ACCETTA 40 CM", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932498629", title: "ACCETTA 66 CM ACCETTA 66 CM", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471830", title: "ADAT.HEX 1/4\"a 1/2\" 50mm SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932352462", title: "ADATT.ANGOL.COMP.1/2\"QUADRO", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471831", title: "ADAT.HEX 1/4\"a 3/8\" 50mm SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932430853", title: "ADATT.MAGN.1/4\"ES.60mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932430855", title: "ADATT.MAGN.1/4\"ES.150mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932352460", title: "ADATT.MAGN.1/4\"ES.300mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459398", title: "ADATT.MAGN.1/4\"ES.60mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459399", title: "ADATT.MAGN.1/4\"ES.150mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932352461", title: "ADATT.MAGN.1/4\"ES.300mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472063", title: "ADATT.MAGN.1/4\"ES.75mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472064", title: "ADATT.MAGN.1/4\"ES.150mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472065", title: "ADATT.MAGN.1/4\"ES.300mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932430854", title: "ADATT.MAGN.1/4\"ES.75mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459784", title: "ADATT.MAGN.1/4\"ES.75mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459785", title: "ADATT.MAGN.1/4\"ES.150mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459786", title: "ADATT.MAGN.1/4\"ES.300mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472066", title: "ADATT.MAGN.1/4\"ES.75mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464067", title: "ADATT.RAPIDO 1/4\"ES.60mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464068", title: "ADATT.RAPIDO 1/4\"ES.150mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459787", title: "ADATT.RAPIDO 1/4\"ES.60mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459788", title: "ADATT.RAPIDO 1/4\"ES.150mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459789", title: "ADATT.RAPIDO 1/4\"ES.300mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464069", title: "ADATT.RAPIDO 1/4\"ES.300mm 1pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472067", title: "ADATT.RAPIDO 1/4\"ES.60mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472068", title: "ADATT.RAPIDO 1/4\"ES.150mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472069", title: "ADATT.RAPIDO 1/4\"ES.300mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472070", title: "ADATT.RAPIDO 1/4\"ES.60mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472071", title: "ADATT.RAPIDO 1/4\"ES.150mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472072", title: "ADATT.RAPIDO 1/4\"ES.300mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471824", title: "ADATT.TILT.1/4\"ES.60mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471825", title: "ADATT.TILT.1/4\"ES.90mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471826", title: "ADATT.TILT.1/4\"ES.150mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932471827", title: "ADATT.TILT.1/4\"ES.300mm 1pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932352463", title: "ADATT.UNIV.COMP.1/2\"QUADRO", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464070", title: "ADATT.x BUSSOLE 3/8\"Q.1/4\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464071", title: "ADATT.x BUSSOLE 1/2\"Q.1/4\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932464072", title: "ADATT.x BUSSOLE 1/4\"Q.1/4\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459790", title: "ADATT.x BUSSOLE 1/2\"Q.1/4\"ES.50mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459791", title: "ADATT.x BUSSOLE 3/8\"Q.1/4\"ES.50mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459792", title: "ADATT.x BUSSOLE 1/4\"Q.1/4\"ES.50mm 10pz", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472073", title: "ADATT.x BUSSOLE 1/4\"Q.1/4\"ES.50mm SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472074", title: "ADATT.x BUSSOLE 3/8\"Q.1/4\"ES.50mm SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472075", title: "ADATT.x BUSSOLE 1/2\"Q.1/4\"ES.50mm SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472076", title: "ADATT.x BUSSOLE 1/4\"Q.1/4\"ES.50mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472077", title: "ADATT.x BUSSOLE 3/8\"Q.1/4\"ES.50mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932472078", title: "ADATT.x BUSSOLE 1/2\"Q.1/4\"ES.50mm 10pz SHKW", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459793", title: "ADATT.x BUSSOLE 1/4\"Q.3/8\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459794", title: "ADATT.x BUSSOLE 3/8\"Q.3/8\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459795", title: "ADATT.x BUSSOLE 1/2\"Q.3/8\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459796", title: "ADATT.x BUSSOLE 1/4\"Q.1/2\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459797", title: "ADATT.x BUSSOLE 3/8\"Q.1/2\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932459798", title: "ADATT.x BUSSOLE 1/2\"Q.1/2\"ES.50mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4932352080", title: "MANOMETRO x COMPRESSORE", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479767", title: "M12 FUEL SEGA CIRCOLARE 140mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479768", title: "M12 FUEL SEGA CIRCOLARE 140mm KIT", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479769", title: "M18 FUEL SEGA CIRCOLARE 165mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479770", title: "M18 FUEL SEGA CIRCOLARE 165mm KIT", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479771", title: "M18 FUEL SEGA CIRCOLARE 190mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479772", title: "M18 FUEL SEGA CIRCOLARE 190mm KIT", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479773", title: "M18 FUEL SEGA CIRCOLARE 210mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479774", title: "M18 FUEL SEGA CIRCOLARE 210mm KIT", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479775", title: "MX FUEL SEGA CIRCOLARE 355mm", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
  { sku: "4933479776", title: "MX FUEL SEGA CIRCOLARE 355mm KIT", vendor: "TECHTRONIC INDUSTRIES ITALIA SRL", productType: "", price: "0.00", inventoryQuantity: 0 },
];

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
    // Step 1: Delete any existing products
    console.log('📦 Checking for existing products...');
    const existingProducts = await getAllProducts();
    
    if (existingProducts.length > 0) {
      console.log(`🗑️ Deleting ${existingProducts.length} existing products...`);
      const deleteResult = await deleteAllProducts(existingProducts);
      console.log(`   Deleted: ${deleteResult.deleted}, Failed: ${deleteResult.failed}`);
    }
    
    // Step 2: Use backup data for regeneration
    console.log(`📋 Using backup data: ${PRODUCTS_BACKUP.length} products`);
    
    // Step 3: Queue regeneration for each product
    console.log('📤 Queueing product regeneration with QStash...');
    const qstash = new Client({ token: QSTASH_TOKEN });
    
    let queued = 0;
    let queueFailed = 0;
    
    for (let i = 0; i < PRODUCTS_BACKUP.length; i++) {
      const product = PRODUCTS_BACKUP[i];
      
      try {
        // Queue with delay to avoid rate limiting
        // Each product gets 90 seconds delay (Claude + SerpAPI + Shopify)
        await qstash.publishJSON({
          url: `${BASE_URL}/api/workers/regenerate-product`,
          body: {
            ...product,
            barcode: null,
            compareAtPrice: null,
            tags: []
          },
          delay: i * 90 // 90 seconds between each product
        });
        
        console.log(`✅ Queued [${i + 1}/${PRODUCTS_BACKUP.length}]: ${product.sku} - ${product.title}`);
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
        totalProducts: PRODUCTS_BACKUP.length,
        existingDeleted: existingProducts.length,
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
      backupProductCount: PRODUCTS_BACKUP.length,
      warning: 'This will DELETE all existing products and regenerate them with AI',
      estimatedTimeMinutes: Math.ceil((PRODUCTS_BACKUP.length * 90) / 60)
    });
  } catch (error) {
    return NextResponse.json({
      message: 'Use POST to start product regeneration',
      backupProductCount: PRODUCTS_BACKUP.length,
      error: 'Could not fetch current product count'
    });
  }
}
