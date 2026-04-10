/**
 * Shared Intent Taxonomy — R7 (Simplification Audit)
 *
 * Single source of truth for query/search/cache intent classification.
 * Previously 5 overlapping systems existed:
 *   - QueryIntent     (source-router.ts)  — 7 values
 *   - SearchIntent    (rag-sources.ts)    — 4 values
 *   - CacheIntent     (rag-cache.ts)      — 5 values
 *   - QueryType       (query-expander.ts) — 6 values
 *   - BlogDiscoveryIntent (rag-bridge.ts) — 6 values
 *
 * This module defines CoreIntent (10 values) and mapper functions so
 * each consumer can translate to its own vocabulary without re-defining semantics.
 */

// =============================================================================
// CORE INTENT — single canonical taxonomy
// =============================================================================

export type CoreIntent =
  | 'product_specs'    // Technical specifications (voltage, weight, torque, kW, etc.)
  | 'user_reviews'     // Customer / forum reviews and ratings
  | 'expert_reviews'   // Editorial / professional reviews
  | 'comparison'       // Product vs product, brand vs brand
  | 'manual'           // User manuals, instruction PDFs, datasheets
  | 'troubleshooting'  // Problems, fixes, common failures
  | 'compatibility'    // Batteries, accessories, attachments, parts
  | 'pricing'          // Price, value, availability
  | 'forum_discussion' // Open forum threads, community questions
  | 'how_to';          // Tutorials, best practices, usage guides

// =============================================================================
// MAPPER — CoreIntent → SearchIntent (rag-sources.ts)
// =============================================================================

import type { SearchIntent } from '@/lib/shopify/rag-sources';

export function toSearchIntent(core: CoreIntent): SearchIntent {
  switch (core) {
    case 'product_specs':
    case 'compatibility':
      return 'specs';
    case 'manual':
      return 'manuals';
    case 'user_reviews':
    case 'expert_reviews':
    case 'comparison':
    case 'troubleshooting':
    case 'forum_discussion':
    case 'how_to':
      return 'reviews';
    case 'pricing':
      return 'images'; // closest available — retailer pages carry pricing
    default:
      return 'specs';
  }
}

// =============================================================================
// MAPPER — CoreIntent → CacheIntent (rag-cache.ts)
// =============================================================================

import type { CacheIntent } from '@/lib/shopify/rag-cache';

export function toCacheIntent(core: CoreIntent): CacheIntent {
  switch (core) {
    case 'product_specs':
    case 'compatibility':
      return 'specs';
    case 'manual':
      return 'manuals';
    case 'user_reviews':
    case 'expert_reviews':
    case 'comparison':
    case 'troubleshooting':
    case 'forum_discussion':
    case 'how_to':
      return 'reviews';
    case 'pricing':
      return 'default';
    default:
      return 'default';
  }
}

// =============================================================================
// MAPPER — CoreIntent → BlogDiscoveryIntent (rag-bridge.ts)
// =============================================================================

import type { BlogDiscoveryIntent } from '@/lib/blog-researcher/rag-bridge';

export function toBlogIntent(core: CoreIntent): BlogDiscoveryIntent {
  switch (core) {
    case 'troubleshooting':
      return 'problem';
    case 'comparison':
      return 'comparison';
    case 'how_to':
    case 'manual':
      return 'how_to';
    case 'pricing':
      return 'buyer_question';
    case 'forum_discussion':
    case 'user_reviews':
      return 'discussion';
    case 'product_specs':
    case 'expert_reviews':
    case 'compatibility':
    default:
      return 'trend';
  }
}

// =============================================================================
// MAPPER — CoreIntent → QueryType (query-expander.ts)
// =============================================================================

import type { QueryType } from '@/lib/blog-researcher/query-expander';

export function toQueryType(core: CoreIntent): QueryType {
  switch (core) {
    case 'product_specs':
    case 'compatibility':
      return 'technical';
    case 'troubleshooting':
      return 'problem';
    case 'comparison':
      return 'comparison';
    case 'forum_discussion':
    case 'user_reviews':
      return 'forum';
    case 'expert_reviews':
      return 'review';
    case 'how_to':
    case 'manual':
    case 'pricing':
    default:
      return 'howto';
  }
}

// =============================================================================
// MAPPER — QueryIntent (source-router.ts) → CoreIntent
// =============================================================================

import type { QueryIntent } from '@/lib/shopify/source-router';

export function fromQueryIntent(qi: QueryIntent): CoreIntent {
  switch (qi) {
    case 'technical_specs':  return 'product_specs';
    case 'pricing_value':    return 'pricing';
    case 'user_experience':  return 'user_reviews';
    case 'comparison':       return 'comparison';
    case 'how_to':           return 'how_to';
    case 'compatibility':    return 'compatibility';
    case 'troubleshooting':  return 'troubleshooting';
    default:                 return 'product_specs';
  }
}
