/**
 * Shopify Sync Module
 * 
 * Syncs parsed Danea products to Shopify via Admin API.
 * Creates new products or updates existing ones based on SKU matching.
 * Automatically publishes products to Online Store sales channel.
 */

import { ParsedProduct, ShopifyProductInput, ProductSyncResult, SyncResult } from './types';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;
const SHOPIFY_API_VERSION = '2024-01';

// Rate limiting: Shopify allows 2 requests/second for Admin API
const RATE_LIMIT_DELAY = 500; // ms between requests

/**
 * Make authenticated request to Shopify Admin API
 */
async function shopifyAdminRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    throw new Error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Make authenticated GraphQL request to Shopify Admin API
 */
async function shopifyGraphQLRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    throw new Error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify GraphQL error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

/**
 * Get the Online Store publication ID
 */
async function getOnlineStorePublicationId(): Promise<string | null> {
  try {
    const query = `
      query {
        publications(first: 10) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQLRequest<{
      publications: {
        edges: Array<{
          node: {
            id: string;
            name: string;
          };
        }>;
      };
    }>(query);

    // Find Online Store publication
    const onlineStore = data.publications.edges.find(
      edge => edge.node.name === 'Online Store'
    );

    if (onlineStore) {
      log.info(`Found Online Store publication: ${onlineStore.node.id}`);
      return onlineStore.node.id;
    }

    // If not found by name, try to find any publication
    if (data.publications.edges.length > 0) {
      const firstPub = data.publications.edges[0].node;
      log.info(`Using first available publication: ${firstPub.name} (${firstPub.id})`);
      return firstPub.id;
    }

    log.warn('No publications found');
    return null;
  } catch (error) {
    log.error('Error getting Online Store publication ID:', error);
    return null;
  }
}

/**
 * Publish a product to the Online Store sales channel
 */
async function publishProductToOnlineStore(productId: number): Promise<boolean> {
  try {
    const publicationId = await getOnlineStorePublicationId();
    
    if (!publicationId) {
      log.warn('Cannot publish product: no publication found');
      return false;
    }

    const mutation = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable {
            availablePublicationsCount {
              count
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      id: `gid://shopify/Product/${productId}`,
      input: [{ publicationId }],
    };

    const data = await shopifyGraphQLRequest<{
      publishablePublish: {
        publishable: {
          availablePublicationsCount: { count: number };
        } | null;
        userErrors: Array<{ field: string; message: string }>;
      };
    }>(mutation, variables);

    if (data.publishablePublish.userErrors.length > 0) {
      log.error('Error publishing product:', data.publishablePublish.userErrors);
      return false;
    }

    log.info(`Published product ${productId} to Online Store`);
    return true;
  } catch (error) {
    log.error(`Failed to publish product ${productId}:`, error);
    return false;
  }
}

/**
 * Find existing product by SKU
 */
async function findProductBySku(sku: string): Promise<{ id: number; variantId: number } | null> {
  try {
    const { products } = await shopifyAdminRequest<{ 
      products: Array<{ 
        id: number; 
        variants: Array<{ id: number; sku: string }> 
      }> 
    }>(`/products.json?fields=id,variants&limit=250`);

    for (const product of products) {
      const variant = product.variants?.find(v => v.sku === sku);
      if (variant) {
        return { id: product.id, variantId: variant.id };
      }
    }
    return null;
  } catch (error) {
    log.error('Error finding product by SKU:', error);
    return null;
  }
}

/**
 * Create a new product in Shopify
 */
async function createProduct(product: ShopifyProductInput): Promise<{ id: number }> {
  const { product: created } = await shopifyAdminRequest<{ product: { id: number } }>(
    '/products.json',
    'POST',
    { product }
  );
  return { id: created.id };
}

/**
 * Update an existing product in Shopify
 */
async function updateProduct(id: number, product: Partial<ShopifyProductInput>): Promise<void> {
  await shopifyAdminRequest(
    `/products/${id}.json`,
    'PUT',
    { product }
  );
}

/**
 * Convert parsed Danea product to Shopify format
 */
function toShopifyProduct(product: ParsedProduct): ShopifyProductInput {
  // Build tags from category and manufacturer
  const tags: string[] = [];
  if (product.category) tags.push(product.category);
  if (product.manufacturer) tags.push(product.manufacturer);
  
  return {
    title: product.title,
    body_html: product.description || '',
    vendor: product.manufacturer || '',
    product_type: product.category || '',
    status: product.ecommerce ? 'active' : 'draft',
    tags: tags.join(', '),
    variants: [{
      price: product.price?.toString() || '0',
      compare_at_price: product.compareAtPrice?.toString() || undefined,
      sku: product.daneaCode,
      barcode: product.barcode || undefined,
      inventory_quantity: product.quantity,
      inventory_management: 'shopify',
    }],
  };
}

/**
 * Sync a single product to Shopify
 */
