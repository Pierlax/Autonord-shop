/**
 * Shared product image upload utility for Shopify.
 *
 * Always uploads via STAGED UPLOAD (Shopify CDN), with automatic fallback
 * to `originalSource` (URL reference) if the binary download or staging fails.
 *
 * Why staged upload instead of originalSource:
 * - Avoids broken images if the source URL changes, goes offline, or applies
 *   anti-hotlink protection (common on brand/supplier sites).
 * - Images are permanently hosted on Shopify CDN with native optimizations.
 * - Consistent delivery quality regardless of the source server.
 *
 * Use this function everywhere in the codebase instead of calling
 * `productCreateMedia` with `originalSource` directly.
 */

import { env, toShopifyGid } from '@/lib/env';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const API_URL = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;

function shopifyHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  };
}

// =============================================================================
// INTERNAL: attach image by external URL (originalSource)
// =============================================================================

/**
 * Last-resort fallback: attach an image to a product via external URL.
 * Shopify will attempt to fetch it asynchronously — no CDN guarantee.
 */
async function addProductImageByUrl(
  normalizedGid: string,
  imageUrl: string,
  altText: string
): Promise<void> {
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id alt } }
        mediaUserErrors { field message }
      }
    }
  `;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: shopifyHeaders(),
      body: JSON.stringify({
        query: mutation,
        variables: {
          productId: normalizedGid,
          media: [{ originalSource: imageUrl, alt: altText, mediaContentType: 'IMAGE' }],
        },
      }),
    });

    const data = await res.json() as {
      data?: { productCreateMedia?: { mediaUserErrors?: Array<{ message: string }> } };
    };
    const errors = data.data?.productCreateMedia?.mediaUserErrors;
    if (errors?.length) {
      log.warn('[image-upload] productCreateMedia errors:', errors);
    } else {
      log.info(`[image-upload] Image attached via URL (fallback) alt="${altText}"`);
    }
  } catch (err) {
    log.error('[image-upload] addProductImageByUrl failed:', err);
  }
}

// =============================================================================
// PUBLIC: staged upload (preferred path)
// =============================================================================

/**
 * Upload a product image to Shopify CDN via staged upload.
 *
 * Flow:
 * 1. Download binary from source URL
 * 2. Create staged upload slot on Shopify (stagedUploadsCreate)
 * 3. PUT binary to Google Cloud Storage (pre-signed URL)
 * 4. Attach the CDN-hosted resource to the product via productCreateMedia
 *
 * Falls back to `originalSource` (external URL) automatically if any
 * step fails, so the pipeline never blocks on an image error.
 */
export async function uploadProductImageToShopify(
  productGid: string,
  imageUrl: string,
  altText: string
): Promise<void> {
  const normalizedGid = toShopifyGid(productGid, 'Product');

  // Step 1: download binary from source
  let imageBuffer: ArrayBuffer;
  let contentType: string;
  let fileSize: number;
  let filename: string;

  try {
    const resp = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Autonord-Bot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    imageBuffer = await resp.arrayBuffer();
    contentType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    // Reject non-image responses (e.g. HTML bot-protection pages served with 200 OK).
    // In this case we also skip the URL-based fallback: if the source returns HTML to us,
    // Shopify's own crawler will be blocked too — creating a FAILED media entry.
    if (!contentType.startsWith('image/')) {
      log.warn(`[image-upload] Skipping image: source returned non-image content-type "${contentType}" (bot protection?) for ${imageUrl}`);
      return;
    }
    fileSize = imageBuffer.byteLength;
    filename = (imageUrl.split('/').pop()?.split('?')[0] || 'product.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) filename += '.jpg';
  } catch (fetchErr) {
    log.warn(`[image-upload] Binary download failed (${fetchErr}), fallback to URL`);
    await addProductImageByUrl(normalizedGid, imageUrl, altText);
    return;
  }

  // Step 2: create staged upload slot on Shopify
  const stagedMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;

  try {
    const stagedResp = await fetch(API_URL, {
      method: 'POST',
      headers: shopifyHeaders(),
      body: JSON.stringify({
        query: stagedMutation,
        variables: {
          input: [{
            filename,
            mimeType: contentType,
            resource: 'IMAGE',
            fileSize: String(fileSize),
            httpMethod: 'PUT',
          }],
        },
      }),
    });

    const stagedData = await stagedResp.json() as {
      errors?: Array<{ message: string }>;
      data?: {
        stagedUploadsCreate?: {
          stagedTargets: Array<{ url: string; resourceUrl: string }>;
          userErrors: Array<{ message: string }>;
        };
      };
    };

    const userErrors = stagedData.data?.stagedUploadsCreate?.userErrors;
    if (stagedData.errors?.length || userErrors?.length) {
      throw new Error(
        stagedData.errors?.[0]?.message ?? userErrors?.[0]?.message ?? 'Staged upload error'
      );
    }

    const target = stagedData.data!.stagedUploadsCreate!.stagedTargets[0];

    // Step 3: PUT binary to Google Cloud Storage (pre-signed URL)
    await fetch(target.url, {
      method: 'PUT',
      body: imageBuffer,
      headers: { 'Content-Type': contentType },
    });

    // Step 4: attach CDN resource to product
    await addProductImageByUrl(normalizedGid, target.resourceUrl, altText);
    log.info(`[image-upload] Staged upload OK: ${filename} (${fileSize} bytes) alt="${altText}"`);

  } catch (stagingErr) {
    log.warn(`[image-upload] Staged upload failed (${stagingErr}), fallback to URL`);
    await addProductImageByUrl(normalizedGid, imageUrl, altText);
  }
}
