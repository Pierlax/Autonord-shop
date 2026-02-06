/**
 * Memory Service — Long-Term Knowledge Store
 * 
 * Inspired by OpenClaw's Memory module. Provides a persistent knowledge
 * store with semantic search capabilities for the AI pipeline.
 * 
 * Architecture:
 * - In-memory vector store (can be replaced with Pinecone/Weaviate later)
 * - Cosine similarity search for semantic retrieval
 * - Namespace-based organization (products, articles, learnings, etc.)
 * - Automatic embedding generation via OpenAI-compatible API
 * 
 * This replaces the existing agent-memory module with a more structured,
 * searchable, and scalable approach.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('memory-service');

// =============================================================================
// TYPES
// =============================================================================

export type MemoryNamespace = 
  | 'products'      // Product knowledge (specs, reviews, comparisons)
  | 'articles'      // Blog article content and research
  | 'learnings'     // AI learnings from corrections and feedback
  | 'enrichments'   // Enrichment results and metadata
  | 'sources'       // Verified source URLs and their reliability
  | 'general';      // General knowledge

export interface MemoryEntry {
  id: string;
  namespace: MemoryNamespace;
  /** The text content to be embedded and searched */
  content: string;
  /** Structured metadata for filtering */
  metadata: Record<string, unknown>;
  /** The embedding vector (computed on store) */
  embedding?: number[];
  /** When this entry was created */
  createdAt: string;
  /** When this entry was last accessed */
  lastAccessedAt: string;
  /** Number of times this entry was retrieved */
  accessCount: number;
  /** Source of this memory (skill name, user, etc.) */
  source: string;
  /** Tags for additional filtering */
  tags: string[];
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  distance: number;
}

export interface StoreInput {
  namespace: MemoryNamespace;
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  tags?: string[];
}

export interface SearchInput {
  query: string;
  namespace?: MemoryNamespace;
  limit?: number;
  minScore?: number;
  tags?: string[];
}

// =============================================================================
// IN-MEMORY VECTOR STORE
// =============================================================================

const store = new Map<string, MemoryEntry>();
const EMBEDDING_DIMENSION = 256; // Lightweight embeddings for in-memory use

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// SIMPLE EMBEDDING (TF-IDF-like for in-memory use)
// =============================================================================

/**
 * Generate a simple hash-based embedding for text.
 * This is a lightweight alternative to API-based embeddings.
 * For production, replace with OpenAI/Cohere embeddings.
 */
function generateSimpleEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9àáâãäåèéêëìíîïòóôõöùúûü\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const embedding = new Array(EMBEDDING_DIMENSION).fill(0);

  for (const word of words) {
    // Hash each word to a position in the embedding vector
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const pos = Math.abs(hash) % EMBEDDING_DIMENSION;
    embedding[pos] += 1;

    // Bigram hashing for better semantic capture
    if (word.length > 2) {
      for (let i = 0; i < word.length - 1; i++) {
        const bigram = word.substring(i, i + 2);
        let bHash = 0;
        for (let j = 0; j < bigram.length; j++) {
          bHash = ((bHash << 5) - bHash + bigram.charCodeAt(j)) | 0;
        }
        const bPos = Math.abs(bHash) % EMBEDDING_DIMENSION;
        embedding[bPos] += 0.5;
      }
    }
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude > 0 ? dot / magnitude : 0;
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Store a new memory entry.
 */
export function storeMemory(input: StoreInput): MemoryEntry {
  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: generateId(),
    namespace: input.namespace,
    content: input.content,
    metadata: input.metadata || {},
    embedding: generateSimpleEmbedding(input.content),
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    source: input.source || 'system',
    tags: input.tags || [],
  };

  store.set(entry.id, entry);
  log.debug(`Memory stored: [${entry.namespace}] ${entry.content.substring(0, 80)}...`);
  return entry;
}

/**
 * Search memories by semantic similarity.
 */
