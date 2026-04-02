/**
 * Autonord Configuration — Single Source of Truth
 * 
 * All application-wide constants and configuration values live here.
 * No more hardcoded values scattered across the codebase.
 * 
 * Environment variables are validated in lib/env.ts;
 * this file provides the semantic configuration layer on top.
 */

// =============================================================================
// SHOPIFY
// =============================================================================

export const shopify = {
  /** Shopify store domain (myshopify.com) */
  storeDomain: 'autonord-service.myshopify.com',
  /** Admin API version */
  apiVersion: '2024-01',
  /** Metafield namespace for AI-generated content */
  metafieldNamespace: 'taya',
  /** Tag added to enriched products */
  enrichedTag: 'AI-Enhanced',
} as const;

// =============================================================================
// AI MODELS
// =============================================================================

export const ai = {
  /** Primary model for content generation */
  primaryModel: 'gemini-2.0-flash',
  /** Lite model for quick/cheap tasks */
  liteModel: 'gemini-2.0-flash-lite',
  /** Provider name */
  provider: 'google-gemini',
  /** Max requests per minute (rate limiting) */
  maxRequestsPerMinute: 15,
  /** Max retries on rate limit */
  maxRetries: 3,
  /** Base retry delay in ms */
  baseRetryDelayMs: 2000,
  /** Default temperature for structured output */
  structuredOutputTemperature: 0.3,
  /** Default temperature for creative text */
  creativeTemperature: 0.7,
} as const;

// =============================================================================
// QUEUE (QStash)
// =============================================================================

export const queue = {
  /** Default retries for queued jobs */
  defaultRetries: 3,
  /** Max concurrent enrichments */
  maxConcurrentEnrichments: 5,
  /** Delay between batch items (seconds) */
  batchDelaySeconds: 30,
} as const;

// =============================================================================
// RATE LIMITS
// =============================================================================

export const rateLimits = {
  /** Max product re-enrichments per day */
  maxProductReEnrichmentsPerDay: 10,
  /** Max articles commissioned per day */
  maxArticlesPerDay: 2,
  /** Max API calls to Shopify per second */
  shopifyApiCallsPerSecond: 2,
} as const;

// =============================================================================
// CRON SCHEDULES (default, can be overridden dynamically)
// =============================================================================

export const cronDefaults = {
  /** Blog researcher: Monday 8:00 AM */
  blogResearcher: '0 8 * * 1',
  /** TAYA Director: Every night at 2:00 AM */
  tayaDirector: '0 2 * * *',
  /** Auto-process products: Every 2 hours */
  autoProcessProducts: '0 */2 * * *',
  /** TAYA Improver: Sunday 3:00 AM */
  tayaImprover: '0 3 * * 0',
} as const;

// =============================================================================
// BRAND CONFIGURATION
// =============================================================================

export const brand = {
  /** Company name */
  name: 'Autonord Service',
  /** Physical address */
  address: 'Lungobisagno d\'Istria 34, Genova',
  /** Contact email */
  email: 'info@autonordservice.com',
  /** Website URL */
  website: 'https://autonord-shop.vercel.app',
  /** Supported brands */
  supportedBrands: [
    'Milwaukee',
    'DeWalt',
    'Makita',
    'Bosch Professional',
    'Hikoki',
    'Metabo',
    'Festool',
    'Hilti',
  ],
} as const;

// =============================================================================
// CONTENT RULES
// =============================================================================

export const contentRules = {
  /** Minimum pros required per product */
  minPros: 3,
  /** Minimum cons required per product */
  minCons: 2,
  /** Minimum FAQs required per product */
  minFaqs: 3,
  /** Maximum description length (characters) */
  maxDescriptionLength: 2000,
  /** Quality score threshold for passing */
  qualityThreshold: 60,
} as const;

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export const notifications = {
  /** Admin email for critical notifications */
  adminEmail: process.env.ADMIN_EMAIL || 'admin@autonordservice.com',
  /** WhatsApp number for alerts (optional) */
  adminWhatsApp: process.env.ADMIN_WHATSAPP || '',
  /** Notify on enrichment failure */
  notifyOnEnrichmentFailure: true,
  /** Notify on blog topic discovery */
  notifyOnBlogTopicDiscovery: true,
  /** Notify on cron job failure */
  notifyOnCronFailure: true,
} as const;

// =============================================================================
// FULL CONFIG EXPORT
// =============================================================================

const config = {
  shopify,
  ai,
  queue,
  rateLimits,
  cronDefaults,
  brand,
  contentRules,
  notifications,
} as const;

export default config;
