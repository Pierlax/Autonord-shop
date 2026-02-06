/**
 * RAG Cache - Search Result Caching Layer
 * 
 * Caches web search results to avoid redundant API calls and reduce costs.
 * Supports two storage backends:
 * 
 *   1. Upstash Redis (production) — requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. In-Memory Map (dev/fallback) — persists only during the current process lifetime
 * 
 * Cache key: SHA-256 hash of (query + sorted domain filter)
 * TTL: Configurable per search intent (specs = 7 days, reviews = 3 days, etc.)
 * 
 * Usage:
 *   import { cachedSearch } from './rag-cache';
 *   const results = await cachedSearch('Milwaukee M18 specs', ['milwaukeetool.eu'], 'specs');
 */

import { loggers } from '@/lib/logger';
import { SearchResult } from './search-client';

const log = loggers.shopify;

// =============================================================================
// TYPES
// =============================================================================

export interface CacheEntry {
  /** The cached search results */
  results: SearchResult[];
  /** ISO timestamp when the entry was created */
  cachedAt: string;
  /** ISO timestamp when the entry expires */
  expiresAt: string;
  /** The original query used to generate this cache entry */
  query: string;
  /** Domain filter used (if any) */
  domains: string[];
  /** Search provider that produced these results */
  provider: string;
  /** Number of results cached */
  resultCount: number;
}

export interface CacheStats {
  /** Total number of cache lookups */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Hit rate as a percentage */
  hitRate: number;
  /** Number of entries currently in cache */
  entryCount: number;
  /** Storage backend in use */
  backend: 'redis' | 'memory';
}

/**
 * TTL configuration per search intent.
 * Technical specs change rarely, reviews change more often.
 */
export type CacheIntent = 'specs' | 'reviews' | 'manuals' | 'images' | 'default';

const TTL_BY_INTENT: Record<CacheIntent, number> = {
  specs: 7 * 24 * 60 * 60 * 1000,     // 7 days — specs rarely change
  manuals: 14 * 24 * 60 * 60 * 1000,  // 14 days — manuals almost never change
  reviews: 3 * 24 * 60 * 60 * 1000,   // 3 days — reviews update more frequently
  images: 7 * 24 * 60 * 60 * 1000,    // 7 days — product images are stable
  default: 5 * 24 * 60 * 60 * 1000,   // 5 days — general default
};

// =============================================================================
// CACHE KEY GENERATION
// =============================================================================

/**
 * Generates a deterministic cache key from query + domain filter.
 * Uses a simple hash function (no crypto dependency needed at runtime).
 * 
 * Key format: `rag:v1:<hash>`
 */
function generateCacheKey(query: string, domains?: string[]): string {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedDomains = domains ? [...domains].sort().join(',') : '';
  const input = `${normalizedQuery}|${normalizedDomains}`;
  
  // Simple but effective hash (djb2 algorithm)
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string
  const hexHash = (hash >>> 0).toString(16).padStart(8, '0');
  return `rag:v1:${hexHash}`;
}

// =============================================================================
// STORAGE BACKENDS
// =============================================================================

interface CacheBackend {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

// --- In-Memory Backend ---

class MemoryCacheBackend implements CacheBackend {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check expiration
    if (new Date(entry.expiresAt) < new Date()) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async size(): Promise<number> {
    // Clean expired entries first
    const now = new Date();
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (new Date(entry.expiresAt) < now) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}

// --- Upstash Redis Backend ---

class RedisCacheBackend implements CacheBackend {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private async redisCommand(command: string[]): Promise<any> {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  }

  async get(key: string): Promise<CacheEntry | null> {
    try {
      const raw = await this.redisCommand(['GET', key]);
      if (!raw) return null;

      const entry: CacheEntry = JSON.parse(raw);

      // Check expiration (Redis TTL handles this too, but double-check)
      if (new Date(entry.expiresAt) < new Date()) {
        await this.delete(key);
        return null;
      }

      return entry;
    } catch (error) {
      log.error(`[RAGCache] Redis GET error for ${key}:`, error);
      return null;
    }
  }

  async set(key: string, entry: CacheEntry, ttlMs: number): Promise<void> {
    try {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.redisCommand(['SET', key, JSON.stringify(entry), 'EX', String(ttlSeconds)]);
    } catch (error) {
      log.error(`[RAGCache] Redis SET error for ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redisCommand(['DEL', key]);
    } catch (error) {
      log.error(`[RAGCache] Redis DEL error for ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      // Delete all keys with our prefix
      const keys = await this.redisCommand(['KEYS', 'rag:v1:*']);
      if (keys && keys.length > 0) {
        await this.redisCommand(['DEL', ...keys]);
      }
    } catch (error) {
      log.error('[RAGCache] Redis CLEAR error:', error);
    }
  }

  async size(): Promise<number> {
    try {
      const keys = await this.redisCommand(['KEYS', 'rag:v1:*']);
      return keys ? keys.length : 0;
    } catch {
      return 0;
    }
  }
}

// =============================================================================
// CACHE MANAGER (SINGLETON)
// =============================================================================

class RAGCacheManager {
  private backend: CacheBackend;
  private stats = { hits: 0, misses: 0 };
  private backendType: 'redis' | 'memory';

