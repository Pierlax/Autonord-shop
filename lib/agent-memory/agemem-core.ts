/**
 * AgeMem Lite - Shared Persistent Memory for Agents
 *
 * Based on: "Agentic Memory: Learning Unified Long-Term and Short-Term Memory
 * Management for Large Language Model Agents" (arXiv:2601.01885)
 *
 * This is a LITE implementation providing:
 * - AddMemory: Store new knowledge/notes
 * - SearchMemory: Find relevant memories
 * - UpdateMemory: Modify existing memories
 *
 * Design Principles:
 * - ADDITIVE layer - does not replace existing RAG architecture
 * - Enables cross-agent communication (Blog Agent → Product Agent)
 * - Granular Redis Hash storage — lock-free concurrent writes
 *
 * Storage schema (Redis v2):
 *   agemem:v2:entries   → Hash { memoryId  → JSON<MemoryEntry>  }
 *   agemem:v2:feedback  → Hash { feedbackId → JSON<MemoryFeedback> }
 *
 * Why v2 Hash instead of v1 single-blob?
 *   The old pattern was GET blob → array.push() → SET blob, which is a
 *   read-modify-write with a race window: concurrent agents overwrite each
 *   other's writes. With HSET, each write touches only its own field — two
 *   concurrent addMemory() calls for different IDs never collide.
 *
 * Migration: on first load, if v2 is empty, data from `agemem:v1:store`
 * (legacy blob key) is automatically migrated to the Hash structure.
 */

import * as fs from 'fs';
import { loggers } from '@/lib/logger';

const log = loggers.memory;
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export type MemoryType =
  | 'business_rule'      // "Non citare mai competitor X"
  | 'brand_note'         // "Milwaukee preferisce tono tecnico"
  | 'product_insight'    // "Questo prodotto ha problemi noti con..."
  | 'content_guideline'  // "Per categoria X, enfatizzare Y"
  | 'cross_agent_note'   // Generic note from one agent to another
  | 'verified_fact'      // Verified fact that can be reused
  | 'template';          // Reusable content template

export type AgentSource =
  | 'product_agent'      // Agente 1 - Enrichment prodotti
  | 'blog_agent'         // Agente 2 - Blog researcher
  | 'admin'              // Manual entries
  | 'system';            // Automated entries

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  source: AgentSource;

  // Content
  title: string;
  content: string;

  // Targeting (optional - for filtering)
  targetBrands?: string[];      // ["Milwaukee", "Makita"]
  targetCategories?: string[];  // ["trapani", "avvitatori"]
  targetProducts?: string[];    // Specific product handles

  // Metadata
  priority: 'critical' | 'high' | 'medium' | 'low';
  expiresAt?: number;           // Unix timestamp, undefined = never expires
  createdAt: number;
  updatedAt: number;

  // Usage tracking
  usageCount: number;
  lastUsedAt?: number;

  // Search optimization
  keywords: string[];
}

export interface SearchQuery {
  // Text search
  query?: string;
  keywords?: string[];

  // Filters
  types?: MemoryType[];
  sources?: AgentSource[];
  brands?: string[];
  categories?: string[];
  productHandle?: string;

  // Options
  limit?: number;
  minPriority?: 'critical' | 'high' | 'medium' | 'low';
  includeExpired?: boolean;
}

export interface SearchResult {
  entry: MemoryEntry;
  relevanceScore: number;
  matchedOn: string[];  // Which fields matched
}

export interface AddMemoryInput {
  type: MemoryType;
  source: AgentSource;
  title: string;
  content: string;
  targetBrands?: string[];
  targetCategories?: string[];
  targetProducts?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
  expiresAt?: number;
  keywords?: string[];
}

export interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  targetBrands?: string[];
  targetCategories?: string[];
  targetProducts?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
  expiresAt?: number;
  keywords?: string[];
}

// ============================================================================
// STORAGE BACKEND — Redis v2 Hash (primary) + JSON file (dev fallback)
//
// Priority:
//   1. Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set)
//   2. Local JSON file (dev / no Redis configured)
//
// Redis keys:
//   agemem:v2:entries   → Hash { id → JSON<MemoryEntry>   }  (no TTL)
//   agemem:v2:feedback  → Hash { id → JSON<MemoryFeedback> } (no TTL)
//   agemem:v1:store     → legacy blob key, read-only for one-time migration
// ============================================================================

