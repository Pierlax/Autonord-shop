/**
 * Memory Module — Public API
 */

export type {
  MemoryNamespace,
  MemoryEntry,
  MemorySearchResult,
  StoreInput,
  SearchInput,
} from './service';

export {
  storeMemory,
  searchMemory,
  getMemory,
  deleteMemory,
  listMemories,
  getMemoryStats,
  clearMemory,
  storeProductLearning,
  storeEnrichmentResult,
  searchProductKnowledge,
  searchLearnings,
} from './service';
