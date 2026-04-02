/**
 * KG Redis Store — Persistence layer for the dynamic Knowledge Graph state.
 *
 * Handles serialization/deserialization of dynamically-discovered nodes, edges,
 * and the PROV-STAR provenance log to/from Upstash Redis.
 *
 * Architecture:
 *   - Base KG knowledge (brands, categories, trades…) is hardcoded and reloaded
 *     from source on every cold start — no persistence needed.
 *   - Only the *dynamic* state (RAG-discovered products, relations, provenance log)
 *     is stored here, so cold starts can restore it in a single hydration call.
 *
 * Redis schema (all keys are permanent — no TTL):
 *   kg:v1:nodes       → Hash   { nodeId: JSON<KGNode> }
 *   kg:v1:edges       → List   [ JSON<KGEdge>, ... ]
 *   kg:v1:provenance  → ZSet   { score: timestamp_ms, member: JSON<ProvenanceEntry> }
 *
 * Falls back to a silent no-op when Redis env vars are absent (dev / test).
 *
 * Usage in worker routes:
 *   const kg    = getKnowledgeGraph();
 *   const store = getKGStore();
 *   await store.hydrateKG(kg);          // load persisted state at request start
 *   // ... run enrichment pipeline ...
 *   await store.flushKG(kg);            // save new dynamic state before returning
 *
 * Rollback from admin endpoint:
 *   const removed = await store.rollbackSince(new Date('2026-03-31T10:00:00Z'), kg);
 */

import { loggers } from '@/lib/logger';
import { KGEdge, KGNode, PowerToolKnowledgeGraph, ProvenanceEntry } from './knowledge-graph';
import { learnFromRollback } from '@/lib/agent-memory/episodic-bridge';

const log = loggers.shopify;

// =============================================================================
// INTERNAL REDIS HELPER
// =============================================================================

/**
 * Executes a single Redis command via Upstash REST pipeline.
 * Returns `null` when Redis is not configured (silent no-op mode).
 */
async function redisCmd(
  baseUrl: string,
  token: string,
  command: (string | number)[]
): Promise<unknown> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`[KGStore] Redis HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as { result: unknown };
  return json.result;
}

/**
 * Executes multiple Redis commands in a single HTTP round-trip via the
 * Upstash REST pipeline endpoint (`/pipeline`).
 */
async function redisPipeline(
  baseUrl: string,
  token: string,
  commands: (string | number)[][]
): Promise<unknown[]> {
  const pipelineUrl = baseUrl.replace(/\/$/, '') + '/pipeline';
  const res = await fetch(pipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    throw new Error(`[KGStore] Redis pipeline HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as { result: unknown }[];
  return json.map(r => r.result);
}

// =============================================================================
// REDIS KEYS
// =============================================================================

const KEY_NODES = 'kg:v1:nodes';
/**
 * Base-knowledge overrides — Hash where field = "type:id" and value = JSON<{name, properties}>.
 * Entries written here via the admin API are applied on top of the JSON defaults on every
 * cold start, allowing zero-deploy additions (new brands, categories, etc.).
 */
const KEY_BASE = 'kg:v1:base';
/**
 * Edges are stored as a Redis Hash, NOT a List.
 * Field = `from→type→to` (the same key used in provenance entries).
 * Value = JSON<KGEdge>.
 *
 * Why Hash instead of List:
 *   List requires `DEL + RPUSH` to replace, which is a two-command sequence
 *   with a window where concurrent workers see an empty list.
 *   Hash supports `HSET field value` — a single atomic, idempotent operation.
 *   Two workers can HSET the same or different fields concurrently with no
 *   data loss and no need for distributed locks.
 */
const KEY_EDGES = 'kg:v1:edges';
const KEY_PROVENANCE = 'kg:v1:provenance';

/** Maximum number of provenance entries kept in the ZSet (FIFO trim). */
const MAX_PROVENANCE_ENTRIES = 2000;

// =============================================================================
// KG REDIS STORE
// =============================================================================

class KGRedisStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly enabled: boolean;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const tok = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && tok) {
      this.baseUrl = url.replace(/\/$/, '');
      this.token = tok;
      this.enabled = true;
      log.info('[KGStore] Redis backend enabled');
    } else {
      this.baseUrl = '';
      this.token = '';
      this.enabled = false;
      log.info('[KGStore] No Redis config — running in no-op mode (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)');
    }
  }

  // ---------------------------------------------------------------------------
  // HYDRATE — load persisted dynamic state into an in-memory KG instance
  // ---------------------------------------------------------------------------

  /**
   * Loads all persisted dynamic nodes, edges, and provenance entries into `kg`.
   * Safe to call even if Redis is empty (idempotent).
   * Base-knowledge nodes are never affected (injectNode deduplicates by ID).
   */
  async hydrateKG(kg: PowerToolKnowledgeGraph): Promise<void> {
    if (!this.enabled) return;

    try {
      // Fetch base overrides (Hash), nodes (Hash), edges (Hash), provenance (ZSet) in one pipeline
      const [rawBase, rawNodes, rawEdges, rawProv] = await redisPipeline(this.baseUrl, this.token, [
        ['HGETALL', KEY_BASE],
        ['HGETALL', KEY_NODES],
        ['HGETALL', KEY_EDGES],
        ['ZRANGEBYSCORE', KEY_PROVENANCE, '-inf', '+inf'],
      ]);

      // --- Base overrides (Hash: { "type:id" → JSON<{name, properties}> }) ---
      // Applied FIRST so they layer on top of the JSON defaults from initializeBaseKnowledge().
      if (rawBase && typeof rawBase === 'object' && !Array.isArray(rawBase)) {
        const baseMap = rawBase as Record<string, string>;
        let baseCount = 0;
        for (const [field, json] of Object.entries(baseMap)) {
          try {
            const colonIdx = field.indexOf(':');
            if (colonIdx < 1) continue;
            const type = field.slice(0, colonIdx);
            const id   = field.slice(colonIdx + 1);
            const { name, properties } = JSON.parse(json) as { name: string; properties: Record<string, unknown> };
            kg.applyBaseEntry(type, id, name, properties);
            baseCount++;
          } catch {
            log.warn('[KGStore] Skipping malformed base override during hydration');
          }
        }
        if (baseCount > 0) log.info(`[KGStore] Applied ${baseCount} base overrides from Redis`);
      }

      // --- Nodes (Hash: { nodeId → JSON }) ---
      if (rawNodes && typeof rawNodes === 'object' && !Array.isArray(rawNodes)) {
        const nodeMap = rawNodes as Record<string, string>;
        let nodeCount = 0;
        for (const json of Object.values(nodeMap)) {
          try {
            kg.injectNode(JSON.parse(json) as KGNode);
            nodeCount++;
          } catch {
            log.warn('[KGStore] Skipping malformed node JSON during hydration');
          }
        }
        if (nodeCount > 0) log.info(`[KGStore] Hydrated ${nodeCount} dynamic nodes`);
      }

      // --- Edges (Hash: { "from→type→to" → JSON }) ---
      if (rawEdges && typeof rawEdges === 'object' && !Array.isArray(rawEdges)) {
        const edgeMap = rawEdges as Record<string, string>;
        let edgeCount = 0;
        for (const json of Object.values(edgeMap)) {
          try {
            kg.injectEdge(JSON.parse(json) as KGEdge);
            edgeCount++;
          } catch {
            log.warn('[KGStore] Skipping malformed edge JSON during hydration');
          }
        }
        if (edgeCount > 0) log.info(`[KGStore] Hydrated ${edgeCount} dynamic edges`);
      }

      // --- Provenance log (already rebuilt by injectNode/injectEdge, so no action needed) ---
      // We read it here only to log how many entries exist in Redis.
      if (Array.isArray(rawProv)) {
        log.info(`[KGStore] Provenance log in Redis: ${(rawProv as string[]).length} entries`);
      }
    } catch (err) {
      log.error('[KGStore] hydrateKG failed:', err);
      // Non-fatal — pipeline continues with whatever base knowledge is in memory
    }
  }

  // ---------------------------------------------------------------------------
  // FLUSH — persist the current dynamic KG state to Redis
  // ---------------------------------------------------------------------------

  /**
   * Serializes all dynamic nodes, edges, and provenance log entries from `kg`
   * to Redis. Replaces previous data atomically where possible.
   *
   * Call this at the end of a worker invocation, after all enrichment mutations.
   */
  async flushKG(kg: PowerToolKnowledgeGraph): Promise<void> {
    if (!this.enabled) return;

    try {
      const { nodes, edges, provenanceLog } = kg.getDynamicState();

      if (nodes.length === 0 && edges.length === 0) {
        log.info('[KGStore] flushKG: no dynamic state to persist');
        return;
      }

      const commands: (string | number)[][] = [];

      // --- Nodes: HSET kg:v1:nodes field1 val1 field2 val2 ... ---
      // Atomic and idempotent — concurrent workers HSETting different fields never collide.
      if (nodes.length > 0) {
        const hsetArgs: (string | number)[] = ['HSET', KEY_NODES];
        for (const node of nodes) {
          hsetArgs.push(node.id, JSON.stringify(node));
        }
        commands.push(hsetArgs);
      }

      // --- Edges: HSET kg:v1:edges "from→type→to" JSON ... ---
      // Hash instead of List: each field is an atomic HSET, no DEL needed.
      // Two concurrent workers writing different edges never overwrite each other.
      if (edges.length > 0) {
        const hsetArgs: (string | number)[] = ['HSET', KEY_EDGES];
        for (const edge of edges) {
          const field = `${edge.from}→${edge.type}→${edge.to}`;
          hsetArgs.push(field, JSON.stringify(edge));
        }
        commands.push(hsetArgs);
      }

      // --- Provenance log: add new entries to ZSet, trim to MAX ---
      if (provenanceLog.length > 0) {
        const zaddArgs: (string | number)[] = ['ZADD', KEY_PROVENANCE];
        for (const entry of provenanceLog) {
          const score = new Date(entry.provenance.timestamp).getTime();
          zaddArgs.push(score, JSON.stringify(entry));
        }
        commands.push(zaddArgs);
        // Trim: keep only the most recent MAX_PROVENANCE_ENTRIES entries
        commands.push(['ZREMRANGEBYRANK', KEY_PROVENANCE, 0, -(MAX_PROVENANCE_ENTRIES + 1)]);
      }

      await redisPipeline(this.baseUrl, this.token, commands);

      log.info(
        `[KGStore] Flushed — nodes: ${nodes.length}, edges: ${edges.length}, prov: ${provenanceLog.length}`
      );
    } catch (err) {
      log.error('[KGStore] flushKG failed:', err);
      // Non-fatal — enrichment result is already written to Shopify
    }
  }

  // ---------------------------------------------------------------------------
  // ROLLBACK — remove dynamic state added on or after a given timestamp
  // ---------------------------------------------------------------------------

  /**
   * Performs an event-sourced rollback:
   *   1. Removes affected nodes and edges from the **in-memory KG** (for query correctness).
   *   2. Rebuilds the Redis nodes Hash and edges List to match the post-rollback state.
   *   3. **Appends** the new `delete_node` / `delete_edge` events that `kg.rollbackSince`
   *      wrote to the in-memory provenance log into the Redis ZSet — the log is never
   *      truncated, preserving the full causal audit trail.
   *
   * @param since  - Remove nodes/edges whose provenance.timestamp >= this date.
   * @param reason - Label stored in the delete events (e.g. "rollback_by_admin").
   * @param kg     - The in-memory KG instance to update.
   * @returns Counts of what was removed.
   */
  async rollbackSince(
    since: Date,
    kg: PowerToolKnowledgeGraph,
    reason = 'rollback_by_admin'
  ): Promise<{ removedNodes: number; removedEdges: number }> {
    // 0. Capture nodes/edges that will be removed BEFORE the in-memory rollback,
    //    so episodic-bridge can read their provenance metadata.
    const sinceTs = since.getTime();
    const { nodes: dynamicNodes, edges: dynamicEdges } = kg.getDynamicState();
    const removedNodesCopy: KGNode[] = dynamicNodes.filter(
      n => n.provenance && new Date(n.provenance.timestamp).getTime() >= sinceTs
    );
    const removedEdgesCopy: KGEdge[] = dynamicEdges.filter(
      e => e.provenance && new Date(e.provenance.timestamp).getTime() >= sinceTs
    );

    // 1. In-memory rollback — appends delete events to the in-memory log
    const removed = kg.rollbackSince(since, reason);

    if (!this.enabled) return removed;

    try {
      // 2. Collect the delete events appended by kg.rollbackSince (they carry the removed IDs)
      const { provenanceLog } = kg.getDynamicState();
      const deleteEvents = provenanceLog.filter(
        e => e.op === 'delete_node' || e.op === 'delete_edge'
      );

      const commands: (string | number)[][] = [];

      // Remove deleted nodes from Hash — HDEL is atomic, no full rebuild needed
      const deletedNodeIds = deleteEvents
        .filter(e => e.op === 'delete_node')
        .map(e => e.targetId);
      if (deletedNodeIds.length > 0) {
        commands.push(['HDEL', KEY_NODES, ...deletedNodeIds]);
      }

      // Remove deleted edges from Hash — field key = targetId ("from→type→to")
      const deletedEdgeKeys = deleteEvents
        .filter(e => e.op === 'delete_edge')
        .map(e => e.targetId);
      if (deletedEdgeKeys.length > 0) {
        commands.push(['HDEL', KEY_EDGES, ...deletedEdgeKeys]);
      }

      // Append delete events to ZSet — never remove existing entries
      // (The delete events themselves have timestamp = now, so their score > `since`.)
      if (deleteEvents.length > 0) {
        const zaddArgs: (string | number)[] = ['ZADD', KEY_PROVENANCE];
        for (const entry of deleteEvents) {
          const score = new Date(entry.provenance.timestamp).getTime();
          zaddArgs.push(score, JSON.stringify(entry));
        }
        commands.push(zaddArgs);
      }

      await redisPipeline(this.baseUrl, this.token, commands);

      log.info(
        `[KGStore] Rollback since ${since.toISOString()} complete (reason: ${reason}) — ` +
          `${removed.removedNodes} nodes, ${removed.removedEdges} edges removed; ` +
          `${deleteEvents.length} delete events appended to provenance log`
      );
    } catch (err) {
      log.error('[KGStore] rollbackSince Redis sync failed:', err);
      // In-memory rollback already applied — Redis corrected on next flushKG()
    }

    // 3. Distill rollback into episodic AgeMem rules (non-fatal — never blocks rollback).
    //    Agents will receive these rules via auto-inject on subsequent runs.
    if (removedNodesCopy.length > 0 || removedEdgesCopy.length > 0) {
      learnFromRollback({
        removedNodes: removedNodesCopy,
        removedEdges: removedEdgesCopy,
        reason,
        since,
      }).then(learning => {
        log.info(
          `[KGStore] EpisodicBridge: created ${learning.memoryIds.length} rule(s) ` +
            `from ${learning.sourcesProcessed} source(s)`
        );
      }).catch(err => {
        log.warn('[KGStore] EpisodicBridge learnFromRollback failed (non-fatal):', err);
      });
    }

    return removed;
  }

  // ---------------------------------------------------------------------------
  // PROVENANCE QUERY
  // ---------------------------------------------------------------------------

  /**
   * Returns provenance log entries from Redis, optionally filtered to a time range.
   * Useful for audit endpoints or the admin rollback UI.
   */
  async getProvenanceLog(
    since?: Date,
    until?: Date
  ): Promise<ProvenanceEntry[]> {
    if (!this.enabled) return [];

    try {
      const minScore = since ? since.getTime() : '-inf';
      const maxScore = until ? until.getTime() : '+inf';

      const raw = (await redisCmd(this.baseUrl, this.token, [
        'ZRANGEBYSCORE',
        KEY_PROVENANCE,
        String(minScore),
        String(maxScore),
      ])) as string[] | null;

      if (!raw || raw.length === 0) return [];

      return raw
        .map(json => {
          try {
            return JSON.parse(json) as ProvenanceEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is ProvenanceEntry => e !== null);
    } catch (err) {
      log.error('[KGStore] getProvenanceLog failed:', err);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // BASE OVERRIDE CRUD — zero-deploy knowledge additions via admin API
  // ---------------------------------------------------------------------------

  /**
   * Upsert a base-knowledge entry in Redis.
   * The entry is applied on the next worker cold start (via hydrateKG).
   *
   * @param type  - Node type: "brand" | "category" | "trade" | "use_case" | "battery_system" | "feature"
   * @param id    - Short identifier used as node ID suffix (e.g. "ridgid").
   * @param name  - Human-readable name (e.g. "Ridgid").
   * @param properties - Arbitrary key/value properties for the node.
   */
  async putBaseEntry(
    type: string,
    id: string,
    name: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled) {
      log.warn('[KGStore] putBaseEntry: Redis not configured — entry not persisted');
      return;
    }
    const field = `${type}:${id}`;
    const value = JSON.stringify({ name, properties });
    await redisCmd(this.baseUrl, this.token, ['HSET', KEY_BASE, field, value]);
    log.info(`[KGStore] Base override saved: ${field}`);
  }

  /**
   * Remove a base-knowledge override from Redis.
   * The JSON default (from kg-base.json) is restored on the next cold start.
   */
  async deleteBaseEntry(type: string, id: string): Promise<void> {
    if (!this.enabled) return;
    const field = `${type}:${id}`;
    await redisCmd(this.baseUrl, this.token, ['HDEL', KEY_BASE, field]);
    log.info(`[KGStore] Base override deleted: ${field}`);
  }

  /**
   * List all current base-knowledge overrides stored in Redis.
   * Returns an array of parsed entries for the admin UI.
   */
  async listBaseEntries(): Promise<Array<{ type: string; id: string; name: string; properties: Record<string, unknown> }>> {
    if (!this.enabled) return [];
    try {
      const raw = (await redisCmd(this.baseUrl, this.token, ['HGETALL', KEY_BASE])) as Record<string, string> | null;
      if (!raw) return [];
      return Object.entries(raw).flatMap(([field, json]) => {
        try {
          const colonIdx = field.indexOf(':');
          if (colonIdx < 1) return [];
          const type = field.slice(0, colonIdx);
          const id   = field.slice(colonIdx + 1);
          const { name, properties } = JSON.parse(json) as { name: string; properties: Record<string, unknown> };
          return [{ type, id, name, properties }];
        } catch {
          return [];
        }
      });
    } catch (err) {
      log.error('[KGStore] listBaseEntries failed:', err);
      return [];
    }
  }

  /**
   * Returns true if Redis is configured and available.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let storeInstance: KGRedisStore | null = null;

export function getKGStore(): KGRedisStore {
  if (!storeInstance) {
    storeInstance = new KGRedisStore();
  }
  return storeInstance;
}