const KEY_ENTRIES  = 'agemem:v2:entries';
const KEY_FEEDBACK = 'agemem:v2:feedback';
const KEY_LEGACY   = 'agemem:v1:store';  // Old blob key, read-only for migration
/**
 * Sorted Set used as an expiry index.
 * Score  = expiresAt timestamp in ms.
 * Member = memoryId.
 *
 * Why a separate ZSET and not a per-field TTL?
 *   Redis does not support per-field TTL inside a Hash (EXPIRE applies to the
 *   entire key). This index lets maintenance evict expired entries in O(log N)
 *   via: ZRANGEBYSCORE -inf now → HDEL entries … → ZREMRANGEBYSCORE -inf now
 *   No full HGETALL scan needed.
 */
const KEY_EXPIRY   = 'agemem:v2:expiry';

// Local JSON file — only used when Redis is absent (local dev)
const MEMORY_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'agent-memory.json')
  : path.join(process.cwd(), 'data', 'agent-memory.json');

// Internal store shape used for the JSON file fallback only
interface MemoryStore {
  version: string;
  lastUpdated: number;
  entries: MemoryEntry[];
}

// ── Redis low-level helpers ───────────────────────────────────────────────────

function getRedisConfig(): { url: string; token: string } | null {
  const url  = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redisCmd(command: (string | number)[]): Promise<unknown> {
  const cfg = getRedisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    const data = await res.json() as { result?: unknown };
    return data.result ?? null;
  } catch (err) {
    log.warn('[AgeMem] Redis command failed:', err);
    return null;
  }
}

/** HGETALL → returns { field: value } map or null. */
async function redisHGetAll(key: string): Promise<Record<string, string> | null> {
  const result = await redisCmd(['HGETALL', key]);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  return result as Record<string, string>;
}

/** HGET → returns the field value or null. */
async function redisHGet(key: string, field: string): Promise<string | null> {
  const result = await redisCmd(['HGET', key, field]);
  return typeof result === 'string' ? result : null;
}

/**
 * HSET key field value — atomic, lock-free.
 * Multiple concurrent callers with different fields never overwrite each other.
 */
async function redisHSet(key: string, field: string, value: string): Promise<void> {
  await redisCmd(['HSET', key, field, value]);
}

/** HDEL key field... — atomic removal of one or more fields. */
async function redisHDel(key: string, ...fields: string[]): Promise<void> {
  if (fields.length === 0) return;
  await redisCmd(['HDEL', key, ...fields]);
}

/**
 * Execute multiple Redis commands in a single HTTP round-trip via the
 * Upstash REST pipeline endpoint (`/pipeline`).
 * Returns one result per command in the same order.
 */
async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const cfg = getRedisConfig();
  if (!cfg) return commands.map(() => null);
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    const data = await res.json() as Array<{ result?: unknown }>;
    return data.map(r => r.result ?? null);
  } catch (err) {
    log.warn('[AgeMem] Redis pipeline failed:', err);
    return commands.map(() => null);
  }
}

/**
 * ZADD key score member — adds/updates a member with its score in a Sorted Set.
 * Used to register a memory ID in the expiry index.
 */
async function redisZAdd(key: string, score: number, member: string): Promise<void> {
  await redisCmd(['ZADD', key, score, member]);
}

/**
 * ZREM key member... — removes members from a Sorted Set.
 * Used to remove a memory ID from the expiry index when the entry is deleted.
 */
async function redisZRem(key: string, ...members: string[]): Promise<void> {
  if (members.length === 0) return;
  await redisCmd(['ZREM', key, ...members]);
}

// ── File helpers (local dev / backup) ────────────────────────────────────────

function loadFromFile(): MemoryStore {
  try {
    const dir = path.dirname(MEMORY_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(MEMORY_FILE_PATH)) {
      return { version: '2.0.0', lastUpdated: Date.now(), entries: [] };
    }
    return JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8')) as MemoryStore;
  } catch {
    return { version: '2.0.0', lastUpdated: Date.now(), entries: [] };
  }
}

