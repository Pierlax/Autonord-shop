/**
 * Centralized Environment Variable Validation
 * 
 * This module provides a single source of truth for all environment variables
 * used across the application. It validates required variables at import time
 * (fail-fast pattern) and provides typed access to all env vars.
 * 
 * Usage:
 *   import { env } from '@/lib/env';
 *   const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
 * 
 * For optional variables, use:
 *   import { optionalEnv } from '@/lib/env';
 *   const slackUrl = optionalEnv.SLACK_WEBHOOK_URL;
 */

// =============================================================================
// REQUIRED ENVIRONMENT VARIABLES
// =============================================================================

interface RequiredEnv {
  /** Shopify Admin API access token for product/metafield management */
  SHOPIFY_ADMIN_ACCESS_TOKEN: string;
  /** Secret used to authenticate cron jobs and internal API calls */
  CRON_SECRET: string;
  /** Anthropic API key for Claude AI enrichment */
  ANTHROPIC_API_KEY: string;
}

// =============================================================================
// OPTIONAL ENVIRONMENT VARIABLES
// =============================================================================

interface OptionalEnv {
  /** Shopify shop domain (e.g., store.myshopify.com) */
  SHOPIFY_SHOP_DOMAIN?: string;
  /** Shopify Storefront API domain (public) */
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN?: string;
  /** Shopify Storefront API access token (public) */
  NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN?: string;
  /** Shopify webhook HMAC secret for signature verification */
  SHOPIFY_WEBHOOK_SECRET?: string;
  /** Upstash QStash token for async job queuing */
  QSTASH_TOKEN?: string;
  /** SerpAPI key for image/web search */
  SERPAPI_API_KEY?: string;
  /** Exa API key for semantic search */
  EXA_API_KEY?: string;
  /** Google Custom Search API key */
  GOOGLE_SEARCH_API_KEY?: string;
  /** Google Custom Search engine ID */
  GOOGLE_SEARCH_CX?: string;
  /** Slack webhook URL for notifications */
  SLACK_WEBHOOK_URL?: string;
  /** Resend API key for email notifications */
  RESEND_API_KEY?: string;
  /** Email address for notifications */
  NOTIFICATION_EMAIL?: string;
  /** Upstash Redis REST URL for RAG cache */
  UPSTASH_REDIS_REST_URL?: string;
  /** Upstash Redis REST token for RAG cache */
  UPSTASH_REDIS_REST_TOKEN?: string;
  /** Vercel deployment URL (auto-set by Vercel) */
  VERCEL_URL?: string;
  /** Base URL for the application */
  NEXT_PUBLIC_BASE_URL?: string;
  /** Node environment */
  NODE_ENV?: string;
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

const REQUIRED_VARS: Array<keyof RequiredEnv> = [
  'SHOPIFY_ADMIN_ACCESS_TOKEN',
  'CRON_SECRET',
  'ANTHROPIC_API_KEY',
];

/**
 * Validates that all required environment variables are set.
 * Throws a descriptive error listing all missing variables (fail-fast).
 */
function validateRequiredEnv(): RequiredEnv {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key]!.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Fatal: Missing required environment variables:\n` +
      missing.map((v) => `  - ${v}`).join('\n') +
      `\n\nPlease set these in your .env.local file or Vercel dashboard.`
    );
  }

  return {
    SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
    CRON_SECRET: process.env.CRON_SECRET!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Validated required environment variables.
 * Accessing this will throw at import time if any required var is missing.
 */
export const env: RequiredEnv = validateRequiredEnv();

/**
 * Optional environment variables (may be undefined).
 * These are not validated at startup but provide typed access.
 */
export const optionalEnv: OptionalEnv = {
  SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN,
  NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN: process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN,
  SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET,
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  SERPAPI_API_KEY: process.env.SERPAPI_API_KEY,
  EXA_API_KEY: process.env.EXA_API_KEY,
  GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
  GOOGLE_SEARCH_CX: process.env.GOOGLE_SEARCH_CX,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  VERCEL_URL: process.env.VERCEL_URL,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Converts a numeric or string ID to Shopify's global GID format.
 * If the ID is already in GID format, returns it as-is.
 * 
 * @example
 *   toShopifyGid('12345', 'Product')       → 'gid://shopify/Product/12345'
 *   toShopifyGid('gid://shopify/Product/12345', 'Product') → 'gid://shopify/Product/12345'
 *   toShopifyGid(12345, 'Product')          → 'gid://shopify/Product/12345'
 */
export function toShopifyGid(
  id: string | number,
  resource: 'Product' | 'ProductVariant' | 'Collection' | 'Blog' | 'Article' | 'Image' | 'MediaImage' = 'Product'
): string {
  const idStr = String(id);

  // Already a GID
  if (idStr.startsWith('gid://shopify/')) {
    return idStr;
  }

  // Extract numeric part (remove any non-digit characters)
  const numericId = idStr.replace(/\D/g, '');

  if (!numericId) {
    throw new Error(`[env] Invalid Shopify ID: "${id}" — cannot extract numeric ID`);
  }

  return `gid://shopify/${resource}/${numericId}`;
}

/**
 * Extracts the numeric ID from a Shopify GID.
 * 
 * @example
 *   fromShopifyGid('gid://shopify/Product/12345') → '12345'
 *   fromShopifyGid('12345')                        → '12345'
 */
export function fromShopifyGid(gid: string): string {
  if (gid.startsWith('gid://shopify/')) {
    const parts = gid.split('/');
    return parts[parts.length - 1];
  }
  return gid;
}
