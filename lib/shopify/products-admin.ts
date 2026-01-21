/**
 * Shopify Admin API for Products
 * Uses Admin API instead of Storefront API for reliable product access
 */

import { Product, EnrichedData, FAQ } from './types';
import { loggers } from '@/lib/logger';
import { parseDescriptionHtml, hasAiEnrichedContent } from './parse-description-html';

const log = loggers.shopify;

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

async function adminFetch(query: string, variables?: object) {
  if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN) {
    log.warn("Missing Shopify Admin API credentials");
    return null;
  }

  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    if (!response.ok) {
      log.error(`Shopify Admin API HTTP Error: ${response.status}`);
      return null;
    }

    const json = await response.json();

    if (json.errors) {
      log.error('Shopify Admin API Errors:', json.errors);
      return null;
    }

    return json.data;
  } catch (error) {
    log.error('Shopify Admin Fetch Error:', error);
    return null;
  }
}

/**
 * Transform Admin API product to Storefront API format
 */
function transformProduct(adminProduct: any): Product {
  const variants = adminProduct.variants?.edges?.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title || 'Default',
    availableForSale: edge.node.inventoryQuantity > 0,
    quantityAvailable: edge.node.inventoryQuantity || 0,
    sku: edge.node.sku,
    selectedOptions: [],
    price: {
      amount: edge.node.price || '0',
      currencyCode: 'EUR',
    },
    compareAtPrice: edge.node.compareAtPrice ? {
      amount: edge.node.compareAtPrice,
      currencyCode: 'EUR',
    } : null,
    image: adminProduct.featuredImage ? {
      url: adminProduct.featuredImage.url,
      altText: adminProduct.featuredImage.altText,
      width: 800,
      height: 800,
    } : null,
  })) || [];

  const images = adminProduct.images?.edges?.map((edge: any) => ({
    url: edge.node.url,
    altText: edge.node.altText || adminProduct.title,
    width: 800,
    height: 800,
  })) || [];

  return {
    id: adminProduct.id,
    handle: adminProduct.handle,
    availableForSale: adminProduct.status === 'ACTIVE',
    title: adminProduct.title,
    description: adminProduct.description || '',
    descriptionHtml: adminProduct.descriptionHtml || adminProduct.description || '',
    vendor: adminProduct.vendor || '',
    productType: adminProduct.productType || '',
    totalInventory: variants.reduce((sum: number, v: any) => sum + (v.quantityAvailable || 0), 0),
    options: [],
    priceRange: {
      maxVariantPrice: {
        amount: variants[0]?.price?.amount || '0',
        currencyCode: 'EUR',
      },
      minVariantPrice: {
        amount: variants[0]?.price?.amount || '0',
        currencyCode: 'EUR',
      },
    },
    variants: {
      edges: variants.map((v: any) => ({ node: v })),
    },
    featuredImage: images[0] || null,
    images: {
      edges: images.map((img: any) => ({ node: img })),
    },
    seo: {
      title: adminProduct.seo?.title || adminProduct.title,
      description: adminProduct.seo?.description || '',
    },
    tags: adminProduct.tags || [],
    updatedAt: adminProduct.updatedAt,
  };
}

/**
 * Get all products using Admin API
 */
export async function getProductsAdmin(): Promise<Product[]> {
  const query = `
    query GetProducts {
      products(first: 100, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            vendor
            productType
            status
            tags
            updatedAt
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  barcode
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await adminFetch(query);
  
  if (!data?.products?.edges) {
    return [];
  }

  return data.products.edges
    .filter((edge: any) => edge.node.status === 'ACTIVE')
    .map((edge: any) => transformProduct(edge.node));
}

/**
 * Get single product by handle using Admin API
 */
export async function getProductByHandleAdmin(handle: string): Promise<Product | null> {
  const query = `
    query GetProductByHandle($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            vendor
            productType
            status
            tags
            updatedAt
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  barcode
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await adminFetch(query, { query: `handle:${handle}` });
  
  if (!data?.products?.edges?.[0]?.node) {
    return null;
  }

  const product = data.products.edges[0].node;
  
  if (product.status !== 'ACTIVE') {
    return null;
  }

  return transformProduct(product);
}

/**
 * Search products using Admin API
 */
export async function searchProductsAdmin(searchQuery: string): Promise<Product[]> {
  const query = `
    query SearchProducts($query: String!) {
      products(first: 50, query: $query) {
        edges {
          node {
            id
            handle
            title
            description
            descriptionHtml
            vendor
            productType
            status
            tags
            updatedAt
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await adminFetch(query, { query: searchQuery });
  
  if (!data?.products?.edges) {
    return [];
  }

  return data.products.edges
    .filter((edge: any) => edge.node.status === 'ACTIVE')
    .map((edge: any) => transformProduct(edge.node));
}
