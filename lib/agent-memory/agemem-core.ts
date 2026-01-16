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
 * - Simple JSON storage for now (can upgrade to Redis/DB later)
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
// STORAGE BACKEND (JSON File)
// ============================================================================

const MEMORY_FILE_PATH = path.join(process.cwd(), 'data', 'agent-memory.json');

interface MemoryStore {
  version: string;
  lastUpdated: number;
  entries: MemoryEntry[];
}

function ensureDataDir(): void {
  const dataDir = path.dirname(MEMORY_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadMemoryStore(): MemoryStore {
  ensureDataDir();
  
  if (!fs.existsSync(MEMORY_FILE_PATH)) {
    const initialStore: MemoryStore = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      entries: []
    };
    fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(initialStore, null, 2));
    return initialStore;
  }
  
  try {
    const data = fs.readFileSync(MEMORY_FILE_PATH, 'utf-8');
    return JSON.parse(data) as MemoryStore;
  } catch (error) {
    log.error('[AgeMem] Error loading memory store:', error);
    return { version: '1.0.0', lastUpdated: Date.now(), entries: [] };
  }
}

function saveMemoryStore(store: MemoryStore): void {
  ensureDataDir();
  store.lastUpdated = Date.now();
  fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(store, null, 2));
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// CORE MEMORY OPERATIONS
// ============================================================================

/**
 * AddMemory - Store new knowledge/note in persistent memory
 * 
 * Use cases:
 * - Blog Agent leaves note: "Non citare competitor X per brand Y"
 * - Product Agent stores verified fact for reuse
 * - Admin adds business rule
 */
export function addMemory(input: AddMemoryInput): MemoryEntry {
  const store = loadMemoryStore();
  
  // Auto-generate keywords from title and content if not provided
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
    keywords: input.keywords || autoKeywords
  };
  
  store.entries.push(entry);
  saveMemoryStore(store);
  
  log.info(`[AgeMem] Added memory: ${entry.id} - "${entry.title}"`);
  
  return entry;
}

/**
 * SearchMemory - Find relevant memories based on query
 * 
 * Use cases:
 * - Product Agent checks for business rules before generating content
 * - Blog Agent looks for existing insights about a brand
 * - System retrieves templates for a category
 */
export function searchMemory(query: SearchQuery): SearchResult[] {
  const store = loadMemoryStore();
  const now = Date.now();
  
  let results: SearchResult[] = [];
  
  for (const entry of store.entries) {
    // Skip expired entries unless explicitly requested
    if (!query.includeExpired && entry.expiresAt && entry.expiresAt < now) {
      continue;
    }
    
    // Apply filters
    if (query.types && query.types.length > 0 && !query.types.includes(entry.type)) {
      continue;
    }
    
    if (query.sources && query.sources.length > 0 && !query.sources.includes(entry.source)) {
      continue;
    }
    
    if (query.minPriority) {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      if (priorityOrder[entry.priority] < priorityOrder[query.minPriority]) {
        continue;
      }
    }
    
    // Brand filter
    if (query.brands && query.brands.length > 0) {
      const entryBrands = entry.targetBrands || [];
      const hasMatchingBrand = query.brands.some(b => 
        entryBrands.length === 0 || // No target = applies to all
        entryBrands.some(eb => eb.toLowerCase() === b.toLowerCase())
      );
      if (!hasMatchingBrand && entryBrands.length > 0) continue;
    }
    
    // Category filter
    if (query.categories && query.categories.length > 0) {
      const entryCategories = entry.targetCategories || [];
      const hasMatchingCategory = query.categories.some(c => 
        entryCategories.length === 0 || // No target = applies to all
        entryCategories.some(ec => ec.toLowerCase() === c.toLowerCase())
      );
      if (!hasMatchingCategory && entryCategories.length > 0) continue;
    }
    
    // Product filter
    if (query.productHandle) {
      const entryProducts = entry.targetProducts || [];
      if (entryProducts.length > 0 && !entryProducts.includes(query.productHandle)) {
        continue;
      }
    }
    
    // Calculate relevance score
    const { score, matchedOn } = calculateRelevance(entry, query);
    
    if (score > 0 || (!query.query && !query.keywords)) {
      results.push({
        entry,
        relevanceScore: score,
        matchedOn
      });
    }
  }
  
  // Sort by relevance (descending), then by priority
  results.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.entry.priority] - priorityOrder[a.entry.priority];
  });
  
  // Apply limit
  if (query.limit && query.limit > 0) {
    results = results.slice(0, query.limit);
  }
  
  // Update usage stats for returned entries
  if (results.length > 0) {
    const store = loadMemoryStore();
    for (const result of results) {
      const entry = store.entries.find(e => e.id === result.entry.id);
      if (entry) {
        entry.usageCount++;
        entry.lastUsedAt = Date.now();
      }
    }
    saveMemoryStore(store);
  }
  
  return results;
}

