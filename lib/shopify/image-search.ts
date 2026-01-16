/**
 * Image Search for Product Enrichment
 * Searches for product images using SerpAPI Google Images
 */

import { loggers } from '@/lib/logger';

const log = loggers.shopify;

interface ProductSearchParams {
  title: string;
  vendor: string;
  sku: string;
  barcode?: string;
  productType?: string;
}

interface ImageSearchResult {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
}

// Brand name mapping for better search results
const BRAND_MAPPING: Record<string, string> = {
  'TECHTRONIC INDUSTRIES ITALIA SRL': 'Milwaukee',
  'MAKITA SPA': 'Makita',
  'ROBERT BOSCH SPA': 'Bosch',
  'STANLEY BLACK & DECKER ITALIA SRL': 'DeWalt',
  'HILTI ITALIA SPA': 'Hilti',
  'METABO SRL': 'Metabo',
  'FESTOOL ITALIA SRL': 'Festool',
  'HIKOKI POWER TOOLS ITALIA SPA': 'HiKOKI',
  'EINHELL ITALIA SRL': 'Einhell',
};

function getBrandName(vendor: string): string {
  return BRAND_MAPPING[vendor.toUpperCase()] || vendor;
}

/**
 * Search for product images using SerpAPI
 */
export async function searchProductImages(
  product: ProductSearchParams
): Promise<ImageSearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  
  if (!apiKey) {
    log.warn('[ImageSearch] SERPAPI_API_KEY not set, skipping image search');
    return [];
  }

  const brand = getBrandName(product.vendor);
  
  // Build search query prioritizing SKU and brand
  const searchQueries = [
    // Primary: SKU + Brand (most specific)
    `${brand} ${product.sku}`,
    // Secondary: Brand + Model from title
    `${brand} ${extractModelFromTitle(product.title)}`,
    // Tertiary: Full title
    `${product.title} ${brand}`,
  ];

  for (const query of searchQueries) {
    try {
      const results = await searchGoogleImages(query, apiKey);
      
      if (results.length > 0) {
        log.info(`[ImageSearch] Found ${results.length} images for query: "${query}"`);
        return results;
      }
    } catch (error) {
      log.error(`[ImageSearch] Error searching for "${query}":`, error);
    }
  }

  log.info(`[ImageSearch] No images found for product: ${product.title}`);
  return [];
}

/**
 * Extract model number from product title
 */
function extractModelFromTitle(title: string): string {
  // Common patterns for model numbers
  const patterns = [
    /([A-Z]{1,3}\d{2,4}[A-Z]?[-\s]?\d{0,4}[A-Z]{0,3})/i, // M18, DHP486, GBH 2-28
    /(\d{4,6})/,  // Pure numeric SKU
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Return first 3 words if no pattern matches
  return title.split(' ').slice(0, 3).join(' ');
}

/**
 * Call SerpAPI Google Images endpoint
 */
async function searchGoogleImages(
  query: string,
  apiKey: string
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({
    engine: 'google_images',
    q: query,
    api_key: apiKey,
    num: '10',
    safe: 'active',
    // Filter for product images
    tbs: 'isz:m', // Medium size images
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.images_results || data.images_results.length === 0) {
    return [];
  }

  // Filter and map results
  return data.images_results
    .filter((img: any) => {
      // Filter out low-quality or irrelevant images
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const url = img.original?.toLowerCase() || '';
      return validExtensions.some(ext => url.includes(ext));
    })
    .slice(0, 5) // Take top 5 results
    .map((img: any) => ({
      url: img.original,
      thumbnail: img.thumbnail,
      title: img.title || '',
      source: img.source || '',
    }));
}

/**
 * Validate that an image URL is accessible and returns valid image
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    
    if (!response.ok) return false;
    
    const contentType = response.headers.get('content-type');
    return contentType?.startsWith('image/') || false;
  } catch {
    return false;
  }
}

/**
 * Get the best image from search results
 * Validates URLs and returns the first working one
 */
export async function getBestProductImage(
  product: ProductSearchParams
): Promise<string | null> {
  const results = await searchProductImages(product);

  for (const result of results) {
    const isValid = await validateImageUrl(result.url);
    if (isValid) {
      log.info(`[ImageSearch] Selected image: ${result.url}`);
      return result.url;
    }
  }

  return null;
}
