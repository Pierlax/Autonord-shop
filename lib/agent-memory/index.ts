/**
 * AgeMem - Agentic Memory System
 * 
 * A complete memory management system for AI agents based on the AgeMem paper.
 * Provides shared persistent memory between agents without modifying RAG architecture.
 * 
 * Features:
 * - Core memory operations (Add, Search, Update, Delete)
 * - Context management (Summary, Filter)
 * - Memory quality scoring and decay
 * - Feedback loop for continuous improvement
 * - Maintenance utilities (cleanup, consolidation)
 * - Auto-injection wrapper for prompts
 * 
 * @example
 * ```typescript
 * // Blog Agent leaves a note
 * import { leaveNoteForProductAgent } from '@/lib/agent-memory';
 * 
 * leaveNoteForProductAgent({
 *   title: "Milwaukee brand guidelines",
 *   content: "Never compare Milwaukee to DeWalt in content",
 *   targetBrands: ["Milwaukee"],
 *   priority: "critical"
 * });
 * 
 * // Product Agent uses auto-inject
 * import { wrapPromptForProductAgent, recordMemoryUsage } from '@/lib/agent-memory';
 * 
 * const result = wrapPromptForProductAgent(prompt, product);
 * const response = await claude.complete(result.wrappedPrompt);
 * recordMemoryUsage({
 *   memoryIds: result.memoryIds,
 *   wasSuccessful: true,
 *   agentSource: 'product_agent'
 * });
 * ```
 */

// ============================================================================
// CORE MEMORY OPERATIONS
// ============================================================================

export {
  // Types
  type MemoryType,
  type AgentSource,
  type MemoryEntry,
  type SearchQuery,
  type SearchResult,
  type AddMemoryInput,
  type UpdateMemoryInput,
  type MemoryQualityScore,
  type FeedbackInput,
  type MemoryFeedback,
  
  // Core operations
  addMemory,
  searchMemory,
  updateMemory,
  deleteMemory,
  getMemory,
  getAllMemories,
  getMemoryStats,
  
  // Convenience functions
  getBusinessRulesFor,
  getCrossAgentNotes,
  leaveNoteForAgent,
  storeVerifiedFact,
  searchVerifiedFacts,
  
  // Quality & Feedback
  calculateMemoryQuality,
  markMemoryAsUseful,
  markMemoryAsProblematic,
  getMemoryFeedback,
  getMemoryEffectivenessReport,
  
  // Decay
  applyMemoryDecay
} from './agemem-core';

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

export {
  // Types
  type SummaryOptions,
  type FilterOptions,
  type ContextSummary,
  type FilterResult,
  
  // Functions
  summarizeContext,
  filterContext,
  optimizeContext
} from './context-management';

// ============================================================================
// MAINTENANCE
// ============================================================================

export {
  // Types
  type MaintenanceReport,
  type MaintenanceAction,
  type ConsolidationCandidate,
  
  // Cleanup
  cleanupExpiredMemories,
  cleanupLowQualityMemories,
  
  // Consolidation
  findConsolidationCandidates,
  executeConsolidation,
  
  // Full maintenance
  runFullMaintenance,
  getMemoryHealthReport
} from './maintenance';

// ============================================================================
// AUTO-INJECT
// ============================================================================

export {
  // Types
  type AutoInjectConfig,
  type InjectionResult,
  type MemoryUsageRecord,
  
  // Main function
  wrapPromptWithMemory,
  recordMemoryUsage,
  
  // Agent-specific wrappers
  wrapPromptForProductAgent,
  wrapPromptForBlogAgent,
  
  // Middleware
  createAutoInjectMiddleware,
  wrapPromptsWithMemory
} from './auto-inject';

// ============================================================================
// AGENT INTEGRATIONS
// ============================================================================

export {
  // Product Agent
  type ProductMemoryContext,
  type ProductInfo,
  getProductMemoryContext,
  storeProductFact,
  hasCriticalBlockers
} from './product-agent-integration';

export {
  // Blog Agent
  type BlogInsight,
  type CompetitorMention,
  leaveNoteForProductAgent,
  reportCompetitorToAvoid,
  shareBrandInsight,
  shareCategoryGuideline,
  shareProductInsight,
  getExistingBrandNotes,
  getExistingCategoryNotes,
  isCompetitorFlagged
} from './blog-agent-integration';
