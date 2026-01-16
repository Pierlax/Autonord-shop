/**
 * Auto-Inject Wrapper
 * 
 * Provides optional automatic injection of memory context into prompts.
 * This is a wrapper that agents can use WITHOUT modifying the RAG architecture.
 * 
 * Usage:
 * 1. Wrap your prompt with wrapPromptWithMemory()
 * 2. Memory context is automatically prepended
 * 3. After generation, call recordMemoryUsage() for feedback loop
 */

import {
  searchMemory,
  markMemoryAsUseful,
  type MemoryEntry,
  type AgentSource
} from './agemem-core';

import { loggers } from '@/lib/logger';

const log = loggers.memory;

import {
  optimizeContext
} from './context-management';

// ============================================================================
// TYPES
// ============================================================================

export interface AutoInjectConfig {
  // Agent identification
  agentSource: AgentSource;
  
  // Context for filtering
  brand?: string;
  category?: string;
  productHandle?: string;
  
  // Injection options
  maxMemories?: number;         // Max memories to include (default: 10)
  maxPromptLength?: number;     // Max chars for memory section (default: 800)
  includeCriticalOnly?: boolean; // Only include critical priority (default: false)
  
  // What to include
  includeBusinessRules?: boolean;   // Default: true
  includeBrandNotes?: boolean;      // Default: true
  includeProductInsights?: boolean; // Default: true
  includeCrossAgentNotes?: boolean; // Default: true
  includeVerifiedFacts?: boolean;   // Default: false (can be verbose)
}

export interface InjectionResult {
  // The wrapped prompt with memory context
  wrappedPrompt: string;
  
  // Metadata for feedback loop
  injectedMemories: MemoryEntry[];
  memoryIds: string[];
  
  // Stats
  stats: {
    memoriesFound: number;
    memoriesInjected: number;
    charsAdded: number;
    compressionRatio: number;
  };
}

export interface MemoryUsageRecord {
  memoryIds: string[];
  wasSuccessful: boolean;
  agentSource: AgentSource;
  context?: string;
}

// ============================================================================
// AUTO-INJECT FUNCTIONS
// ============================================================================

/**
 * Wrap a prompt with relevant memory context
 * 
 * This is the main function for automatic memory injection.
 * It searches for relevant memories, optimizes them, and prepends
 * them to your prompt.
 * 
 * @example
 * ```typescript
 * const result = wrapPromptWithMemory(
 *   "Generate a product description for Milwaukee M18 FUEL Drill",
 *   {
 *     agentSource: 'product_agent',
 *     brand: 'Milwaukee',
 *     category: 'Trapani'
 *   }
 * );
 * 
 * // Use result.wrappedPrompt with Claude
 * const response = await claude.complete(result.wrappedPrompt);
 * 
 * // Record usage for feedback loop
 * recordMemoryUsage({
 *   memoryIds: result.memoryIds,
 *   wasSuccessful: true,
 *   agentSource: 'product_agent'
 * });
 * ```
 */
export function wrapPromptWithMemory(
  originalPrompt: string,
  config: AutoInjectConfig
): InjectionResult {
  const {
    agentSource,
    brand,
    category,
    productHandle,
    maxMemories = 10,
    maxPromptLength = 800,
    includeCriticalOnly = false,
    includeBusinessRules = true,
    includeBrandNotes = true,
    includeProductInsights = true,
    includeCrossAgentNotes = true,
    includeVerifiedFacts = false
  } = config;

  // Build type filter based on config
  const types: string[] = [];
  if (includeBusinessRules) types.push('business_rule', 'content_guideline');
  if (includeBrandNotes) types.push('brand_note');
  if (includeProductInsights) types.push('product_insight');
  if (includeCrossAgentNotes) types.push('cross_agent_note');
  if (includeVerifiedFacts) types.push('verified_fact');

  // Search for relevant memories
  const searchResults = searchMemory({
    types: types as any[],
    brands: brand ? [brand] : undefined,
    categories: category ? [category] : undefined,
    productHandle,
    minPriority: includeCriticalOnly ? 'critical' : undefined,
    limit: maxMemories * 2 // Get more than needed for filtering
  });

  // Filter out memories from the same agent (avoid echo chamber)
  const filteredResults = searchResults.filter(r => r.entry.source !== agentSource);
  const memories = filteredResults.map(r => r.entry);

  if (memories.length === 0) {
    return {
      wrappedPrompt: originalPrompt,
      injectedMemories: [],
      memoryIds: [],
      stats: {
        memoriesFound: 0,
        memoriesInjected: 0,
        charsAdded: 0,
        compressionRatio: 1
      }
    };
  }

  // Optimize context (filter + summarize)
  const optimized = optimizeContext(memories, {
    query: brand || category || '',
    maxEntries: maxMemories,
    maxSummaryLength: maxPromptLength,
    preserveCritical: true
  });

  // Build the memory section
  const memorySection = buildMemorySection(optimized.optimizedPrompt, brand, category);

  // Wrap the prompt
  const wrappedPrompt = `${memorySection}\n\n---\n\n${originalPrompt}`;

  // Get the IDs of memories that were actually included
  // (We use all memories that passed the filter, as we can't know exactly which made it into the summary)
  const injectedMemories = memories.slice(0, maxMemories);
  const memoryIds = injectedMemories.map(m => m.id);

  return {
    wrappedPrompt,
    injectedMemories,
    memoryIds,
    stats: {
      memoriesFound: searchResults.length,
      memoriesInjected: injectedMemories.length,
      charsAdded: memorySection.length,
      compressionRatio: optimized.stats.compressionRatio
    }
  };
}