/**
 * UpdateMemory - Modify existing memory entry
 * 
 * Use cases:
 * - Correct outdated information
 * - Extend expiration
 * - Add more target filters
 */
export function updateMemory(input: UpdateMemoryInput): MemoryEntry | null {
  const store = loadMemoryStore();
  
  const entryIndex = store.entries.findIndex(e => e.id === input.id);
  if (entryIndex === -1) {
    log.warn(`[AgeMem] Memory not found: ${input.id}`);
    return null;
  }
  
  const entry = store.entries[entryIndex];
  
  // Update fields if provided
  if (input.title !== undefined) entry.title = input.title;
  if (input.content !== undefined) entry.content = input.content;
  if (input.targetBrands !== undefined) entry.targetBrands = input.targetBrands;
  if (input.targetCategories !== undefined) entry.targetCategories = input.targetCategories;
  if (input.targetProducts !== undefined) entry.targetProducts = input.targetProducts;
  if (input.priority !== undefined) entry.priority = input.priority;
  if (input.expiresAt !== undefined) entry.expiresAt = input.expiresAt;
  if (input.keywords !== undefined) entry.keywords = input.keywords;
  
  entry.updatedAt = Date.now();
  
  // Regenerate keywords if content changed
  if (input.title !== undefined || input.content !== undefined) {
    entry.keywords = extractKeywords(entry.title + ' ' + entry.content);
  }
  
  saveMemoryStore(store);
  
  log.info(`[AgeMem] Updated memory: ${entry.id} - "${entry.title}"`);
  
  return entry;
}

/**
 * DeleteMemory - Remove a memory entry
 */
export function deleteMemory(id: string): boolean {
  const store = loadMemoryStore();
  
  const entryIndex = store.entries.findIndex(e => e.id === id);
  if (entryIndex === -1) {
    log.warn(`[AgeMem] Memory not found for deletion: ${id}`);
    return false;
  }
  
  const removed = store.entries.splice(entryIndex, 1)[0];
  saveMemoryStore(store);
  
  log.info(`[AgeMem] Deleted memory: ${id} - "${removed.title}"`);
  
  return true;
}

/**
 * GetMemory - Get a specific memory by ID
 */
export function getMemory(id: string): MemoryEntry | null {
  const store = loadMemoryStore();
  return store.entries.find(e => e.id === id) || null;
}

/**
 * GetAllMemories - Get all memories (for admin/debug)
 */
export function getAllMemories(): MemoryEntry[] {
  const store = loadMemoryStore();
  return store.entries;
}

/**
 * GetMemoryStats - Get statistics about the memory store
 */
export function getMemoryStats(): {
  totalEntries: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byPriority: Record<string, number>;
  expiredCount: number;
} {
  const store = loadMemoryStore();
  const now = Date.now();
  
  const stats = {
    totalEntries: store.entries.length,
    byType: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    expiredCount: 0
  };
  
  for (const entry of store.entries) {
    stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
    stats.bySource[entry.source] = (stats.bySource[entry.source] || 0) + 1;
    stats.byPriority[entry.priority] = (stats.byPriority[entry.priority] || 0) + 1;
    
    if (entry.expiresAt && entry.expiresAt < now) {
      stats.expiredCount++;
    }
  }
  
  return stats;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractKeywords(text: string): string[] {
  // Simple keyword extraction - lowercase, remove punctuation, filter stopwords
  const stopwords = new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
    'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'o', 'ma', 'che', 'non', 'è', 'sono', 'essere',
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from'
  ]);
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
  
  // Return unique keywords
  return Array.from(new Set(words));
}