function saveToFile(entries: MemoryEntry[]): void {
  try {
    const dir = path.dirname(MEMORY_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const store: MemoryStore = { version: '2.0.0', lastUpdated: Date.now(), entries };
    fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    // read-only fs on Vercel — expected, not an error
    log.warn('[AgeMem] saveToFile skipped (read-only fs):', err);
  }
}

// ── Granular loaders ──────────────────────────────────────────────────────────

/**
 * Load all MemoryEntry objects from Redis Hash (HGETALL).
 *
 * Migration path (one-time, automatic):
 *   If v2 hash is empty, reads the legacy `agemem:v1:store` blob and migrates
 *   each entry to individual Hash fields. Falls back to the JSON file if neither
 *   Redis key has data.
 */
async function loadAllEntries(): Promise<MemoryEntry[]> {
  const cfg = getRedisConfig();

  if (cfg) {
    const raw = await redisHGetAll(KEY_ENTRIES);

    // v2 Hash has data — happy path
    if (raw && Object.keys(raw).length > 0) {
      return Object.values(raw)
        .map(json => { try { return JSON.parse(json) as MemoryEntry; } catch { return null; } })
        .filter((e): e is MemoryEntry => e !== null);
    }

    // v2 is empty — check for legacy v1 blob
    try {
      const legacyRaw = await redisCmd(['GET', KEY_LEGACY]) as string | null;
      if (legacyRaw) {
        const legacyStore = JSON.parse(legacyRaw) as { entries?: MemoryEntry[] };
        if (legacyStore.entries && legacyStore.entries.length > 0) {
          log.info(`[AgeMem] Migrating ${legacyStore.entries.length} entries v1→v2 Hash`);
          const args: (string | number)[] = ['HSET', KEY_ENTRIES];
          for (const entry of legacyStore.entries) args.push(entry.id, JSON.stringify(entry));
          await redisCmd(args);
          saveToFile(legacyStore.entries);
          return legacyStore.entries;
        }
      }
    } catch (err) {
      log.warn('[AgeMem] v1→v2 migration failed:', err);
    }

    // Redis configured but no data yet — seed from file
    const fileStore = loadFromFile();
    if (fileStore.entries.length > 0) {
      log.info(`[AgeMem] Seeding Redis v2 from file (${fileStore.entries.length} entries)`);
      const args: (string | number)[] = ['HSET', KEY_ENTRIES];
      for (const entry of fileStore.entries) args.push(entry.id, JSON.stringify(entry));
      await redisCmd(args);
    }
    return fileStore.entries;
  }

  return loadFromFile().entries;
}

/** Load all MemoryFeedback objects from Redis Hash (HGETALL). */
async function loadAllFeedback(): Promise<MemoryFeedback[]> {
  const cfg = getRedisConfig();
  if (!cfg) return [];
  const raw = await redisHGetAll(KEY_FEEDBACK);
  if (!raw) return [];
  return Object.values(raw)
    .map(json => { try { return JSON.parse(json) as MemoryFeedback; } catch { return null; } })
    .filter((f): f is MemoryFeedback => f !== null);
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// CORE MEMORY OPERATIONS
// ============================================================================

/**
 * AddMemory - Store new knowledge/note in persistent memory.
 *
 * Lock-free: each call writes only its own field in the Hash.
 * Two concurrent addMemory() calls for different entries never overwrite each other.
 */
export async function addMemory(input: AddMemoryInput): Promise<MemoryEntry> {
  const autoKeywords = extractKeywords(input.title + ' ' + input.content);

  const entry: MemoryEntry = {
    id: generateId(),
    type: input.type,
    source: input.source,
    title: input.title,
    content: input.content,
    targetBrands: input.targetBrands,
    targetCategories: input.targetCategories,
    targetProducts: input.targetProducts,
    priority: input.priority || 'medium',
    expiresAt: input.expiresAt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    keywords: input.keywords || autoKeywords,
  };

  const json = JSON.stringify(entry);

  // Atomic HSET — no read needed, no race possible
  if (getRedisConfig()) {
    await redisHSet(KEY_ENTRIES, entry.id, json);
    // Register in expiry index only if the entry has a finite lifetime
    if (entry.expiresAt) {
      await redisZAdd(KEY_EXPIRY, entry.expiresAt, entry.id);
    }
  }

  // Keep file in sync (best-effort, local dev)
  const fileStore = loadFromFile();
  fileStore.entries.push(entry);
  saveToFile(fileStore.entries);

  log.info(`[AgeMem] Added memory: ${entry.id} - "${entry.title}"`);
  return entry;
}

/**
 * SearchMemory - Find relevant memories based on query.
 */
export async function searchMemory(query: SearchQuery): Promise<SearchResult[]> {
  const entries = await loadAllEntries();
  const now = Date.now();

  let results: SearchResult[] = [];

  for (const entry of entries) {
    if (!query.includeExpired && entry.expiresAt && entry.expiresAt < now) continue;
    if (query.types && query.types.length > 0 && !query.types.includes(entry.type)) continue;
    if (query.sources && query.sources.length > 0 && !query.sources.includes(entry.source)) continue;

    if (query.minPriority) {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      if (priorityOrder[entry.priority] < priorityOrder[query.minPriority]) continue;
    }

    if (query.brands && query.brands.length > 0) {
      const entryBrands = entry.targetBrands || [];
      const hasMatch = query.brands.some(b =>
        entryBrands.length === 0 ||
        entryBrands.some(eb => eb.toLowerCase() === b.toLowerCase())
      );
      if (!hasMatch && entryBrands.length > 0) continue;
    }

    if (query.categories && query.categories.length > 0) {
      const entryCategories = entry.targetCategories || [];
      const hasMatch = query.categories.some(c =>
        entryCategories.length === 0 ||
        entryCategories.some(ec => ec.toLowerCase() === c.toLowerCase())
      );
      if (!hasMatch && entryCategories.length > 0) continue;
    }

    if (query.productHandle) {
      const entryProducts = entry.targetProducts || [];
      if (entryProducts.length > 0 && !entryProducts.includes(query.productHandle)) continue;
    }

    const { score, matchedOn } = calculateRelevance(entry, query);
    if (score > 0 || (!query.query && !query.keywords)) {
      results.push({ entry, relevanceScore: score, matchedOn });
    }
  }

  results.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.entry.priority] - priorityOrder[a.entry.priority];
  });

  if (query.limit && query.limit > 0) results = results.slice(0, query.limit);

  // Update usage stats — individual HSET per entry (acceptable minor race on counts)
  if (results.length > 0) {
    const now2 = Date.now();
    for (const result of results) {
      const updated: MemoryEntry = {
        ...result.entry,
        usageCount: result.entry.usageCount + 1,
        lastUsedAt: now2,
      };
      if (getRedisConfig()) {
        await redisHSet(KEY_ENTRIES, updated.id, JSON.stringify(updated));
      }
    }
  }

  return results;
}

