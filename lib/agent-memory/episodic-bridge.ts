/**
 * Episodic Bridge — Rollback → AgeMem Learning Loop
 *
 * Converts KG rollback events into episodic MemoryEntry records that agents
 * can query before acting, preventing the same error from recurring.
 *
 * Concept (MemGPT-inspired):
 *   When `kg-store.rollbackSince` is called with a `reason`, the deleted nodes
 *   and edges carry provenance metadata (sourceUrl, agent, timestamp). This
 *   module distills those provenance records into "negative rules" stored in
 *   AgeMem. The next time an agent runs, `auto-inject.ts` will surface these
 *   rules in the prompt, so the LLM avoids the problematic source or pattern.
 *
 * Usage:
 *   import { learnFromRollback } from '@/lib/agent-memory/episodic-bridge';
 *
 *   // In kg-store.rollbackSince (or the admin route that triggers rollback):
 *   const removed = await store.rollbackSince(since, kg, 'taya_police_flag');
 *   await learnFromRollback({ removedNodes, removedEdges, reason, since, kg });
 */

import { addMemory } from './agemem-core';
import type { AgentSource, MemoryType } from './agemem-core';
import type { KGNode, KGEdge, ProvenanceMetadata } from '@/lib/shopify/knowledge-graph';
import { loggers } from '@/lib/logger';

const log = loggers.memory;

// ============================================================================
// TYPES
// ============================================================================

/** Maps a rollback reason to the corresponding agent that caused the error. */
const REASON_TO_AGENT: Record<string, AgentSource> = {
  taya_police_flag:   'product_agent',
  image_invalid:      'product_agent',
  source_unwhitelisted: 'product_agent',
  duplicate_detected: 'product_agent',
  rollback_by_admin:  'admin',
  rollback:           'system',
};

/** Maps a rollback reason to a memory priority. */
const REASON_TO_PRIORITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  taya_police_flag:   'high',
  image_invalid:      'high',
  source_unwhitelisted: 'critical',
  duplicate_detected: 'medium',
  rollback_by_admin:  'medium',
  rollback:           'low',
};

export interface RollbackContext {
  /** Nodes removed from the KG during this rollback. */
  removedNodes: KGNode[];
  /** Edges removed from the KG during this rollback. */
  removedEdges: KGEdge[];
  /** The reason label passed to rollbackSince (e.g. "taya_police_flag"). */
  reason: string;
  /** Cutoff date used for the rollback. */
  since: Date;
}

