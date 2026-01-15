/**
 * AgeMem Lite - Shared Persistent Memory for Agents
 * 
 * Based on: "Agentic Memory: Learning Unified Long-Term and Short-Term Memory
 * Management for Large Language Model Agents" (arXiv:2601.01885)
 * 
 * This module provides a shared memory layer that enables cross-agent
 * communication without modifying the existing RAG architecture.
 */

// Core memory operations and types
export {
  // Types
  type MemoryType,
  type AgentSource,
  type MemoryEntry,
  type SearchQuery,
  type SearchResult,
  type AddMemoryInput,
  type UpdateMemoryInput,
  
  // Core Operations
  addMemory,
  searchMemory,
  updateMemory,
  deleteMemory,
  getMemory,
  getAllMemories,
  getMemoryStats,
  
  // Convenience Functions
  getBusinessRulesFor,
  getCrossAgentNotes,
  leaveNoteForAgent,
  storeVerifiedFact,
  searchVerifiedFacts
} from './agemem-core';

// Product Agent integration
export {
  type ProductMemoryContext,
  type ProductInfo,
  getProductMemoryContext,
  storeProductFact,
  hasCriticalBlockers
} from './product-agent-integration';

// Blog Agent integration
export {
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