/**
 * UpdateMemory - Modify existing memory entry.
 * Read-modify-write on a single Hash field (HGET → mutate → HSET).
 */
export async function updateMemory(input: UpdateMemoryInput): Promise<MemoryEntry | null> {
  let entry: MemoryEntry | null = null;

  if (getRedisConfig()) {
    const raw = await redisHGet(KEY_ENTRIES, input.id);
    if (raw) {
      try { entry = JSON.parse(raw) as MemoryEntry; } catch (err) { log.warn('[AgeMem] Malformed MemoryEntry JSON in Redis (falling back to file):', err); }
    }
  }

  if (!entry) {
    // Fallback: scan file
    const fileStore = loadFromFile();
    entry = fileStore.entries.find(e => e.id === input.id) ?? null;
  }

  if (!entry) {
    log.warn(`[AgeMem] Memory not found: ${input.id}`);
    return null;
  }

  if (input.title !== undefined) entry.title = input.title;
  if (input.content !== undefined) entry.content = input.content;
  if (input.targetBrands !== undefined) entry.targetBrands = input.targetBrands;
  if (input.targetCategories !== undefined) entry.targetCategories = input.targetCategories;
  if (input.targetProducts !== undefined) entry.targetProducts = input.targetProducts;
  if (input.priority !== undefined) entry.priority = input.priority;
  if (input.expiresAt !== undefined) entry.expiresAt = input.expiresAt;
  if (input.keywords !== undefined) entry.keywords = input.keywords;
  entry.updatedAt = Date.now();

  if (input.title !== undefined || input.content !== undefined) {
    entry.keywords = extractKeywords(entry.title + ' ' + entry.content);
  }

  const json = JSON.stringify(entry);
  if (getRedisConfig()) await redisHSet(KEY_ENTRIES, entry.id, json);

  // Sync file
  const fileStore = loadFromFile();
  const idx = fileStore.entries.findIndex(e => e.id === input.id);
  if (idx !== -1) fileStore.entries[idx] = entry;
  else fileStore.entries.push(entry);
  saveToFile(fileStore.entries);

  log.info(`[AgeMem] Updated memory: ${entry.id} - "${entry.title}"`);
  return entry;
}

/**
 * DeleteMemory - Remove a memory entry.
 * Atomic: HDEL touches only the target field.
 */
export async function deleteMemory(id: string): Promise<boolean> {
  let found = false;

  if (getRedisConfig()) {
    const raw = await redisHGet(KEY_ENTRIES, id);
    if (raw) {
      await redisHDel(KEY_ENTRIES, id);
      // Always attempt ZREM — harmless if the entry had no expiresAt
      await redisZRem(KEY_EXPIRY, id);
      found = true;
      log.info(`[AgeMem] Deleted memory from Redis: ${id}`);
    }
  }

  // Sync file
  const fileStore = loadFromFile();
  const idx = fileStore.entries.findIndex(e => e.id === id);
  if (idx !== -1) {
    const removed = fileStore.entries.splice(idx, 1)[0];
    saveToFile(fileStore.entries);
    log.info(`[AgeMem] Deleted memory from file: ${id} - "${removed.title}"`);
    found = true;
  }

  if (!found) log.warn(`[AgeMem] Memory not found for deletion: ${id}`);
  return found;
}

