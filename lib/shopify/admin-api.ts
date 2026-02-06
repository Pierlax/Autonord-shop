/**
 * Shopify Admin API Integration
 * For updating product metafields, tags, and images
 */

import { EnrichedProductData } from './webhook-types';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

const SHOPIFY_ADMIN_API_VERSION = '2024-01';

interface ShopifyAdminConfig {
  shopDomain: string;
  accessToken: string;
}

function getConfig(): ShopifyAdminConfig {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error('Missing Shopify Admin API configuration');
  }

  return { shopDomain, accessToken };
}

/**
 * Make a request to the Shopify Admin API
 */
async function shopifyAdminRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> {
  const { shopDomain, accessToken } = getConfig();
  
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Admin API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Update product with enriched content
 * Does NOT touch title or price (managed by gestionale)
 */
export async function updateProductWithEnrichedContent(
  productId: number,
  enrichedData: EnrichedProductData,
  formattedHtml: string,
  currentTags: string
): Promise<void> {
  // Step 1: Update the product body_html and add AI-Enhanced tag
  const newTags = currentTags
    ? `${currentTags}, AI-Enhanced`
    : 'AI-Enhanced';

  await shopifyAdminRequest(`/products/${productId}.json`, 'PUT', {
    product: {
      id: productId,
      body_html: formattedHtml,
      tags: newTags,
    },
  });

  log.info(`[Enrichment] Updated product ${productId} body_html and tags`);

  // Step 2: Create/Update metafields for structured data
  await createOrUpdateMetafield(productId, 'custom', 'pros', JSON.stringify(enrichedData.pros));
  await createOrUpdateMetafield(productId, 'custom', 'cons', JSON.stringify(enrichedData.cons));
  await createOrUpdateMetafield(productId, 'custom', 'faqs', JSON.stringify(enrichedData.faqs));
  await createOrUpdateMetafield(productId, 'custom', 'ai_description', enrichedData.description);

  log.info(`[Enrichment] Created metafields for product ${productId}`);
}

/**
 * Create or update a product metafield
 */
async function createOrUpdateMetafield(
  productId: number,
  namespace: string,
  key: string,
  value: string
): Promise<void> {
  // First, try to get existing metafield
  const existingResponse = await shopifyAdminRequest<{ metafields: Array<{ id: number }> }>(
    `/products/${productId}/metafields.json?namespace=${namespace}&key=${key}`
  );

  const existingMetafield = existingResponse.metafields?.[0];

  if (existingMetafield) {
    // Update existing metafield
    await shopifyAdminRequest(`/metafields/${existingMetafield.id}.json`, 'PUT', {
      metafield: {
        id: existingMetafield.id,
        value,
        type: key === 'ai_description' ? 'single_line_text_field' : 'json',
      },
    });
  } else {
    // Create new metafield
    await shopifyAdminRequest(`/products/${productId}/metafields.json`, 'POST', {
      metafield: {
        namespace,
        key,
        value,
        type: key === 'ai_description' ? 'single_line_text_field' : 'json',
      },
    });
  }
}

/**
 * Check if product is already enriched (has AI-Enhanced or 'scheda arricchita' tag)
 */
export function isProductAlreadyEnriched(tags: string): boolean {
  const tagsLower = tags.toLowerCase();
  return tagsLower.includes('ai-enhanced') || tagsLower.includes('scheda arricchita');
}

/**
 * Get product by ID to verify current state
 */
export async function getProductById(productId: number): Promise<{
  id: number;
  title: string;
  tags: string;
  body_html: string | null;
  images: Array<{ id: number; src: string; position: number }>;
}> {
  const response = await shopifyAdminRequest<{ product: any }>(
    `/products/${productId}.json?fields=id,title,tags,body_html,images`
  );
  return response.product;
}

/**
 * Check if product has any images
 */
export async function productHasImages(productId: number): Promise<boolean> {
  const product = await getProductById(productId);
  return product.images && product.images.length > 0;
}

/**
 * Add image to product from external URL
 * Shopify will download and host the image automatically
 */
export async function addProductImage(
  productId: number,
  imageUrl: string,
  altText?: string,
  position: number = 1
): Promise<{ id: number; src: string }> {
  log.info(`[ImageUpload] Adding image to product ${productId}: ${imageUrl}`);

  const response = await shopifyAdminRequest<{ image: { id: number; src: string } }>(
    `/products/${productId}/images.json`,
    'POST',
    {
      image: {
        src: imageUrl,
        alt: altText || '',
        position,
      },
    }
  );

  log.info(`[ImageUpload] Successfully added image ${response.image.id} to product ${productId}`);
  return response.image;
}

/**
 * Add multiple images to a product
 */
export async function addProductImages(
  productId: number,
  imageUrls: string[],
  productTitle?: string
): Promise<number> {
  let successCount = 0;

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      await addProductImage(
        productId,
        imageUrls[i],
        productTitle ? `${productTitle} - Immagine ${i + 1}` : undefined,
        i + 1
      );
      successCount++;
      
      // Small delay to avoid rate limiting
      if (i < imageUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      log.error(`[ImageUpload] Failed to add image ${i + 1}:`, error);
    }
  }

  return successCount;
}

/**
 * Delete all images from a product (use with caution)
 */
export async function deleteAllProductImages(productId: number): Promise<void> {
  const product = await getProductById(productId);
  
  for (const image of product.images) {
    try {
      await shopifyAdminRequest(
        `/products/${productId}/images/${image.id}.json`,
        'DELETE'
      );
      log.info(`[ImageUpload] Deleted image ${image.id} from product ${productId}`);
    } catch (error) {
      log.error(`[ImageUpload] Failed to delete image ${image.id}:`, error);
    }
  }
}
