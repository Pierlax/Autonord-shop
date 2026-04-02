/**
 * Context Management (STM Tools)
 * 
 * Based on AgeMem paper's Short-Term Memory management:
 * - SUMMARY: Compress multiple memories into a concise summary
 * - FILTER: Remove irrelevant memories based on current context
 * 
 * These tools help manage context window efficiently without
 * modifying the RAG architecture.
 */

import { type MemoryEntry } from './agemem-core';

// ============================================================================
// TYPES
// ============================================================================

export interface SummaryOptions {
  maxLength?: number;        // Max characters for summary (default: 500)
  preserveCritical?: boolean; // Always include critical priority items verbatim
  groupByType?: boolean;     // Group summaries by memory type
}

export interface FilterOptions {
  query?: string;            // Text to match against
  keywords?: string[];       // Keywords to look for
  minRelevanceScore?: number; // Minimum score to keep (0-1, default: 0.3)
  maxEntries?: number;       // Maximum entries to return
}

export interface ContextSummary {
  summary: string;           // The compressed summary text
  originalCount: number;     // How many entries were summarized
  preservedCritical: number; // How many critical entries kept verbatim
  compressionRatio: number;  // Original chars / summary chars
}

export interface FilterResult {
  filtered: MemoryEntry[];   // Entries that passed the filter
  removed: MemoryEntry[];    // Entries that were filtered out
  filterReason: Map<string, string>; // Why each entry was removed
}

// ============================================================================
// SUMMARY CONTEXT
// ============================================================================

/**
 * Summarize multiple memory entries into a concise text
 * 
 * Use when you have many memories and need to fit them in a prompt
 * without exceeding context limits.
 * 
 * @example
 * ```typescript
 * const memories = searchMemory({ brands: ["Milwaukee"] });
 * const summary = summarizeContext(memories.map(m => m.entry), {
 *   maxLength: 300,
 *   preserveCritical: true
 * });
 * // Use summary.summary in your prompt
 * ```
 */
export function summarizeContext(
  entries: MemoryEntry[],
  options: SummaryOptions = {}
): ContextSummary {
  const {
    maxLength = 500,
    preserveCritical = true,
    groupByType = true
  } = options;

  if (entries.length === 0) {
    return {
      summary: '',
      originalCount: 0,
      preservedCritical: 0,
      compressionRatio: 1
    };
  }

  const criticalEntries: MemoryEntry[] = [];
  const otherEntries: MemoryEntry[] = [];

  // Separate critical from others
  for (const entry of entries) {
    if (preserveCritical && entry.priority === 'critical') {
      criticalEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  const summaryParts: string[] = [];
  let totalOriginalChars = 0;

  // Always include critical entries verbatim
  if (criticalEntries.length > 0) {
    summaryParts.push('🚨 REGOLE CRITICHE:');
    for (const entry of criticalEntries) {
      summaryParts.push(`- ${entry.title}: ${entry.content}`);
      totalOriginalChars += entry.title.length + entry.content.length;
    }
  }

  // Summarize other entries
  if (otherEntries.length > 0) {
    totalOriginalChars += otherEntries.reduce(
      (sum, e) => sum + e.title.length + e.content.length, 0
    );

    if (groupByType) {
      // Group by type and summarize each group
      const byType = groupEntriesByType(otherEntries);
      
      for (const [type, typeEntries] of Array.from(byType.entries())) {
        const typeLabel = getTypeLabel(type);
        const typeSummary = summarizeEntryGroup(typeEntries, maxLength / byType.size);
        if (typeSummary) {
          summaryParts.push(`\n${typeLabel}:`);
          summaryParts.push(typeSummary);
        }
      }
    } else {
      // Simple linear summary
      const linearSummary = summarizeEntryGroup(otherEntries, maxLength);
      if (linearSummary) {
        summaryParts.push('\nNote aggiuntive:');
        summaryParts.push(linearSummary);
      }
    }
  }

  const summary = summaryParts.join('\n').slice(0, maxLength);

  return {
    summary,
    originalCount: entries.length,
    preservedCritical: criticalEntries.length,
    compressionRatio: totalOriginalChars > 0 ? totalOriginalChars / summary.length : 1
  };
}

function groupEntriesByType(entries: MemoryEntry[]): Map<string, MemoryEntry[]> {
  const groups = new Map<string, MemoryEntry[]>();
  
  for (const entry of entries) {
    const existing = groups.get(entry.type) || [];
    existing.push(entry);
    groups.set(entry.type, existing);
  }
  
  return groups;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    business_rule: '📋 Regole Business',
    brand_note: '🏷️ Note Brand',
    product_insight: '💡 Insight Prodotto',
    content_guideline: '📝 Linee Guida',
    cross_agent_note: '🔄 Note Cross-Agent',
    verified_fact: '✅ Fatti Verificati',
    template: '📄 Template'
  };
  return labels[type] || type;
}

function summarizeEntryGroup(entries: MemoryEntry[], maxChars: number): string {
  if (entries.length === 0) return '';
  
  // Sort by priority (high first)
  const sorted = [...entries].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });

  const parts: string[] = [];
  let currentLength = 0;

  for (const entry of sorted) {
    // Create a condensed version
    const condensed = `- ${entry.title}`;
    
    if (currentLength + condensed.length > maxChars) {
      // Add indicator of remaining entries
      const remaining = sorted.length - parts.length;
      if (remaining > 0) {
        parts.push(`  (+ ${remaining} altre note)`);
      }
      break;
    }
    
    parts.push(condensed);
    currentLength += condensed.length + 1;
  }

  return parts.join('\n');
}