/** GetMemory - Get a specific memory by ID. */
export async function getMemory(id: string): Promise<MemoryEntry | null> {
  if (getRedisConfig()) {
    const raw = await redisHGet(KEY_ENTRIES, id);
    if (raw) {
      try { return JSON.parse(raw) as MemoryEntry; } catch (err) { log.warn('[AgeMem] Malformed MemoryEntry JSON in Redis (falling back to file):', err); }
    }
  }
  const fileStore = loadFromFile();
  return fileStore.entries.find(e => e.id === id) ?? null;
}

/** GetAllMemories - Get all memories (for admin/debug). */
export async function getAllMemories(): Promise<MemoryEntry[]> {
  return loadAllEntries();
}

/**
 * EvictExpiredByIndex — O(log N) expiry using the ZSET index.
 *
 * Algorithm:
 *   1. ZRANGEBYSCORE agemem:v2:expiry -inf <now>  → IDs of expired entries
 *   2. HDEL agemem:v2:entries id1 id2 …           → remove entries (batch)
 *   3. ZREMRANGEBYSCORE agemem:v2:expiry -inf <now> → clean index
 *
 * This avoids loading the entire HGETALL (O(N) scan) used by the legacy
 * cleanupExpiredMemories(). Called by maintenance.ts when Redis is available.
 *
 * @returns IDs of entries that were deleted.
 */
export async function evictExpiredByIndex(): Promise<{ deleted: number; deletedIds: string[] }> {
  if (!getRedisConfig()) return { deleted: 0, deletedIds: [] };

  const now = Date.now();

  // Step 1: read expired IDs from the ZSET index  (O(log N + K))
  const raw = await redisCmd(['ZRANGEBYSCORE', KEY_EXPIRY, '-inf', now]) as string[] | null;
  if (!raw || raw.length === 0) return { deleted: 0, deletedIds: [] };

  // Step 2 + 3: atomically remove entries Hash fields AND index members in one
  // pipeline round-trip.
  //
  // Key insight: we use ZREM(...raw) instead of ZREMRANGEBYSCORE(-inf, now).
  // ZREMRANGEBYSCORE would remove everything up to `now`, but between Step 1
  // and this write, another addMemory() might have inserted an entry with an
  // expiresAt that falls within the same range. ZREM with the exact IDs we
  // read is precise: we remove only what we decided to evict, never a freshly
  // added entry that happens to share the time window.
  await redisPipeline([
    ['HDEL', KEY_ENTRIES, ...raw],
    ['ZREM', KEY_EXPIRY,  ...raw],
  ]);

  log.info(`[AgeMem] evictExpiredByIndex: evicted ${raw.length} entries`);
  return { deleted: raw.length, deletedIds: raw };
}

/** GetMemoryStats - Get statistics about the memory store. */
export async function getMemoryStats(): Promise<{
  totalEntries: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byPriority: Record<string, number>;
  expiredCount: number;
}> {
  const entries = await loadAllEntries();
  const now = Date.now();

  const stats = {
    totalEntries: entries.length,
    byType: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    expiredCount: 0,
  };

  for (const entry of entries) {
    stats.byType[entry.type]     = (stats.byType[entry.type] || 0) + 1;
    stats.bySource[entry.source] = (stats.bySource[entry.source] || 0) + 1;
    stats.byPriority[entry.priority] = (stats.byPriority[entry.priority] || 0) + 1;
    if (entry.expiresAt && entry.expiresAt < now) stats.expiredCount++;
  }

  return stats;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
    'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'o', 'ma', 'che', 'non', 'è', 'sono', 'essere',
    'the', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'to', 'of', 'for', 'on', 'with', 'at', 'by', 'from',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  return Array.from(new Set(words));
}