export interface EpisodicLearning {
  /** IDs of the AgeMem entries created by this call. */
  memoryIds: string[];
  /** Number of distinct sources that generated episodic rules. */
  sourcesProcessed: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Distill a rollback event into one or more episodic MemoryEntry records.
 *
 * Strategy:
 *   1. Collect unique (sourceUrl, agent) pairs from removed nodes/edges.
 *   2. For each unique source, create one "negative rule" MemoryEntry in AgeMem.
 *   3. The entry content tells agents what went wrong and which URL to avoid.
 *
 * If a source has no provenance (base-knowledge node removed by admin),
 * a generic rule is created without a URL reference.
 *
 * Deduplication: if an identical rule (same sourceUrl + reason) already exists
 * in AgeMem, `addMemory` creates a duplicate — this is intentional. The
 * feedback loop in AgeMem will surface the most-cited rules first via
 * `usageCount` scoring, making frequently-recurring errors more prominent.
 */
export async function learnFromRollback(ctx: RollbackContext): Promise<EpisodicLearning> {
  const { removedNodes, removedEdges, reason, since } = ctx;
  const memoryIds: string[] = [];

  // Collect unique provenance sources across removed nodes and edges
  const sourceMap = new Map<string, ProvenanceMetadata>();

  for (const node of removedNodes) {
    if (node.provenance) {
      sourceMap.set(node.provenance.sourceUrl, node.provenance);
    }
  }
  for (const edge of removedEdges) {
    if (edge.provenance) {
      sourceMap.set(edge.provenance.sourceUrl, edge.provenance);
    }
  }

  const agentSource: AgentSource = REASON_TO_AGENT[reason] ?? 'system';
  const priority = REASON_TO_PRIORITY[reason] ?? 'medium';
  const memType: MemoryType = 'business_rule';
  const sinceStr = since.toISOString();
  /**
   * Episodic rules are not permanent. A site that caused image errors today may
   * have fixed its structure in 30 days. After expiry, the rule is evicted by
   * the ZSET index in `evictExpiredByIndex()` without a full HGETALL scan.
   */
  const EPISODIC_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const expiresAt = Date.now() + EPISODIC_TTL_MS;

  if (sourceMap.size === 0) {
    // No provenance info — create a generic episodic note
    const nodeNames = removedNodes.map(n => n.name).join(', ');
    const entry = await addMemory({
      type: memType,
      source: agentSource,
      title: `[Episodic] Rollback: ${reason} (${sinceStr})`,
      content:
        `A rollback was performed on ${sinceStr} with reason "${reason}". ` +
        `Removed nodes: ${nodeNames || 'none'}. ` +
        `Avoid re-adding these facts without explicit human verification.`,
      priority,
      expiresAt,
      keywords: [reason, 'rollback', 'episodic', ...removedNodes.map(n => n.name.toLowerCase())],
    });
    memoryIds.push(entry.id);
    log.info(`[EpisodicBridge] Created generic rollback rule: ${entry.id}`);
    return { memoryIds, sourcesProcessed: 0 };
  }

  // One MemoryEntry per unique source URL
  for (const [sourceUrl, prov] of Array.from(sourceMap.entries())) {
    const affectedNodes = removedNodes
      .filter(n => n.provenance?.sourceUrl === sourceUrl)
      .map(n => n.name);
    const affectedEdges = removedEdges
      .filter(e => e.provenance?.sourceUrl === sourceUrl)
      .map(e => `${e.from}→${e.type}→${e.to}`);

    const content = buildEpisodicContent({ sourceUrl, prov, reason, sinceStr, affectedNodes, affectedEdges });

    // Extract brand and category hints from affected node IDs for targeted retrieval
    const targetBrands: string[] = [];
    const targetCategories: string[] = [];
    for (const node of removedNodes.filter(n => n.provenance?.sourceUrl === sourceUrl)) {
      if (node.type === 'brand') targetBrands.push(node.name);
      if (node.type === 'product_category') targetCategories.push(node.name);
    }

    const entry = await addMemory({
      type: memType,
      source: agentSource,
      title: `[Episodic] Avoid source: ${new URL(sourceUrl).hostname} (${reason})`,
      content,
      priority,
      expiresAt,
      targetBrands:      targetBrands.length > 0 ? targetBrands : undefined,
      targetCategories:  targetCategories.length > 0 ? targetCategories : undefined,
      keywords: [
        reason, 'rollback', 'episodic', 'avoid_source',
        new URL(sourceUrl).hostname,
        prov.agent,
      ],
    });

    memoryIds.push(entry.id);
    log.info(`[EpisodicBridge] Created episodic rule for ${sourceUrl}: ${entry.id}`);
  }

  return { memoryIds, sourcesProcessed: sourceMap.size };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildEpisodicContent(params: {
  sourceUrl: string;
  prov: ProvenanceMetadata;
  reason: string;
  sinceStr: string;
  affectedNodes: string[];
  affectedEdges: string[];
}): string {
  const { sourceUrl, prov, reason, sinceStr, affectedNodes, affectedEdges } = params;

  const lines: string[] = [
    `ROLLBACK EVENT — ${sinceStr}`,
    `Reason: ${reason}`,
    `Problematic source: ${sourceUrl}`,
    `Agent that wrote the data: ${prov.agent}`,
  ];

  if (prov.confidence !== undefined) {
    lines.push(`Original confidence: ${(prov.confidence * 100).toFixed(0)}%`);
  }

  if (affectedNodes.length > 0) {
    lines.push(`Removed nodes: ${affectedNodes.join(', ')}`);
  }
  if (affectedEdges.length > 0) {
    lines.push(`Removed edges: ${affectedEdges.slice(0, 5).join('; ')}${affectedEdges.length > 5 ? ` (+${affectedEdges.length - 5} more)` : ''}`);
  }

  lines.push('');
  lines.push(getRuleText(reason, sourceUrl));

  return lines.join('\n');
}

function getRuleText(reason: string, sourceUrl: string): string {
  const host = (() => { try { return new URL(sourceUrl).hostname; } catch { return sourceUrl; } })();

  switch (reason) {
    case 'taya_police_flag':
      return `RULE: Data extracted from ${host} was flagged by TAYA Police as incorrect or misleading. Do NOT use ${host} as a source for product facts without explicit human approval.`;
    case 'image_invalid':
      return `RULE: Images sourced from ${host} failed validation (wrong product, placeholder, or CDN artifact). Do NOT fetch product images from ${host}.`;
    case 'source_unwhitelisted':
      return `RULE: ${host} is NOT in the whitelisted domain list (rag-sources.ts). Do NOT extract data from this domain.`;
    case 'duplicate_detected':
      return `RULE: Data from ${host} caused duplicate entries in the Knowledge Graph. Cross-check against existing nodes before adding data from this source.`;
    default:
      return `RULE: Data from ${host} was rolled back with reason "${reason}". Treat this source with increased skepticism and prefer whitelisted alternatives.`;
  }
}