function calculateRelevance(
  entry: MemoryEntry, 
  query: SearchQuery
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];
  
  const searchTerms: string[] = [];
  if (query.query) {
    searchTerms.push(...query.query.toLowerCase().split(/\s+/));
  }
  if (query.keywords) {
    searchTerms.push(...query.keywords.map(k => k.toLowerCase()));
  }
  
  if (searchTerms.length === 0) {
    // No search terms - base score on priority
    const priorityScores = { critical: 4, high: 3, medium: 2, low: 1 };
    return { score: priorityScores[entry.priority], matchedOn: ['priority'] };
  }
  
  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const keywordsLower = entry.keywords.map(k => k.toLowerCase());
  
  for (const term of searchTerms) {
    // Title match (highest weight)
    if (titleLower.includes(term)) {
      score += 10;
      if (!matchedOn.includes('title')) matchedOn.push('title');
    }
    
    // Keyword match (high weight)
    if (keywordsLower.some(k => k.includes(term) || term.includes(k))) {
      score += 5;
      if (!matchedOn.includes('keywords')) matchedOn.push('keywords');
    }
    
    // Content match (medium weight)
    if (contentLower.includes(term)) {
      score += 2;
      if (!matchedOn.includes('content')) matchedOn.push('content');
    }
  }
  
  // Boost for priority
  const priorityBoost = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.8 };
  score *= priorityBoost[entry.priority];
  
  // Boost for recent entries
  const ageInDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7) score *= 1.2;
  else if (ageInDays < 30) score *= 1.1;
  
  return { score, matchedOn };
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR AGENTS
// ============================================================================

/**
 * Check for business rules before generating content
 * Used by Product Agent before writing descriptions
 */
export function getBusinessRulesFor(options: {
  brand?: string;
  category?: string;
  productHandle?: string;
}): MemoryEntry[] {
  const results = searchMemory({
    types: ['business_rule', 'content_guideline'],
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined,
    productHandle: options.productHandle,
    minPriority: 'medium'
  });
  
  return results.map(r => r.entry);
}

/**
 * Get cross-agent notes (e.g., Blog Agent → Product Agent)
 */
export function getCrossAgentNotes(options: {
  forAgent: AgentSource;
  brand?: string;
  category?: string;
}): MemoryEntry[] {
  const results = searchMemory({
    types: ['cross_agent_note', 'brand_note', 'product_insight'],
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined
  });
  
  // Filter to notes NOT from the requesting agent
  return results
    .filter(r => r.entry.source !== options.forAgent)
    .map(r => r.entry);
}

/**
 * Leave a note for another agent
 */
export function leaveNoteForAgent(
  fromAgent: AgentSource,
  note: {
    title: string;
    content: string;
    targetBrands?: string[];
    targetCategories?: string[];
    priority?: 'critical' | 'high' | 'medium' | 'low';
  }
): MemoryEntry {
  return addMemory({
    type: 'cross_agent_note',
    source: fromAgent,
    title: note.title,
    content: note.content,
    targetBrands: note.targetBrands,
    targetCategories: note.targetCategories,
    priority: note.priority || 'medium'
  });
}

/**
 * Store a verified fact for reuse
 */
export function storeVerifiedFact(
  source: AgentSource,
  fact: {
    title: string;
    content: string;
    targetBrands?: string[];
    targetCategories?: string[];
    keywords?: string[];
  }
): MemoryEntry {
  return addMemory({
    type: 'verified_fact',
    source,
    title: fact.title,
    content: fact.content,
    targetBrands: fact.targetBrands,
    targetCategories: fact.targetCategories,
    keywords: fact.keywords,
    priority: 'medium'
  });
}

/**
 * Search for verified facts about a topic
 */