function calculateRelevance(
  entry: MemoryEntry,
  query: SearchQuery
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  const searchTerms: string[] = [];
  if (query.query) searchTerms.push(...query.query.toLowerCase().split(/\s+/));
  if (query.keywords) searchTerms.push(...query.keywords.map(k => k.toLowerCase()));

  if (searchTerms.length === 0) {
    const priorityScores = { critical: 4, high: 3, medium: 2, low: 1 };
    return { score: priorityScores[entry.priority], matchedOn: ['priority'] };
  }

  const titleLower    = entry.title.toLowerCase();
  const contentLower  = entry.content.toLowerCase();
  const keywordsLower = entry.keywords.map(k => k.toLowerCase());

  for (const term of searchTerms) {
    if (titleLower.includes(term)) {
      score += 10;
      if (!matchedOn.includes('title')) matchedOn.push('title');
    }
    if (keywordsLower.some(k => k.includes(term) || term.includes(k))) {
      score += 5;
      if (!matchedOn.includes('keywords')) matchedOn.push('keywords');
    }
    if (contentLower.includes(term)) {
      score += 2;
      if (!matchedOn.includes('content')) matchedOn.push('content');
    }
  }

  const priorityBoost = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.8 };
  score *= priorityBoost[entry.priority];

  const ageInDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7)       score *= 1.2;
  else if (ageInDays < 30) score *= 1.1;

  return { score, matchedOn };
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR AGENTS
// ============================================================================

export async function getBusinessRulesFor(options: {
  brand?: string;
  category?: string;
  productHandle?: string;
}): Promise<MemoryEntry[]> {
  const results = await searchMemory({
    types: ['business_rule', 'content_guideline'],
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined,
    productHandle: options.productHandle,
    minPriority: 'medium',
  });
  return results.map(r => r.entry);
}

export async function getCrossAgentNotes(options: {
  forAgent: AgentSource;
  brand?: string;
  category?: string;
}): Promise<MemoryEntry[]> {
  const results = await searchMemory({
    types: ['cross_agent_note', 'brand_note', 'product_insight'],
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined,
  });
  return results
    .filter(r => r.entry.source !== options.forAgent)
    .map(r => r.entry);
}

export async function leaveNoteForAgent(
  fromAgent: AgentSource,
  note: {
    title: string;
    content: string;
    targetBrands?: string[];
    targetCategories?: string[];
    priority?: 'critical' | 'high' | 'medium' | 'low';
  }
): Promise<MemoryEntry> {
  return addMemory({
    type: 'cross_agent_note',
    source: fromAgent,
    title: note.title,
    content: note.content,
    targetBrands: note.targetBrands,
    targetCategories: note.targetCategories,
    priority: note.priority || 'medium',
  });
}

export async function storeVerifiedFact(
  source: AgentSource,
  fact: {
    title: string;
    content: string;
    targetBrands?: string[];
    targetCategories?: string[];
    keywords?: string[];
  }
): Promise<MemoryEntry> {
  return addMemory({
    type: 'verified_fact',
    source,
    title: fact.title,
    content: fact.content,
    targetBrands: fact.targetBrands,
    targetCategories: fact.targetCategories,
    keywords: fact.keywords,
    priority: 'medium',
  });
}

export async function searchVerifiedFacts(options: {
  query?: string;
  brand?: string;
  category?: string;
  limit?: number;
}): Promise<MemoryEntry[]> {
  const results = await searchMemory({
    types: ['verified_fact'],
    query: options.query,
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined,
    limit: options.limit || 10,
  });
  return results.map(r => r.entry);
}

// ============================================================================
// MEMORY DECAY & QUALITY SCORING
// ============================================================================

export interface MemoryQualityScore {
  overall: number;
  components: {
    recency: number;
    usage: number;
    feedback: number;
    completeness: number;
  };
  recommendation: 'keep' | 'review' | 'archive' | 'delete';
}

export interface FeedbackInput {
  memoryId: string;
  type: 'useful' | 'not_useful' | 'outdated' | 'incorrect';
  reason?: string;
  agentSource?: AgentSource;
}

export interface MemoryFeedback {
  id: string;
  memoryId: string;
  type: 'useful' | 'not_useful' | 'outdated' | 'incorrect';
  reason?: string;
  agentSource?: AgentSource;
  createdAt: number;
}