  constructor() {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
      this.backend = new RedisCacheBackend(redisUrl, redisToken);
      this.backendType = 'redis';
      log.info('[RAGCache] Initialized with Upstash Redis backend');
    } else {
      this.backend = new MemoryCacheBackend();
      this.backendType = 'memory';
      log.info('[RAGCache] Initialized with in-memory backend (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for Redis)');
    }
  }

  /**
   * Look up cached results for a query.
   */
  async get(query: string, domains?: string[]): Promise<CacheEntry | null> {
    const key = generateCacheKey(query, domains);
    const entry = await this.backend.get(key);

    if (entry) {
      this.stats.hits++;
      log.info(`[RAGCache] HIT for "${query.substring(0, 50)}..." (${entry.resultCount} results, cached ${entry.cachedAt})`);
      return entry;
    }

    this.stats.misses++;
    log.info(`[RAGCache] MISS for "${query.substring(0, 50)}..."`);
    return null;
  }

  /**
   * Store search results in cache.
   */
  async set(
    query: string,
    domains: string[] | undefined,
    results: SearchResult[],
    intent: CacheIntent = 'default'
  ): Promise<void> {
    const key = generateCacheKey(query, domains);
    const ttlMs = TTL_BY_INTENT[intent];
    const now = new Date();

    const entry: CacheEntry = {
      results,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      query,
      domains: domains || [],
      provider: results[0]?.provider || 'unknown',
      resultCount: results.length,
    };

    await this.backend.set(key, entry, ttlMs);
    log.info(`[RAGCache] STORED ${results.length} results for "${query.substring(0, 50)}..." (TTL: ${Math.round(ttlMs / 86400000)}d)`);
  }

  /**
   * Invalidate a specific cache entry.
   */
  async invalidate(query: string, domains?: string[]): Promise<void> {
    const key = generateCacheKey(query, domains);
    await this.backend.delete(key);
    log.info(`[RAGCache] INVALIDATED cache for "${query.substring(0, 50)}..."`);
  }

  /**
   * Clear all cached entries.
   */
  async clearAll(): Promise<void> {
    await this.backend.clear();
    this.stats = { hits: 0, misses: 0 };
    log.info('[RAGCache] All cache entries cleared');
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      entryCount: await this.backend.size(),
      backend: this.backendType,
    };
  }
}

// Singleton instance
let cacheInstance: RAGCacheManager | null = null;

function getCacheManager(): RAGCacheManager {
  if (!cacheInstance) {
    cacheInstance = new RAGCacheManager();
  }
  return cacheInstance;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Performs a cached web search.
 * 
 * 1. Checks cache for existing results
 * 2. If cache hit → returns cached results immediately
 * 3. If cache miss → calls performWebSearch(), caches results, returns them
 * 
 * @param query - The search query
 * @param domainFilter - Optional domain restriction
 * @param intent - Cache intent (determines TTL)
 * @param searchFn - The actual search function to call on cache miss
 * @returns Search results (from cache or fresh)
 */
export async function cachedSearch(
  query: string,
  domainFilter: string[] | undefined,
  intent: CacheIntent,
  searchFn: (query: string, domains?: string[]) => Promise<SearchResult[]>
): Promise<SearchResult[]> {
  const cache = getCacheManager();

  // 1. Check cache
  const cached = await cache.get(query, domainFilter);
  if (cached) {
    return cached.results;
  }

  // 2. Cache miss — perform real search
  const results = await searchFn(query, domainFilter);

  // 3. Cache the results (only if we got real results)
  if (results.length > 0) {
    await cache.set(query, domainFilter, results, intent);
  }

  return results;
}

/**
 * Invalidate cache for a specific query.
 */
export async function invalidateCache(query: string, domains?: string[]): Promise<void> {
  const cache = getCacheManager();
  await cache.invalidate(query, domains);
}

/**
 * Clear all RAG cache entries.
 */
export async function clearAllCache(): Promise<void> {
  const cache = getCacheManager();
  await cache.clearAll();
}

/**
 * Get cache statistics for monitoring.
 */
export async function getCacheStats(): Promise<CacheStats> {
  const cache = getCacheManager();
  return cache.getStats();
}
