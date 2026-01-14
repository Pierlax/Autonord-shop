/**
 * Shopify Webhook HMAC Verification
 * Ensures webhooks are authentic and from Shopify
 */

import crypto from 'crypto';

/**
 * Verify Shopify webhook HMAC signature
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Webhook] Missing SHOPIFY_WEBHOOK_SECRET environment variable');
    return false;
  }

  if (!hmacHeader) {
    console.error('[Webhook] Missing X-Shopify-Hmac-SHA256 header');
    return false;
  }

  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(calculatedHmac),
    Buffer.from(hmacHeader)
  );

  if (!isValid) {
    console.error('[Webhook] HMAC verification failed');
  }

  return isValid;
}

/**
 * Get the shop domain from webhook headers
 */
export function getShopDomain(shopDomainHeader: string | null): string | null {
  if (!shopDomainHeader) {
    console.error('[Webhook] Missing X-Shopify-Shop-Domain header');
    return null;
  }
  return shopDomainHeader;
}

/**
 * Get the webhook topic from headers
 */
export function getWebhookTopic(topicHeader: string | null): string | null {
  if (!topicHeader) {
    console.error('[Webhook] Missing X-Shopify-Topic header');
    return null;
  }
  return topicHeader;
}
