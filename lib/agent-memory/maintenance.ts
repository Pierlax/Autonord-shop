/**
 * Memory Maintenance Utilities
 * 
 * Provides utilities for maintaining memory health:
 * - Cleanup expired memories
 * - Consolidate similar memories
 * - Archive old memories
 * - Generate maintenance reports
 */

import {
  type MemoryEntry,
  getAllMemories,
  deleteMemory,
  updateMemory,
  getMemoryStats,
  calculateMemoryQuality,
  applyMemoryDecay
} from './agemem-core';

// ============================================================================
// TYPES
// ============================================================================

export interface MaintenanceReport {
  timestamp: number;
  actions: MaintenanceAction[];
  summary: {
    memoriesProcessed: number;
    deleted: number;
    consolidated: number;
    archived: number;
    errors: number;
  };
}

export interface MaintenanceAction {
  type: 'delete' | 'consolidate' | 'archive' | 'decay';
  memoryIds: string[];
  reason: string;
  success: boolean;
  error?: string;
}

export interface ConsolidationCandidate {
  memories: MemoryEntry[];
  similarity: number;
  suggestedMerge: {
    title: string;
    content: string;
    keywords: string[];
  };
}

// ============================================================================
// CLEANUP EXPIRED MEMORIES
// ============================================================================

/**
 * Remove all expired memories from the store
 */
export function cleanupExpiredMemories(): {
  deleted: number;
  deletedIds: string[];
} {
  const memories = getAllMemories();
  const now = Date.now();
  
  const expired = memories.filter(m => m.expiresAt && m.expiresAt < now);
  const deletedIds: string[] = [];
  
  for (const memory of expired) {
    const success = deleteMemory(memory.id);
    if (success) {
      deletedIds.push(memory.id);
      console.log(`[AgeMem-Maintenance] Deleted expired memory: ${memory.id} - "${memory.title}"`);
    }
  }
  
  return {
    deleted: deletedIds.length,
    deletedIds
  };
}

/**
 * Remove memories that have been flagged for deletion based on quality
 */
export function cleanupLowQualityMemories(options: {
  minQuality?: number;      // Minimum quality to keep (default: 0.15)
  dryRun?: boolean;         // Just report, don't delete (default: false)
} = {}): {
  deleted: number;
  wouldDelete: number;
  deletedIds: string[];
} {
  const { minQuality = 0.15, dryRun = false } = options;
  
  const memories = getAllMemories();
  const deletedIds: string[] = [];
  let wouldDelete = 0;
  
  for (const memory of memories) {
    // Never auto-delete critical memories
    if (memory.priority === 'critical') continue;
    
    const quality = calculateMemoryQuality(memory);
    
    if (quality.overall < minQuality && quality.recommendation === 'delete') {
      wouldDelete++;
      
      if (!dryRun) {
        const success = deleteMemory(memory.id);
        if (success) {
          deletedIds.push(memory.id);
          console.log(`[AgeMem-Maintenance] Deleted low-quality memory: ${memory.id} (quality: ${quality.overall.toFixed(2)})`);
        }
      }
    }
  }
  
  return {
    deleted: deletedIds.length,
    wouldDelete,
    deletedIds
  };
}

// ============================================================================
// CONSOLIDATE SIMILAR MEMORIES
// ============================================================================

/**
 * Find memories that could be consolidated (merged)
 */
export function findConsolidationCandidates(options: {
  minSimilarity?: number;   // Minimum similarity to suggest merge (default: 0.7)
  sameTypeOnly?: boolean;   // Only merge same type memories (default: true)
  sameBrandOnly?: boolean;  // Only merge same brand memories (default: true)
} = {}): ConsolidationCandidate[] {
  const {
    minSimilarity = 0.7,
    sameTypeOnly = true,
    sameBrandOnly = true
  } = options;
  
  const memories = getAllMemories();
  const candidates: ConsolidationCandidate[] = [];
  const processed = new Set<string>();
  
  for (let i = 0; i < memories.length; i++) {
    if (processed.has(memories[i].id)) continue;
    
    const similar: MemoryEntry[] = [memories[i]];
    
    for (let j = i + 1; j < memories.length; j++) {
      if (processed.has(memories[j].id)) continue;
      
      // Check type constraint
      if (sameTypeOnly && memories[i].type !== memories[j].type) continue;
      
      // Check brand constraint
      if (sameBrandOnly) {
        const brands1 = memories[i].targetBrands || [];
        const brands2 = memories[j].targetBrands || [];
        const hasCommonBrand = brands1.some(b => brands2.includes(b)) || 
                               (brands1.length === 0 && brands2.length === 0);
        if (!hasCommonBrand) continue;
      }
      
      // Calculate similarity
      const similarity = calculateSimilarity(memories[i], memories[j]);
      
      if (similarity >= minSimilarity) {
        similar.push(memories[j]);
        processed.add(memories[j].id);
      }
    }
    
    if (similar.length > 1) {
      processed.add(memories[i].id);
      
      // Calculate average similarity
      let totalSimilarity = 0;
      let comparisons = 0;
      for (let a = 0; a < similar.length; a++) {
        for (let b = a + 1; b < similar.length; b++) {
          totalSimilarity += calculateSimilarity(similar[a], similar[b]);
          comparisons++;
        }
      }
      
      candidates.push({
        memories: similar,
        similarity: comparisons > 0 ? totalSimilarity / comparisons : 0,
        suggestedMerge: createMergedEntry(similar)
      });
    }
  }
  
  return candidates;
}

