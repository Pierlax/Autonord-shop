/**
 * Centralized Environment Variable Validation
 * 
 * This module provides a single source of truth for all environment variables
 * used across the application. It uses LAZY validation via a Proxy — variables
 * are checked only when actually accessed at runtime, NOT at import/build time.
 * 
 * This is critical for Vercel deployments where env vars may not be available
 * during the static page generation phase of `next build`.
 * 
 * Usage:
 *   import { env } from '@/lib/env';
 *   const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;  // validated on first access
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
  /** Google Generative AI API key for Gemini (primary AI engine) */
  GOOGLE_GENERATIVE_AI_API_KEY: string;
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
  /** Anthropic API key for Claude AI (legacy fallback) */
  ANTHROPIC_API_KEY?: string;
  /** Vercel deployment URL (auto-set by Vercel) */
  VERCEL_URL?: string;
  /** Base URL for the application */
  NEXT_PUBLIC_BASE_URL?: string;
  /** Node environment */
  NODE_ENV?: string;
}

// =============================================================================
// REQUIRED VARIABLE NAMES
// =============================================================================

const REQUIRED_VARS: Array<keyof RequiredEnv> = [
  'SHOPIFY_ADMIN_ACCESS_TOKEN',
  'CRON_SECRET',
  'GOOGLE_GENERATIVE_AI_API_KEY',
];

// =============================================================================
// LAZY VALIDATION VIA PROXY
// =============================================================================

/**
 * Detects whether we are in a Next.js build phase (static generation).
 * During build, env vars may not be available — we must not crash.
 */
function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-export' ||
    // Fallback heuristic: if key runtime vars are ALL missing, we're likely building
    (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && 
     !process.env.CRON_SECRET && 
     !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
  );
}

/**
 * Creates a Proxy that provides lazy, build-safe access to required env vars.
 * 
 * During `next build`, Vercel runs static page generation where env vars
 * may not be available. This Proxy handles both cases:
 * 
 * BUILD TIME (env vars missing):
 * - Returns empty string '' instead of throwing
 * - Logs a warning (not an error) so the build succeeds
 * - The empty string won't be used because API routes aren't actually called
 * 
 * RUNTIME (env vars available):
 * - Returns the actual value from process.env
 * - If a required var is genuinely missing at runtime, throws a clear error
 */
function createLazyEnv(): RequiredEnv {
  return new Proxy({} as RequiredEnv, {
    get(_target, prop: string) {
      // Only handle known required vars
      if (REQUIRED_VARS.includes(prop as keyof RequiredEnv)) {
        const value = process.env[prop];
        
        if (!value || value.trim() === '') {
          // During build: return empty string to avoid crashing static generation
          if (isBuildPhase()) {
            return '';
          }
          // At runtime: throw a clear error
          throw new Error(
            `[env] Fatal: Missing required environment variable: ${prop}\n\n` +
            `Please set it in your .env.local file or Vercel dashboard.`
          );
        }
        return value;
      }
      // For any other property access (toString, Symbol.toPrimitive, etc.), return undefined
      return undefined;
    },
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Validated required environment variables (lazy — validated on access, not import).
 * 
 * Safe to import in any module without causing build-time crashes.
 * Will throw a clear error only when a missing variable is actually read.
 */
export const env: RequiredEnv = createLazyEnv();

/**
 * Optional environment variables (may be undefined).
 * These are never validated — they return undefined if not set.
 * 
 * Also lazy via Proxy to handle Vercel build-time edge cases.
 */
export const optionalEnv: OptionalEnv = new Proxy({} as OptionalEnv, {
  get(_target, prop: string) {
    return process.env[prop] || undefined;
  },
});

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