export async function calculateMemoryQuality(entry: MemoryEntry): Promise<MemoryQualityScore> {
  const feedback = await loadAllFeedback();
  const now = Date.now();

  const ageInDays = (now - entry.updatedAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - ageInDays / 90);
  const usageScore = Math.min(1, entry.usageCount / 20);

  const entryFeedback = feedback.filter(f => f.memoryId === entry.id);
  const positiveCount = entryFeedback.filter(f => f.type === 'useful').length;
  const negativeCount = entryFeedback.filter(f =>
    f.type === 'not_useful' || f.type === 'outdated' || f.type === 'incorrect'
  ).length;

  let feedbackScore = 0.5;
  if (positiveCount + negativeCount > 0) {
    feedbackScore = positiveCount / (positiveCount + negativeCount);
  }

  let completeness = 0;
  if (entry.title && entry.title.length > 5) completeness += 0.25;
  if (entry.content && entry.content.length > 20) completeness += 0.25;
  if (entry.keywords && entry.keywords.length > 0) completeness += 0.25;
  if (entry.targetBrands || entry.targetCategories || entry.targetProducts) completeness += 0.25;

  const overall =
    recency * 0.25 +
    usageScore * 0.25 +
    feedbackScore * 0.35 +
    completeness * 0.15;

  let recommendation: 'keep' | 'review' | 'archive' | 'delete';
  if (overall >= 0.7)      recommendation = 'keep';
  else if (overall >= 0.4) recommendation = 'review';
  else if (overall >= 0.2) recommendation = 'archive';
  else                     recommendation = 'delete';

  if (entry.priority === 'critical') recommendation = 'keep';

  const recentNegative = entryFeedback.filter(
    f => (f.type === 'incorrect' || f.type === 'outdated') &&
         now - f.createdAt < 7 * 24 * 60 * 60 * 1000
  );
  if (recentNegative.length > 0) recommendation = 'review';

  return { overall, components: { recency, usage: usageScore, feedback: feedbackScore, completeness }, recommendation };
}

// ============================================================================
// FEEDBACK LOOP
// ============================================================================

/** Mark a memory as useful (positive feedback). Atomic HSET for the feedback entry. */
export async function markMemoryAsUseful(memoryId: string, agentSource?: AgentSource): Promise<void> {
  const fbId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fb: MemoryFeedback = { id: fbId, memoryId, type: 'useful', agentSource, createdAt: Date.now() };

  if (getRedisConfig()) {
    await redisHSet(KEY_FEEDBACK, fbId, JSON.stringify(fb));

    // Possibly upgrade priority — read-modify-write on single entry (low race risk)
    const raw = await redisHGet(KEY_ENTRIES, memoryId);
    if (raw) {
      try {
        const entry = JSON.parse(raw) as MemoryEntry;
        const allFb = await loadAllFeedback();
        const usefulCount = allFb.filter(f => f.memoryId === memoryId && f.type === 'useful').length;
        let changed = false;
        if (usefulCount >= 10 && entry.priority === 'medium') { entry.priority = 'high'; changed = true; }
        else if (usefulCount >= 5 && entry.priority === 'low')  { entry.priority = 'medium'; changed = true; }
        if (changed) {
          entry.updatedAt = Date.now();
          await redisHSet(KEY_ENTRIES, memoryId, JSON.stringify(entry));
          log.info(`[AgeMem] Upgraded memory ${memoryId} to ${entry.priority} priority`);
        }
      } catch (err) { log.warn(`[AgeMem] Priority upgrade for ${memoryId} failed (non-fatal):`, err); }
    }
  }

  log.info(`[AgeMem] Marked memory ${memoryId} as useful`);
}

/** Mark a memory as problematic (negative feedback). Atomic HSET for the feedback entry. */
export async function markMemoryAsProblematic(
  memoryId: string,
  type: 'not_useful' | 'outdated' | 'incorrect',
  reason?: string,
  agentSource?: AgentSource
): Promise<void> {
  const fbId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fb: MemoryFeedback = { id: fbId, memoryId, type, reason, agentSource, createdAt: Date.now() };

  if (getRedisConfig()) {
    await redisHSet(KEY_FEEDBACK, fbId, JSON.stringify(fb));

    // Possibly downgrade priority
    const raw = await redisHGet(KEY_ENTRIES, memoryId);
    if (raw) {
      try {
        const entry = JSON.parse(raw) as MemoryEntry;
        const allFb = await loadAllFeedback();
        const negativeCount = allFb.filter(
          f => f.memoryId === memoryId &&
               (f.type === 'not_useful' || f.type === 'outdated' || f.type === 'incorrect')
        ).length;
        let changed = false;
        if (negativeCount >= 3 && entry.priority === 'high')   { entry.priority = 'medium'; changed = true; }
        else if (negativeCount >= 3 && entry.priority === 'medium') { entry.priority = 'low'; changed = true; }
        if (changed) {
          entry.updatedAt = Date.now();
          await redisHSet(KEY_ENTRIES, memoryId, JSON.stringify(entry));
          log.info(`[AgeMem] Downgraded memory ${memoryId} to ${entry.priority} priority`);
        }
        if (type === 'incorrect' && negativeCount >= 2) {
          log.warn(`[AgeMem] Memory ${memoryId} flagged for review — multiple 'incorrect' reports`);
        }
      } catch (err) { log.warn(`[AgeMem] Priority downgrade for ${memoryId} failed (non-fatal):`, err); }
    }
  }

  log.info(`[AgeMem] Marked memory ${memoryId} as ${type}${reason ? `: ${reason}` : ''}`);
}

