/**
 * AgeMem Integration for Product Agent (Agente 1)
 *
 * This module provides easy-to-use functions for the Product Agent
 * to check for business rules and notes BEFORE generating content.
 *
 * Usage Pattern:
 * 1. Before generating product description, call `getProductMemoryContext()`
 * 2. Include returned rules/notes in the generation prompt
 * 3. After successful generation, optionally store verified facts
 */

import {
  searchMemory,
  getBusinessRulesFor,
  getCrossAgentNotes,
  storeVerifiedFact,
  type MemoryEntry
} from './agemem-core';

import { optimizeContext } from './context-management';

import { loggers } from '@/lib/logger';

const log = loggers.memory;

// ============================================================================
// TYPES
// ============================================================================

export interface ProductMemoryContext {
  // Business rules to follow
  businessRules: MemoryEntry[];

  // Notes from other agents (e.g., Blog Agent)
  crossAgentNotes: MemoryEntry[];

  // Verified facts that can be reused
  verifiedFacts: MemoryEntry[];

  // Formatted prompt section to include in generation
  promptSection: string;

  // Summary for logging
  summary: string;
}

export interface ProductInfo {
  handle?: string;
  title: string;
  vendor?: string;        // Brand
  productType?: string;   // Category
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Get all relevant memory context for a product BEFORE generating content
 *
 * This is the main function the Product Agent should call before
 * invoking the AI for content generation.
 *
 * @example
 * ```typescript
 * const memoryContext = await getProductMemoryContext({
 *   title: "Milwaukee M18 FUEL Trapano",
 *   vendor: "Milwaukee",
 *   productType: "Trapani"
 * });
 *
 * // Include in prompt
 * const prompt = `
 *   ${memoryContext.promptSection}
 *
 *   Generate description for: ${product.title}
 * `;
 * ```
 */
export async function getProductMemoryContext(product: ProductInfo): Promise<ProductMemoryContext> {
  const brand = product.vendor;
  const category = product.productType;
  const handle = product.handle;

  // 1. Get business rules
  const businessRules = await getBusinessRulesFor({
    brand,
    category,
    productHandle: handle
  });

  // 2. Get cross-agent notes
  const crossAgentNotes = await getCrossAgentNotes({
    forAgent: 'product_agent',
    brand,
    category
  });

  // 3. Get verified facts about this brand/category
  const verifiedFactsResults = await searchMemory({
    types: ['verified_fact'],
    brands: brand ? [brand] : undefined,
    categories: category ? [category] : undefined,
    limit: 5
  });
  const verifiedFacts = verifiedFactsResults.map(r => r.entry);

  // 4. Build optimized prompt section via context-management (filter + summarize)
  //    Questo garantisce un budget fisso anche con molte memorie in futuro.
  const allEntries = [...businessRules, ...crossAgentNotes, ...verifiedFacts];
  const keywords = [
    product.title,
    brand,
    category,
  ].filter((v): v is string => Boolean(v));

  const { optimizedPrompt, stats } = optimizeContext(allEntries, {
    query: product.title,
    keywords,
    maxEntries: 20,
    maxSummaryLength: 800,
    preserveCritical: true,
  });

  const promptSection = optimizedPrompt
    ? `## MEMORIA AGENTI (regole, note, fatti verificati)\n\n${optimizedPrompt}`
    : '';

  // 5. Create summary
  const summary = `Found ${businessRules.length} business rules, ${crossAgentNotes.length} agent notes, ${verifiedFacts.length} verified facts` +
    (stats.originalCount > stats.afterFilter
      ? ` (filtered to ${stats.afterFilter}, compression ${stats.compressionRatio.toFixed(1)}x)`
      : '');

  log.info(`[AgeMem-ProductAgent] ${summary} for ${product.title}`);

  return {
    businessRules,
    crossAgentNotes,
    verifiedFacts,
    promptSection,
    summary
  };
}

/**
 * Store a verified fact after successful product enrichment
 *
 * Call this after generating content to store facts that can be
 * reused for similar products.
 */
export async function storeProductFact(
  fact: {
    title: string;
    content: string;
    brand?: string;
    category?: string;
  }
): Promise<MemoryEntry> {
  return storeVerifiedFact('product_agent', {
    title: fact.title,
    content: fact.content,
    targetBrands: fact.brand ? [fact.brand] : undefined,
    targetCategories: fact.category ? [fact.category] : undefined
  });
}

/**
 * Check if there are any CRITICAL rules that would block content generation
 */
export async function hasCriticalBlockers(product: ProductInfo): Promise<{
  blocked: boolean;
  reasons: string[];
}> {
  const rules = await getBusinessRulesFor({
    brand: product.vendor,
    category: product.productType,
    productHandle: product.handle
  });

  const criticalRules = rules.filter(r => r.priority === 'critical');

  // Check for blocking rules (e.g., "Do not generate content for this product")
  const blockingKeywords = ['non generare', 'blocca', 'skip', 'ignora', 'do not generate'];
  const blockers = criticalRules.filter(r =>
    blockingKeywords.some(kw => r.content.toLowerCase().includes(kw))
  );

  return {
    blocked: blockers.length > 0,
    reasons: blockers.map(b => b.title)
  };
}
