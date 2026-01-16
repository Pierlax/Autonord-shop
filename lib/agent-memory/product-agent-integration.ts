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
 * invoking Claude for content generation.
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
export function getProductMemoryContext(product: ProductInfo): ProductMemoryContext {
  const brand = product.vendor;
  const category = product.productType;
  const handle = product.handle;
  
  // 1. Get business rules
  const businessRules = getBusinessRulesFor({
    brand,
    category,
    productHandle: handle
  });
  
  // 2. Get cross-agent notes
  const crossAgentNotes = getCrossAgentNotes({
    forAgent: 'product_agent',
    brand,
    category
  });
  
  // 3. Get verified facts about this brand/category
  const verifiedFactsResults = searchMemory({
    types: ['verified_fact'],
    brands: brand ? [brand] : undefined,
    categories: category ? [category] : undefined,
    limit: 5
  });
  const verifiedFacts = verifiedFactsResults.map(r => r.entry);
  
  // 4. Format prompt section
  const promptSection = formatPromptSection(businessRules, crossAgentNotes, verifiedFacts);
  
  // 5. Create summary
  const summary = `Found ${businessRules.length} business rules, ${crossAgentNotes.length} agent notes, ${verifiedFacts.length} verified facts`;
  
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
 * Format memory entries into a prompt section for Claude
 */
function formatPromptSection(
  businessRules: MemoryEntry[],
  crossAgentNotes: MemoryEntry[],
  verifiedFacts: MemoryEntry[]
): string {
  const sections: string[] = [];
  
  // Business Rules (MUST follow)
  if (businessRules.length > 0) {
    sections.push('## REGOLE AZIENDALI (OBBLIGATORIE)');
    sections.push('Le seguenti regole DEVONO essere rispettate nella generazione del contenuto:\n');
    
    for (const rule of businessRules) {
      const priority = rule.priority === 'critical' ? '🚨 CRITICO' : 
                       rule.priority === 'high' ? '⚠️ IMPORTANTE' : '';
      sections.push(`${priority ? priority + ' - ' : ''}"${rule.title}"`);
      sections.push(`${rule.content}\n`);
    }
  }
  
  // Cross-Agent Notes (SHOULD consider)
  if (crossAgentNotes.length > 0) {
    sections.push('## NOTE DA ALTRI AGENTI');
    sections.push('I seguenti appunti sono stati lasciati da altri agenti e dovrebbero essere considerati:\n');
    
    for (const note of crossAgentNotes) {
      const source = note.source === 'blog_agent' ? '📝 Blog Agent' : note.source;
      sections.push(`${source}: "${note.title}"`);
      sections.push(`${note.content}\n`);
    }
  }
  
  // Verified Facts (CAN use)
  if (verifiedFacts.length > 0) {
    sections.push('## FATTI VERIFICATI DISPONIBILI');
    sections.push('I seguenti fatti sono stati verificati e possono essere riutilizzati:\n');
    
    for (const fact of verifiedFacts) {
      sections.push(`- ${fact.title}: ${fact.content}`);
    }
    sections.push('');
  }
  
  if (sections.length === 0) {
    return ''; // No memory context to include
  }
  
  return sections.join('\n');
}

// ============================================================================
// POST-GENERATION FUNCTIONS
// ============================================================================

/**
 * Store a verified fact after successful product enrichment
 * 
 * Call this after generating content to store facts that can be
 * reused for similar products.
 */
export function storeProductFact(
  fact: {
    title: string;
    content: string;
    brand?: string;
    category?: string;
  }
): MemoryEntry {
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
export function hasCriticalBlockers(product: ProductInfo): {
  blocked: boolean;
  reasons: string[];
} {
  const rules = getBusinessRulesFor({
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