export async function syncSingleProduct(product: ParsedProduct): Promise<ProductSyncResult> {
  try {
    // Check if product exists by SKU
    const existing = await findProductBySku(product.daneaCode);
    const shopifyProduct = toShopifyProduct(product);

    if (existing) {
      // Update existing product
      await updateProduct(existing.id, shopifyProduct);
      
      // Also ensure it's published to Online Store
      if (product.ecommerce) {
        await publishProductToOnlineStore(existing.id);
      }
      
      log.info(`Updated product: ${product.daneaCode} (Shopify ID: ${existing.id})`);
      return {
        daneaCode: product.daneaCode,
        success: true,
        shopifyId: existing.id.toString(),
        action: 'updated',
      };
    } else {
      // Create new product
      const created = await createProduct(shopifyProduct);
      
      // Publish to Online Store if ecommerce flag is set
      if (product.ecommerce) {
        await publishProductToOnlineStore(created.id);
      }
      
      log.info(`Created product: ${product.daneaCode} (Shopify ID: ${created.id})`);
      return {
        daneaCode: product.daneaCode,
        success: true,
        shopifyId: created.id.toString(),
        action: 'created',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to sync product ${product.daneaCode}:`, error);
    return {
      daneaCode: product.daneaCode,
      success: false,
      action: 'skipped',
      error: errorMessage,
    };
  }
}

/**
 * Sync multiple products to Shopify with rate limiting
 */
export async function syncProductsToShopify(
  products: ParsedProduct[],
  options: {
    onlyEcommerce?: boolean;
    onProgress?: (current: number, total: number, result: ProductSyncResult) => void;
  } = {}
): Promise<SyncResult> {
  const { onlyEcommerce = true, onProgress } = options;
  
  // Filter products if needed
  let toSync = products;
  if (onlyEcommerce) {
    toSync = products.filter(p => p.ecommerce);
  }

  const result: SyncResult = {
    total: toSync.length,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: products.length - toSync.length,
    results: [],
    errors: [],
  };

  log.info(`Starting sync of ${toSync.length} products to Shopify`);

  for (let i = 0; i < toSync.length; i++) {
    const product = toSync[i];
    const syncResult = await syncSingleProduct(product);
    
    result.results.push(syncResult);
    
    if (syncResult.success) {
      if (syncResult.action === 'created') result.created++;
      if (syncResult.action === 'updated') result.updated++;
    } else {
      result.failed++;
      if (syncResult.error) {
        result.errors.push(`${product.daneaCode}: ${syncResult.error}`);
      }
    }

    // Progress callback
    if (onProgress) {
      onProgress(i + 1, toSync.length, syncResult);
    }

    // Rate limiting
    if (i < toSync.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  }

  log.info(`Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);
  
  return result;
}

/**
 * Get all products from Shopify (for comparison/audit)
 */
export async function getShopifyProducts(): Promise<Array<{ id: number; sku: string; title: string }>> {
  const allProducts: Array<{ id: number; sku: string; title: string }> = [];
  let pageInfo: string | null = null;
  
  do {
    const endpoint = pageInfo 
      ? `/products.json?limit=250&page_info=${pageInfo}`
      : '/products.json?limit=250&fields=id,title,variants';
    
    const response = await shopifyAdminRequest<{ 
      products: Array<{ 
        id: number; 
        title: string;
        variants: Array<{ sku: string }> 
      }> 
    }>(endpoint);

    for (const product of response.products) {
      const sku = product.variants?.[0]?.sku || '';
      allProducts.push({
        id: product.id,
        sku,
        title: product.title,
      });
    }

    // TODO: Handle pagination with Link header
    pageInfo = null; // For now, just get first page
    
  } while (pageInfo);

  return allProducts;
}

/**
 * Import orders from Shopify for Danea export
 */
export async function getShopifyOrders(status: 'any' | 'open' | 'closed' = 'any', limit = 250): Promise<Array<{
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalPrice: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}>> {
  const { orders } = await shopifyAdminRequest<{
    orders: Array<{
      order_number: number;
      email: string;
      total_price: string;
      customer?: { first_name?: string; last_name?: string };
      line_items: Array<{
        sku: string;
        title: string;
        quantity: number;
        price: string;
      }>;
    }>;
  }>(`/orders.json?status=${status}&limit=${limit}`);

  return orders.map(order => ({
    orderNumber: order.order_number.toString(),
    customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Guest',
    customerEmail: order.email || '',
    totalPrice: order.total_price,
    items: order.line_items.map(item => ({
      sku: item.sku || '',
      title: item.title,
      quantity: item.quantity,
      price: item.price,
    })),
  }));
}

/**
 * Publish all existing products to Online Store
 * Utility function to fix products that were created before auto-publish was added
 */
export async function publishAllProductsToOnlineStore(): Promise<{ published: number; failed: number }> {
  const products = await getShopifyProducts();
  let published = 0;
  let failed = 0;

  log.info(`Publishing ${products.length} products to Online Store...`);

  for (const product of products) {
    const success = await publishProductToOnlineStore(product.id);
    if (success) {
      published++;
    } else {
      failed++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
  }

  log.info(`Published ${published} products, ${failed} failed`);
  return { published, failed };
}