function calculateSimilarity(a: MemoryEntry, b: MemoryEntry): number {
  // Title similarity (Jaccard on words)
  const titleWordsA = new Set(a.title.toLowerCase().split(/\s+/));
  const titleWordsB = new Set(b.title.toLowerCase().split(/\s+/));
  const titleIntersection = Array.from(titleWordsA).filter(w => titleWordsB.has(w)).length;
  const titleUnion = new Set([...Array.from(titleWordsA), ...Array.from(titleWordsB)]).size;
  const titleSimilarity = titleUnion > 0 ? titleIntersection / titleUnion : 0;
  
  // Keyword similarity
  const keywordsA = new Set(a.keywords.map(k => k.toLowerCase()));
  const keywordsB = new Set(b.keywords.map(k => k.toLowerCase()));
  const keywordIntersection = Array.from(keywordsA).filter(k => keywordsB.has(k)).length;
  const keywordUnion = new Set([...Array.from(keywordsA), ...Array.from(keywordsB)]).size;
  const keywordSimilarity = keywordUnion > 0 ? keywordIntersection / keywordUnion : 0;
  
  // Content similarity (simple word overlap)
  const contentWordsA = new Set(a.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const contentWordsB = new Set(b.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const contentIntersection = Array.from(contentWordsA).filter(w => contentWordsB.has(w)).length;
  const contentUnion = new Set([...Array.from(contentWordsA), ...Array.from(contentWordsB)]).size;
  const contentSimilarity = contentUnion > 0 ? contentIntersection / contentUnion : 0;
  
  // Weighted average
  return (titleSimilarity * 0.4) + (keywordSimilarity * 0.3) + (contentSimilarity * 0.3);
}

function createMergedEntry(memories: MemoryEntry[]): {
  title: string;
  content: string;
  keywords: string[];
} {
  // Use the title from the highest priority or most recent
  const sorted = [...memories].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }
    return b.updatedAt - a.updatedAt;
  });
  
  const title = sorted[0].title;
  
  // Merge content (deduplicated sentences)
  const allSentences = memories
    .flatMap(m => m.content.split(/[.!?]+/).map(s => s.trim()))
    .filter(s => s.length > 10);
  const uniqueSentences = Array.from(new Set(allSentences));
  const content = uniqueSentences.slice(0, 5).join('. ') + '.';
  
  // Merge keywords (deduplicated)
  const allKeywords = memories.flatMap(m => m.keywords);
  const keywords = Array.from(new Set(allKeywords)).slice(0, 10);
  
  return { title, content, keywords };
}

/**
 * Execute consolidation for a candidate
 * 
 * Keeps the highest priority memory and updates it with merged content,
 * then deletes the others.
 */
