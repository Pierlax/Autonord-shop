/**
 * Shared AI enrichment trigger for Danea sync routes.
 *
 * Called after a successful Shopify product sync to queue the AI enrichment
 * pipeline via QStash. Non-blocking: if QStash fails, the sync is still
 * considered successful.
 */

import { queueProductEnrichment, EnrichmentJob } from '@/lib/queue';
import { loggers } from '@/lib/logger';

const log = loggers.sync;

export interface EnrichmentTarget {
  shopifyId: string;
  daneaCode: string;
  supplierCode: string | null;
  barcode: string | null;
  title: string;
  vendor: string;
  productType: string;
}

/**
 * Queue AI enrichment for a single synced product.
 *
 * @param product     - Product identifiers and metadata
 * @param baseUrl     - Base URL for QStash callback
 * @param delaySeconds - Staggered delay (seconds) to prevent Gemini rate-limit storms
 */
export async function triggerAIEnrichment(
  product: EnrichmentTarget,
  baseUrl: string,
  delaySeconds = 0
): Promise<void> {
  try {
    const job: EnrichmentJob = {
      productId:   product.shopifyId,
      productGid:  `gid://shopify/Product/${product.shopifyId}`,
      title:       product.title || `Prodotto ${product.daneaCode}`,
      vendor:      product.vendor || 'Sconosciuto',
      sku:         product.supplierCode || product.daneaCode,
      price:       '0',
      productType: product.productType || 'Elettroutensile',
      tags:        ['danea-sync', 'auto-enrich'],
      hasImages:   false,
      receivedAt:  new Date().toISOString(),
      barcode:     product.barcode,
    };

    const result = await queueProductEnrichment(job, baseUrl, { delaySeconds });

    if (result.queued) {
      log.info(`[Danea→AI] ${product.daneaCode} (Shopify: ${product.shopifyId}) queued. MsgId: ${result.messageId}, delay: ${delaySeconds}s`);
    } else {
      log.warn(`[Danea→AI] Failed to queue ${product.daneaCode}: ${result.error}`);
    }
  } catch (error) {
    log.error(`[Danea→AI] Error queuing enrichment for ${product.daneaCode}:`, error);
  }
}