// ============================================================================
// FILTER CONTEXT
// ============================================================================

/**
 * Filter memory entries to keep only relevant ones
 * 
 * Use when you have many memories but only need those relevant
 * to the current task.
 * 
 * @example
 * ```typescript
 * const allMemories = getAllMemories();
 * const result = filterContext(allMemories, {
 *   query: "trapano batteria",
 *   minRelevanceScore: 0.5,
 *   maxEntries: 5
 * });
 * // Use result.filtered in your prompt
 * ```
 */
export function filterContext(
  entries: MemoryEntry[],
  options: FilterOptions = {}
): FilterResult {
  const {
    query,
    keywords = [],
    minRelevanceScore = 0.3,
    maxEntries
  } = options;

  const filtered: MemoryEntry[] = [];
  const removed: MemoryEntry[] = [];
  const filterReason = new Map<string, string>();

  // Calculate relevance for each entry
  const scored: Array<{ entry: MemoryEntry; score: number }> = [];

  for (const entry of entries) {
    const score = calculateFilterRelevance(entry, query, keywords);
    
    if (score >= minRelevanceScore) {
      scored.push({ entry, score });
    } else {
      removed.push(entry);
      filterReason.set(entry.id, `Relevance score ${score.toFixed(2)} below threshold ${minRelevanceScore}`);
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Apply maxEntries limit
  for (let i = 0; i < scored.length; i++) {
    if (maxEntries && i >= maxEntries) {
      removed.push(scored[i].entry);
      filterReason.set(scored[i].entry.id, `Exceeded max entries limit (${maxEntries})`);
    } else {
      filtered.push(scored[i].entry);
    }
  }

  return { filtered, removed, filterReason };
}

function calculateFilterRelevance(
  entry: MemoryEntry,
  query?: string,
  keywords: string[] = []
): number {
  // Base score from priority
  const priorityScores = { critical: 0.8, high: 0.6, medium: 0.4, low: 0.2 };
  let score = priorityScores[entry.priority];

  // No query/keywords = use priority only
  if (!query && keywords.length === 0) {
    return score;
  }

  const searchTerms = [
    ...(query ? query.toLowerCase().split(/\s+/) : []),
    ...keywords.map(k => k.toLowerCase())
  ];

  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const entryKeywords = entry.keywords.map(k => k.toLowerCase());

  let matchScore = 0;
  let maxPossibleScore = searchTerms.length * 3; // Max 3 points per term

  for (const term of searchTerms) {
    // Title match (3 points)
    if (titleLower.includes(term)) {
      matchScore += 3;
    }
    // Keyword match (2 points)
    else if (entryKeywords.some(k => k.includes(term) || term.includes(k))) {
      matchScore += 2;
    }
    // Content match (1 point)
    else if (contentLower.includes(term)) {
      matchScore += 1;
    }
  }

  // Combine priority score with match score
  const matchRatio = maxPossibleScore > 0 ? matchScore / maxPossibleScore : 0;
  score = (score * 0.3) + (matchRatio * 0.7);

  // Boost for recent entries
  const ageInDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7) score *= 1.1;

  // Boost for frequently used entries
  if (entry.usageCount > 10) score *= 1.1;
  else if (entry.usageCount > 5) score *= 1.05;

  return Math.min(1, score);
}

// ============================================================================
// COMBINED CONTEXT OPTIMIZATION
// ============================================================================

/**
 * Optimize context by filtering and then summarizing
 * 
 * Combines FILTER and SUMMARY for maximum efficiency.
 */
export function optimizeContext(
  entries: MemoryEntry[],
  options: {
    query?: string;
    keywords?: string[];
    maxEntries?: number;
    maxSummaryLength?: number;
    preserveCritical?: boolean;
  } = {}
): {
  optimizedPrompt: string;
  stats: {
    originalCount: number;
    afterFilter: number;
    compressionRatio: number;
  };
} {
  // Step 1: Filter
  const filterResult = filterContext(entries, {
    query: options.query,
    keywords: options.keywords,
    minRelevanceScore: 0.3,
    maxEntries: options.maxEntries || 20
  });

  // Step 2: Summarize
  const summary = summarizeContext(filterResult.filtered, {
    maxLength: options.maxSummaryLength || 500,
    preserveCritical: options.preserveCritical ?? true,
    groupByType: true
  });

  return {
    optimizedPrompt: summary.summary,
    stats: {
      originalCount: entries.length,
      afterFilter: filterResult.filtered.length,
      compressionRatio: summary.compressionRatio
    }
  };
}