export function executeConsolidation(candidate: ConsolidationCandidate): {
  success: boolean;
  keptId: string;
  deletedIds: string[];
  error?: string;
} {
  try {
    // Sort to find the one to keep (highest priority, most recent)
    const sorted = [...candidate.memories].sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.updatedAt - a.updatedAt;
    });
    
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);
    
    // Update the kept memory with merged content
    updateMemory({
      id: toKeep.id,
      content: candidate.suggestedMerge.content,
      keywords: candidate.suggestedMerge.keywords
    });
    
    // Delete the others
    const deletedIds: string[] = [];
    for (const memory of toDelete) {
      if (deleteMemory(memory.id)) {
        deletedIds.push(memory.id);
      }
    }
    
    console.log(`[AgeMem-Maintenance] Consolidated ${candidate.memories.length} memories into ${toKeep.id}`);
    
    return {
      success: true,
      keptId: toKeep.id,
      deletedIds
    };
  } catch (error) {
    return {
      success: false,
      keptId: '',
      deletedIds: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================================================
// FULL MAINTENANCE RUN
// ============================================================================

/**
 * Run full maintenance cycle
 * 
 * Performs:
 * 1. Cleanup expired memories
 * 2. Apply decay to old memories
 * 3. Cleanup low-quality memories
 * 4. Find and optionally execute consolidations
 */
export function runFullMaintenance(options: {
  autoConsolidate?: boolean;  // Automatically consolidate (default: false)
  dryRun?: boolean;           // Just report, don't make changes (default: false)
} = {}): MaintenanceReport {
  const { autoConsolidate = false, dryRun = false } = options;
  
  console.log('[AgeMem-Maintenance] Starting full maintenance run...');
  
  const report: MaintenanceReport = {
    timestamp: Date.now(),
    actions: [],
    summary: {
      memoriesProcessed: getAllMemories().length,
      deleted: 0,
      consolidated: 0,
      archived: 0,
      errors: 0
    }
  };
  
  // 1. Cleanup expired
  if (!dryRun) {
    const expiredResult = cleanupExpiredMemories();
    if (expiredResult.deleted > 0) {
      report.actions.push({
        type: 'delete',
        memoryIds: expiredResult.deletedIds,
        reason: 'Expired',
        success: true
      });
      report.summary.deleted += expiredResult.deleted;
    }
  }
  
  // 2. Apply decay
  if (!dryRun) {
    const decayResult = applyMemoryDecay();
    if (decayResult.decayed > 0 || decayResult.flaggedForArchive > 0) {
      report.actions.push({
        type: 'decay',
        memoryIds: [], // Decay doesn't track individual IDs
        reason: `Decayed ${decayResult.decayed}, flagged ${decayResult.flaggedForArchive} for archive`,
        success: true
      });
      report.summary.archived += decayResult.flaggedForArchive;
    }
  }
  
  // 3. Cleanup low quality
  const lowQualityResult = cleanupLowQualityMemories({ dryRun });
  if (lowQualityResult.deleted > 0 || lowQualityResult.wouldDelete > 0) {
    report.actions.push({
      type: 'delete',
      memoryIds: lowQualityResult.deletedIds,
      reason: `Low quality (${dryRun ? 'would delete' : 'deleted'} ${lowQualityResult.wouldDelete})`,
      success: true
    });
    report.summary.deleted += lowQualityResult.deleted;
  }
  
  // 4. Find consolidation candidates
  const consolidationCandidates = findConsolidationCandidates();
  
  if (consolidationCandidates.length > 0) {
    if (autoConsolidate && !dryRun) {
      for (const candidate of consolidationCandidates) {
        const result = executeConsolidation(candidate);
        report.actions.push({
          type: 'consolidate',
          memoryIds: candidate.memories.map(m => m.id),
          reason: `Similarity: ${candidate.similarity.toFixed(2)}`,
          success: result.success,
          error: result.error
        });
        
        if (result.success) {
          report.summary.consolidated += candidate.memories.length - 1;
          report.summary.deleted += result.deletedIds.length;
        } else {
          report.summary.errors++;
        }
      }
    } else {
      // Just report candidates
      report.actions.push({
        type: 'consolidate',
        memoryIds: consolidationCandidates.flatMap(c => c.memories.map(m => m.id)),
        reason: `Found ${consolidationCandidates.length} consolidation candidates (not executed)`,
        success: true
      });
    }
  }
  
  console.log(`[AgeMem-Maintenance] Maintenance complete. Deleted: ${report.summary.deleted}, Consolidated: ${report.summary.consolidated}, Archived: ${report.summary.archived}`);
  
  return report;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Get a health report for the memory system
 */
export function getMemoryHealthReport(): {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
  stats: ReturnType<typeof getMemoryStats>;
} {
  const stats = getMemoryStats();
  const memories = getAllMemories();
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check for too many expired
  if (stats.expiredCount > 10) {
    issues.push(`${stats.expiredCount} expired memories need cleanup`);
    recommendations.push('Run cleanupExpiredMemories()');
  }
  
  // Check for low quality memories
  let lowQualityCount = 0;
  for (const memory of memories) {
    const quality = calculateMemoryQuality(memory);
    if (quality.recommendation === 'delete' || quality.recommendation === 'review') {
      lowQualityCount++;
    }
  }
  
  if (lowQualityCount > memories.length * 0.3) {
    issues.push(`${lowQualityCount} memories (${Math.round(lowQualityCount / memories.length * 100)}%) need review`);
    recommendations.push('Run runFullMaintenance() to clean up');
  }
  
  // Check for potential duplicates
  const consolidationCandidates = findConsolidationCandidates();
  if (consolidationCandidates.length > 0) {
    const duplicateCount = consolidationCandidates.reduce((sum, c) => sum + c.memories.length, 0);
    issues.push(`${duplicateCount} memories could be consolidated into ${consolidationCandidates.length} groups`);
    recommendations.push('Review consolidation candidates');
  }
  
  // Check for memory growth
  if (stats.totalEntries > 1000) {
    issues.push(`Memory store has ${stats.totalEntries} entries - consider archiving old entries`);
    recommendations.push('Implement external archive storage');
  }
  
  // Determine status
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (issues.length > 2 || stats.expiredCount > 50) {
    status = 'critical';
  } else if (issues.length > 0) {
    status = 'warning';
  }
  
  return { status, issues, recommendations, stats };
}