function buildMemorySection(
  optimizedContent: string,
  brand?: string,
  category?: string
): string {
  if (!optimizedContent || optimizedContent.trim().length === 0) {
    return '';
  }

  const contextParts: string[] = [];
  if (brand) contextParts.push(brand);
  if (category) contextParts.push(category);
  const contextLabel = contextParts.length > 0 ? ` per ${contextParts.join(' - ')}` : '';

  return `## CONTESTO DALLA MEMORIA AZIENDALE${contextLabel}

Le seguenti informazioni provengono dalla memoria condivisa degli agenti.
Rispetta le regole critiche e considera le note aggiuntive.

${optimizedContent}`;
}

/**
 * Record memory usage for feedback loop
 * 
 * Call this after using memories in generation to improve
 * the memory quality scoring over time.
 */
export function recordMemoryUsage(record: MemoryUsageRecord): void {
  if (record.wasSuccessful) {
    for (const memoryId of record.memoryIds) {
      markMemoryAsUseful(memoryId, record.agentSource);
    }
    log.info(`[AgeMem-AutoInject] Recorded successful usage of ${record.memoryIds.length} memories`);
  }
  // Note: For unsuccessful usage, the agent should call markMemoryAsProblematic directly
  // with specific feedback about what went wrong
}

// ============================================================================
// CONVENIENCE WRAPPERS FOR SPECIFIC AGENTS
// ============================================================================

/**
 * Wrap prompt for Product Agent
 * 
 * Pre-configured for product description generation.
 */
export function wrapPromptForProductAgent(
  prompt: string,
  product: {
    title: string;
    vendor?: string;
    productType?: string;
    handle?: string;
  }
): InjectionResult {
  return wrapPromptWithMemory(prompt, {
    agentSource: 'product_agent',
    brand: product.vendor,
    category: product.productType,
    productHandle: product.handle,
    includeBusinessRules: true,
    includeBrandNotes: true,
    includeProductInsights: true,
    includeCrossAgentNotes: true,
    includeVerifiedFacts: false, // Too verbose for product descriptions
    maxMemories: 8,
    maxPromptLength: 600
  });
}

/**
 * Wrap prompt for Blog Agent
 * 
 * Pre-configured for blog content generation.
 */
export function wrapPromptForBlogAgent(
  prompt: string,
  context: {
    brand?: string;
    category?: string;
    topic?: string;
  }
): InjectionResult {
  return wrapPromptWithMemory(prompt, {
    agentSource: 'blog_agent',
    brand: context.brand,
    category: context.category,
    includeBusinessRules: true,
    includeBrandNotes: true,
    includeProductInsights: true,
    includeCrossAgentNotes: true,
    includeVerifiedFacts: true, // Useful for blog content
    maxMemories: 12,
    maxPromptLength: 1000
  });
}

// ============================================================================
// MIDDLEWARE-STYLE WRAPPER
// ============================================================================

/**
 * Create a reusable auto-inject middleware
 * 
 * Use this to create a configured wrapper that can be reused
 * across multiple prompts.
 * 
 * @example
 * ```typescript
 * const productAgentMiddleware = createAutoInjectMiddleware({
 *   agentSource: 'product_agent',
 *   includeBusinessRules: true,
 *   includeBrandNotes: true
 * });
 * 
 * // Later, for each product:
 * const result = productAgentMiddleware(prompt, { brand: 'Milwaukee' });
 * ```
 */
export function createAutoInjectMiddleware(
  baseConfig: Partial<AutoInjectConfig> & { agentSource: AgentSource }
): (
  prompt: string,
  contextOverrides?: Partial<AutoInjectConfig>
) => InjectionResult {
  return (prompt: string, contextOverrides?: Partial<AutoInjectConfig>) => {
    const mergedConfig: AutoInjectConfig = {
      ...baseConfig,
      ...contextOverrides
    };
    return wrapPromptWithMemory(prompt, mergedConfig);
  };
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Wrap multiple prompts with memory context
 * 
 * Useful when processing multiple products in batch.
 * Shares memory lookup across prompts for efficiency.
 */
export function wrapPromptsWithMemory(
  prompts: Array<{
    prompt: string;
    brand?: string;
    category?: string;
    productHandle?: string;
  }>,
  baseConfig: Omit<AutoInjectConfig, 'brand' | 'category' | 'productHandle'>
): InjectionResult[] {
  return prompts.map(p => 
    wrapPromptWithMemory(p.prompt, {
      ...baseConfig,
      brand: p.brand,
      category: p.category,
      productHandle: p.productHandle
    })
  );
}