export async function getMemoryFeedback(memoryId: string): Promise<MemoryFeedback[]> {
  const all = await loadAllFeedback();
  return all.filter(f => f.memoryId === memoryId);
}

export async function getMemoryEffectivenessReport(): Promise<{
  totalMemories: number;
  withFeedback: number;
  averageQuality: number;
  byRecommendation: Record<string, number>;
  topPerformers: Array<{ id: string; title: string; quality: number }>;
  needsReview: Array<{ id: string; title: string; quality: number; reason: string }>;
}> {
  const entries  = await loadAllEntries();
  const feedback = await loadAllFeedback();

  const report = {
    totalMemories: entries.length,
    withFeedback: 0,
    averageQuality: 0,
    byRecommendation: {} as Record<string, number>,
    topPerformers: [] as Array<{ id: string; title: string; quality: number }>,
    needsReview:   [] as Array<{ id: string; title: string; quality: number; reason: string }>,
  };

  const qualities: Array<{ entry: MemoryEntry; quality: MemoryQualityScore }> = [];

  for (const entry of entries) {
    const quality = await calculateMemoryQuality(entry);
    qualities.push({ entry, quality });
    report.byRecommendation[quality.recommendation] =
      (report.byRecommendation[quality.recommendation] || 0) + 1;
    if (feedback.some(f => f.memoryId === entry.id)) report.withFeedback++;
  }

  if (qualities.length > 0) {
    report.averageQuality =
      qualities.reduce((sum, q) => sum + q.quality.overall, 0) / qualities.length;
  }

  report.topPerformers = qualities
    .filter(q => q.quality.overall >= 0.7)
    .sort((a, b) => b.quality.overall - a.quality.overall)
    .slice(0, 10)
    .map(q => ({ id: q.entry.id, title: q.entry.title, quality: q.quality.overall }));

  report.needsReview = qualities
    .filter(q => q.quality.recommendation === 'review' || q.quality.recommendation === 'delete')
    .map(q => {
      let reason = '';
      if (q.quality.components.feedback < 0.3)  reason = 'Low feedback score';
      else if (q.quality.components.recency < 0.2) reason = 'Outdated';
      else if (q.quality.components.usage < 0.1)   reason = 'Rarely used';
      else                                          reason = 'Low overall quality';
      return { id: q.entry.id, title: q.entry.title, quality: q.quality.overall, reason };
    });

  return report;
}

// ============================================================================
// MEMORY DECAY
// ============================================================================

export async function applyMemoryDecay(options: {
  daysUntilDecay?: number;
  daysUntilArchive?: number;
  protectCritical?: boolean;
} = {}): Promise<{ decayed: number; flaggedForArchive: number; unchanged: number }> {
  const {
    daysUntilDecay   = 30,
    daysUntilArchive = 90,
    protectCritical  = true,
  } = options;

  const entries = await loadAllEntries();
  const now = Date.now();
  let decayed = 0, flaggedForArchive = 0, unchanged = 0;

  for (const entry of entries) {
    if (protectCritical && entry.priority === 'critical') { unchanged++; continue; }

    const lastActivity = entry.lastUsedAt || entry.updatedAt;
    const ageInDays = (now - lastActivity) / (1000 * 60 * 60 * 24);
    let changed = false;

    if (ageInDays > daysUntilArchive && !entry.expiresAt) {
      entry.expiresAt = now + 30 * 24 * 60 * 60 * 1000;
      flaggedForArchive++;
      changed = true;
      log.info(`[AgeMem] Flagged ${entry.id} for archive (${Math.round(ageInDays)}d inactive)`);
    } else if (ageInDays > daysUntilDecay) {
      if (entry.priority === 'high') {
        entry.priority = 'medium'; decayed++; changed = true;
        log.info(`[AgeMem] Decayed ${entry.id} high→medium (${Math.round(ageInDays)}d inactive)`);
      } else if (entry.priority === 'medium' && ageInDays > daysUntilDecay * 2) {
        entry.priority = 'low'; decayed++; changed = true;
        log.info(`[AgeMem] Decayed ${entry.id} medium→low (${Math.round(ageInDays)}d inactive)`);
      } else {
        unchanged++;
      }
    } else {
      unchanged++;
    }

    if (changed) {
      entry.updatedAt = now;
      if (getRedisConfig()) await redisHSet(KEY_ENTRIES, entry.id, JSON.stringify(entry));
    }
  }

  // Sync file
  saveToFile(entries);

  return { decayed, flaggedForArchive, unchanged };
}