export function searchVerifiedFacts(options: {
  query?: string;
  brand?: string;
  category?: string;
  limit?: number;
}): MemoryEntry[] {
  const results = searchMemory({
    types: ['verified_fact'],
    query: options.query,
    brands: options.brand ? [options.brand] : undefined,
    categories: options.category ? [options.category] : undefined,
    limit: options.limit || 10
  });
  
  return results.map(r => r.entry);
}


// ============================================================================
// MEMORY DECAY & QUALITY SCORING
// ============================================================================

export interface MemoryQualityScore {
  overall: number;          // 0-1 overall quality score
  components: {
    recency: number;        // How recent (0-1)
    usage: number;          // How often used (0-1)
    feedback: number;       // Positive/negative feedback (0-1)
    completeness: number;   // How complete the entry is (0-1)
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

// Extended store interface for feedback
interface ExtendedMemoryStore {
  version: string;
  lastUpdated: number;
  entries: MemoryEntry[];
  feedback: MemoryFeedback[];
}

function loadExtendedStore(): ExtendedMemoryStore {
  const store = loadMemoryStore() as ExtendedMemoryStore;
  if (!store.feedback) {
    store.feedback = [];
  }
  return store;
}

function saveExtendedStore(store: ExtendedMemoryStore): void {
  saveMemoryStore(store as MemoryStore);
}

/**
 * Calculate quality score for a memory entry
 * 
 * Based on AgeMem paper's Memory Quality (MQ) metric.
 * Considers recency, usage frequency, feedback, and completeness.
 */
export function calculateMemoryQuality(entry: MemoryEntry): MemoryQualityScore {
  const store = loadExtendedStore();
  const now = Date.now();
  
  // 1. Recency score (0-1)
  // Full score if < 7 days, decreasing over 90 days
  const ageInDays = (now - entry.updatedAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - (ageInDays / 90));
  
  // 2. Usage score (0-1)
  // Based on usage count, normalized
  const usageScore = Math.min(1, entry.usageCount / 20);
  
  // 3. Feedback score (0-1)
  // Based on positive vs negative feedback
  const entryFeedback = store.feedback.filter(f => f.memoryId === entry.id);
  const positiveCount = entryFeedback.filter(f => f.type === 'useful').length;
  const negativeCount = entryFeedback.filter(f => 
    f.type === 'not_useful' || f.type === 'outdated' || f.type === 'incorrect'
  ).length;
  
  let feedbackScore = 0.5; // Neutral default
  if (positiveCount + negativeCount > 0) {
    feedbackScore = positiveCount / (positiveCount + negativeCount);
  }
  
  // 4. Completeness score (0-1)
  // Based on filled fields
  let completeness = 0;
  if (entry.title && entry.title.length > 5) completeness += 0.25;
  if (entry.content && entry.content.length > 20) completeness += 0.25;
  if (entry.keywords && entry.keywords.length > 0) completeness += 0.25;
  if (entry.targetBrands || entry.targetCategories || entry.targetProducts) completeness += 0.25;
  
  // Calculate overall score (weighted average)
  const overall = (
    recency * 0.25 +
    usageScore * 0.25 +
    feedbackScore * 0.35 +
    completeness * 0.15
  );
  
  // Determine recommendation
  let recommendation: 'keep' | 'review' | 'archive' | 'delete';
  if (overall >= 0.7) {
    recommendation = 'keep';
  } else if (overall >= 0.4) {
    recommendation = 'review';
  } else if (overall >= 0.2) {
    recommendation = 'archive';
  } else {
    recommendation = 'delete';
  }
  
  // Override for critical entries
  if (entry.priority === 'critical') {
    recommendation = 'keep';
  }
  
  // Override for entries with recent negative feedback
  const recentNegative = entryFeedback.filter(f => 
    (f.type === 'incorrect' || f.type === 'outdated') &&
    (now - f.createdAt) < 7 * 24 * 60 * 60 * 1000
  );
  if (recentNegative.length > 0) {
    recommendation = 'review';
  }
  
  return {
    overall,
    components: {
      recency,
      usage: usageScore,
      feedback: feedbackScore,
      completeness
    },
    recommendation
  };
}

// ============================================================================
// FEEDBACK LOOP
// ============================================================================

/**
 * Mark a memory as useful (positive feedback)
 * 
 * Call this when a memory was successfully used in content generation.
 */
export function markMemoryAsUseful(memoryId: string, agentSource?: AgentSource): void {
  const store = loadExtendedStore();
  
  // Add feedback
  store.feedback.push({
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    memoryId,
    type: 'useful',
    agentSource,
    createdAt: Date.now()
  });
  
  // Boost priority if consistently useful
  const entry = store.entries.find(e => e.id === memoryId);
  if (entry) {
    const usefulCount = store.feedback.filter(
      f => f.memoryId === memoryId && f.type === 'useful'
    ).length;
    
    // Upgrade priority after 5 useful uses
    if (usefulCount >= 5 && entry.priority === 'low') {
      entry.priority = 'medium';
      log.info(`[AgeMem] Upgraded memory ${memoryId} to medium priority (5+ useful uses)`);
    } else if (usefulCount >= 10 && entry.priority === 'medium') {
      entry.priority = 'high';
      log.info(`[AgeMem] Upgraded memory ${memoryId} to high priority (10+ useful uses)`);
    }
  }
  
  saveExtendedStore(store);
  log.info(`[AgeMem] Marked memory ${memoryId} as useful`);
}

/**
 * Mark a memory as problematic (negative feedback)
 * 
 * Call this when a memory caused issues or was incorrect.
 */
export function markMemoryAsProblematic(
  memoryId: string, 
  type: 'not_useful' | 'outdated' | 'incorrect',
  reason?: string,
  agentSource?: AgentSource
): void {
  const store = loadExtendedStore();
  
  // Add feedback
  store.feedback.push({
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    memoryId,
    type,
    reason,
    agentSource,
    createdAt: Date.now()
  });
  
  // Downgrade priority if consistently problematic
  const entry = store.entries.find(e => e.id === memoryId);
  if (entry) {
    const negativeCount = store.feedback.filter(
      f => f.memoryId === memoryId && 
      (f.type === 'not_useful' || f.type === 'outdated' || f.type === 'incorrect')
    ).length;
    
    // Downgrade priority after 3 negative uses
    if (negativeCount >= 3 && entry.priority === 'high') {
      entry.priority = 'medium';
      log.info(`[AgeMem] Downgraded memory ${memoryId} to medium priority (3+ negative feedback)`);
    } else if (negativeCount >= 3 && entry.priority === 'medium') {
      entry.priority = 'low';
      log.info(`[AgeMem] Downgraded memory ${memoryId} to low priority (3+ negative feedback)`);
    }
    
    // Flag for review if marked as incorrect
    if (type === 'incorrect' && negativeCount >= 2) {
      log.warn(`[AgeMem] Memory ${memoryId} flagged for review - multiple 'incorrect' reports`);
    }
  }
  
  saveExtendedStore(store);
  log.info(`[AgeMem] Marked memory ${memoryId} as ${type}${reason ? `: ${reason}` : ''}`);
}

/**
 * Get feedback history for a memory
 */
export function getMemoryFeedback(memoryId: string): MemoryFeedback[] {
  const store = loadExtendedStore();
  return store.feedback.filter(f => f.memoryId === memoryId);
}

/**
 * Get effectiveness report for all memories
 */
export function getMemoryEffectivenessReport(): {
  totalMemories: number;
  withFeedback: number;
  averageQuality: number;
  byRecommendation: Record<string, number>;
  topPerformers: Array<{ id: string; title: string; quality: number }>;
  needsReview: Array<{ id: string; title: string; quality: number; reason: string }>;
} {
  const store = loadExtendedStore();
  
  const report = {
    totalMemories: store.entries.length,
    withFeedback: 0,
    averageQuality: 0,
    byRecommendation: {} as Record<string, number>,
    topPerformers: [] as Array<{ id: string; title: string; quality: number }>,
    needsReview: [] as Array<{ id: string; title: string; quality: number; reason: string }>
  };
  
  const qualities: Array<{ entry: MemoryEntry; quality: MemoryQualityScore }> = [];
  
  for (const entry of store.entries) {
    const quality = calculateMemoryQuality(entry);
    qualities.push({ entry, quality });
    
    report.byRecommendation[quality.recommendation] = 
      (report.byRecommendation[quality.recommendation] || 0) + 1;
    
    const hasFeedback = store.feedback.some(f => f.memoryId === entry.id);
    if (hasFeedback) report.withFeedback++;
  }
  
  // Calculate average quality
  if (qualities.length > 0) {
    report.averageQuality = qualities.reduce((sum, q) => sum + q.quality.overall, 0) / qualities.length;
  }
  
  // Top performers (quality >= 0.7)
  report.topPerformers = qualities
    .filter(q => q.quality.overall >= 0.7)
    .sort((a, b) => b.quality.overall - a.quality.overall)
    .slice(0, 10)
    .map(q => ({
      id: q.entry.id,
      title: q.entry.title,
      quality: q.quality.overall
    }));
  
  // Needs review
  report.needsReview = qualities
    .filter(q => q.quality.recommendation === 'review' || q.quality.recommendation === 'delete')
    .map(q => {
      let reason = '';
      if (q.quality.components.feedback < 0.3) reason = 'Low feedback score';
      else if (q.quality.components.recency < 0.2) reason = 'Outdated';
      else if (q.quality.components.usage < 0.1) reason = 'Rarely used';
      else reason = 'Low overall quality';
      
      return {
        id: q.entry.id,
        title: q.entry.title,
        quality: q.quality.overall,
        reason
      };
    });
  
  return report;
}

// ============================================================================
// MEMORY DECAY
// ============================================================================

/**
 * Apply decay to old, unused memories
 * 
 * This should be called periodically (e.g., daily) to:
 * - Reduce priority of old unused memories
 * - Mark very old memories for review
 */
export function applyMemoryDecay(options: {
  daysUntilDecay?: number;      // Days before decay starts (default: 30)
  daysUntilArchive?: number;    // Days before suggesting archive (default: 90)
  protectCritical?: boolean;    // Don't decay critical memories (default: true)
} = {}): {
  decayed: number;
  flaggedForArchive: number;
  unchanged: number;
} {
  const {
    daysUntilDecay = 30,
    daysUntilArchive = 90,
    protectCritical = true
  } = options;
  
  const store = loadMemoryStore();
  const now = Date.now();
  
  let decayed = 0;
  let flaggedForArchive = 0;
  let unchanged = 0;
  
  for (const entry of store.entries) {
    // Skip critical if protected
    if (protectCritical && entry.priority === 'critical') {
      unchanged++;
      continue;
    }
    
    // Calculate age since last use or update
    const lastActivity = entry.lastUsedAt || entry.updatedAt;
    const ageInDays = (now - lastActivity) / (1000 * 60 * 60 * 24);
    
    if (ageInDays > daysUntilArchive) {
      // Flag for archive (set expiration if not set)
      if (!entry.expiresAt) {
        entry.expiresAt = now + (30 * 24 * 60 * 60 * 1000); // Expire in 30 days
        flaggedForArchive++;
        log.info(`[AgeMem] Flagged memory ${entry.id} for archive (${Math.round(ageInDays)} days inactive)`);
      }
    } else if (ageInDays > daysUntilDecay) {
      // Decay priority
      if (entry.priority === 'high') {
        entry.priority = 'medium';
        decayed++;
        log.info(`[AgeMem] Decayed memory ${entry.id} from high to medium (${Math.round(ageInDays)} days inactive)`);
      } else if (entry.priority === 'medium' && ageInDays > daysUntilDecay * 2) {
        entry.priority = 'low';
        decayed++;
        log.info(`[AgeMem] Decayed memory ${entry.id} from medium to low (${Math.round(ageInDays)} days inactive)`);
      } else {
        unchanged++;
      }
    } else {
      unchanged++;
    }
  }
  
  saveMemoryStore(store);
  
  log.info(`[AgeMem] Decay complete: ${decayed} decayed, ${flaggedForArchive} flagged for archive, ${unchanged} unchanged`);
  
  return { decayed, flaggedForArchive, unchanged };
}