export function searchMemory(input: SearchInput): MemorySearchResult[] {
  const queryEmbedding = generateSimpleEmbedding(input.query);
  const limit = input.limit || 10;
  const minScore = input.minScore || 0.1;

  const results: MemorySearchResult[] = [];

  for (const entry of store.values()) {
    // Filter by namespace
    if (input.namespace && entry.namespace !== input.namespace) continue;

    // Filter by tags
    if (input.tags && input.tags.length > 0) {
      const hasTag = input.tags.some((t) => entry.tags.includes(t));
      if (!hasTag) continue;
    }

    // Compute similarity
    if (!entry.embedding) continue;
    const score = cosineSimilarity(queryEmbedding, entry.embedding);

    if (score >= minScore) {
      results.push({
        entry,
        score,
        distance: 1 - score,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Update access counts
  const topResults = results.slice(0, limit);
  for (const result of topResults) {
    result.entry.accessCount++;
    result.entry.lastAccessedAt = new Date().toISOString();
  }

  return topResults;
}

/**
 * Get a memory entry by ID.
 */
export function getMemory(id: string): MemoryEntry | null {
  return store.get(id) || null;
}

/**
 * Delete a memory entry.
 */
export function deleteMemory(id: string): boolean {
  return store.delete(id);
}

/**
 * List all memories in a namespace.
 */
export function listMemories(namespace?: MemoryNamespace): MemoryEntry[] {
  const entries = Array.from(store.values());
  if (namespace) {
    return entries.filter((e) => e.namespace === namespace);
  }
  return entries;
}

/**
 * Get memory statistics.
 */
export function getMemoryStats(): {
  totalEntries: number;
  byNamespace: Record<string, number>;
  totalAccessCount: number;
  oldestEntry?: string;
  newestEntry?: string;
} {
  const byNamespace: Record<string, number> = {};
  let totalAccessCount = 0;
  let oldest: string | undefined;
  let newest: string | undefined;

  for (const entry of store.values()) {
    byNamespace[entry.namespace] = (byNamespace[entry.namespace] || 0) + 1;
    totalAccessCount += entry.accessCount;

    if (!oldest || entry.createdAt < oldest) oldest = entry.createdAt;
    if (!newest || entry.createdAt > newest) newest = entry.createdAt;
  }

  return {
    totalEntries: store.size,
    byNamespace,
    totalAccessCount,
    oldestEntry: oldest,
    newestEntry: newest,
  };
}

/**
 * Clear all memories (for testing).
 */
export function clearMemory(): void {
  store.clear();
  log.info('Memory store cleared');
}

// =============================================================================
// CONVENIENCE METHODS
// =============================================================================

/**
 * Store a product learning (e.g., from enrichment corrections).
 */
export function storeProductLearning(
  productTitle: string,
  learning: string,
  source: string
): MemoryEntry {
  return storeMemory({
    namespace: 'learnings',
    content: `Product "${productTitle}": ${learning}`,
    metadata: { productTitle, type: 'product-learning' },
    source,
    tags: ['product', productTitle.toLowerCase().split(' ')[0]],
  });
}

/**
 * Store an enrichment result for future reference.
 */
export function storeEnrichmentResult(
  productId: string,
  productTitle: string,
  summary: string,
  confidence: number
): MemoryEntry {
  return storeMemory({
    namespace: 'enrichments',
    content: `Enrichment for "${productTitle}" (${productId}): ${summary}`,
    metadata: { productId, productTitle, confidence },
    source: 'product-enrichment',
    tags: ['enrichment', `confidence-${Math.round(confidence / 10) * 10}`],
  });
}

/**
 * Search for relevant product knowledge.
 */
export function searchProductKnowledge(
  query: string,
  limit: number = 5
): MemorySearchResult[] {
  return searchMemory({
    query,
    namespace: 'products',
    limit,
    minScore: 0.15,
  });
}

/**
 * Search for relevant learnings.
 */
export function searchLearnings(
  query: string,
  limit: number = 5
): MemorySearchResult[] {
  return searchMemory({
    query,
    namespace: 'learnings',
    limit,
    minScore: 0.15,
  });
}
