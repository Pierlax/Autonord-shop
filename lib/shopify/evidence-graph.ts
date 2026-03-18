/**
 * Evidence Graph — Universal RAG v2, Layer 7 (Memory component)
 *
 * Grafo di evidenza in memoria per una singola sessione di enrichment.
 * Tiene traccia delle relazioni tra prodotto, manuali, accessori, batterie,
 * recensioni e forum con archi di supporto o contraddizione.
 *
 * Allineato alla direzione agentica e graph-oriented descritta nella survey
 * (nodo prodotto, nodo manuale, nodo accessorio, nodo batteria, nodo review,
 * nodo forum; archi support/contradiction/cites/compatible_with).
 */

import { loggers } from '@/lib/logger';
import { CorpusItem } from './corpus-builder';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceNodeType =
  | 'product'     // The product being enriched
  | 'manual'      // PDF manual or instruction document
  | 'spec_sheet'  // Technical specification document
  | 'accessory'   // Compatible accessory or attachment
  | 'battery'     // Battery system
  | 'review'      // Expert or user review
  | 'forum';      // Forum post or community discussion

export type EvidenceEdgeType =
  | 'supports'        // Evidence supports a claim about the product
  | 'contradicts'     // Evidence contradicts a claim
  | 'cites'           // This node cites/references another
  | 'compatible_with' // Product / accessory compatibility
  | 'part_of'         // Component relationship
  | 'reviews';        // Review relationship

export interface EvidenceFact {
  claim: string;   // e.g. "Tensione"
  value: string;   // e.g. "18 V"
  confidence: number;
  source: string;  // URL or short text identifier
}

export interface EvidenceNode {
  id: string;
  type: EvidenceNodeType;
  title: string;
  url: string;
  domain: string;
  confidence: number;
  facts: EvidenceFact[];
  snippet: string;
}

export interface EvidenceEdge {
  from: string;   // node id
  to: string;     // node id
  type: EvidenceEdgeType;
  weight: number; // 0-1
  label?: string;
}

export interface EvidenceGraphSummary {
  nodeCount: number;
  edgeCount: number;
  manualCount: number;
  batteryCount: number;
  reviewCount: number;
  conflictCount: number;
}

// ---------------------------------------------------------------------------
// EvidenceGraph class
// ---------------------------------------------------------------------------

export class EvidenceGraph {
  private nodes = new Map<string, EvidenceNode>();
  private edges: EvidenceEdge[] = [];
  private productNodeId: string | null = null;

  addNode(node: EvidenceNode): void {
    this.nodes.set(node.id, node);
    if (node.type === 'product') this.productNodeId = node.id;
  }

  addEdge(edge: EvidenceEdge): void {
    // Prevent duplicate edges
    const exists = this.edges.some(
      (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
    );
    if (!exists) this.edges.push(edge);
  }

  getNode(id: string): EvidenceNode | undefined {
    return this.nodes.get(id);
  }

  getNodesByType(type: EvidenceNodeType): EvidenceNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  getEdgesFrom(nodeId: string): EvidenceEdge[] {
    return this.edges.filter((e) => e.from === nodeId);
  }

  /**
   * Detect conflicting fact values across nodes.
   * Two nodes conflict when they assert different values for the same claim.
   */
  detectConflicts(): Array<{ claim: string; sources: string[]; values: string[] }> {
    const claimMap = new Map<string, { value: string; source: string }[]>();

    Array.from(this.nodes.values()).forEach((node) => {
      node.facts.forEach((fact) => {
        const key = fact.claim.toLowerCase().trim();
        if (!claimMap.has(key)) claimMap.set(key, []);
        claimMap.get(key)!.push({ value: fact.value, source: node.url });
      });
    });

    const conflicts: Array<{ claim: string; sources: string[]; values: string[] }> = [];
    Array.from(claimMap.entries()).forEach(([claim, entries]) => {
      const uniqueValues = new Set(entries.map((e: { value: string; source: string }) => e.value.toLowerCase().trim()));
      if (uniqueValues.size > 1) {
        conflicts.push({
          claim,
          sources: entries.map((e: { value: string; source: string }) => e.source),
          values: Array.from(uniqueValues) as string[],
        });
      }
    });
    return conflicts;
  }

  /**
   * Build a human-readable context string for injection into AI prompts.
   */
  buildContext(): string {
    const parts: string[] = [];

    // Product node
    if (this.productNodeId) {
      const product = this.nodes.get(this.productNodeId);
      if (product) {
        parts.push(`[PRODOTTO PRINCIPALE]\n${product.title}\n${product.snippet}`);
      }
    }

    // Manual nodes
    const manuals = this.getNodesByType('manual');
    if (manuals.length > 0) {
      parts.push(`[MANUALI TROVATI: ${manuals.length}]`);
      for (const m of manuals.slice(0, 2)) {
        parts.push(`- ${m.title}\n  URL: ${m.url}\n  ${m.snippet.slice(0, 200)}`);
      }
    }

    // Spec sheets
    const specs = this.getNodesByType('spec_sheet');
    if (specs.length > 0) {
      parts.push(`[SCHEDE TECNICHE: ${specs.length}]`);
      for (const s of specs.slice(0, 2)) {
        const facts = s.facts.map((f) => `${f.claim}: ${f.value}`).join(', ');
        parts.push(`- ${s.title}${facts ? `\n  Specifiche: ${facts}` : ''}`);
      }
    }

    // Battery / compatibility nodes
    const batteries = this.getNodesByType('battery');
    if (batteries.length > 0) {
      parts.push(`[SISTEMI BATTERIA COMPATIBILI]`);
      for (const b of batteries) parts.push(`- ${b.title}`);
    }

    // Accessories
    const accessories = this.getNodesByType('accessory');
    if (accessories.length > 0) {
      parts.push(`[ACCESSORI COMPATIBILI: ${accessories.length}]`);
      for (const a of accessories.slice(0, 3)) parts.push(`- ${a.title}`);
    }

    // Conflicts
    const conflicts = this.detectConflicts();
    if (conflicts.length > 0) {
      parts.push(`[DATI CONTRASTANTI: ${conflicts.length} conflitti rilevati]`);
      for (const c of conflicts.slice(0, 3)) {
        parts.push(`- ${c.claim}: ${c.values.join(' vs ')}`);
      }
    }

    return parts.join('\n\n');
  }

  get nodeCount(): number {
    return this.nodes.size;
  }
  get edgeCount(): number {
    return this.edges.length;
  }

  getSummary(): EvidenceGraphSummary {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      manualCount: this.getNodesByType('manual').length + this.getNodesByType('spec_sheet').length,
      batteryCount: this.getNodesByType('battery').length,
      reviewCount: this.getNodesByType('review').length + this.getNodesByType('forum').length,
      conflictCount: this.detectConflicts().length,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory: build EvidenceGraph from CorpusCollection
// ---------------------------------------------------------------------------

/**
 * Build an EvidenceGraph from corpus items for the current enrichment session.
 * Automatically classifies each corpus item into the right node type,
 * extracts numeric facts from content, and links everything to the product node.
 */
export function buildEvidenceGraph(
  productTitle: string,
  productUrl: string,
  corpusItems: CorpusItem[]
): EvidenceGraph {
  const graph = new EvidenceGraph();

  // Root: product node
  const productNodeId = 'evidence_product_main';
  graph.addNode({
    id: productNodeId,
    type: 'product',
    title: productTitle,
    url: productUrl,
    domain: '',
    confidence: 1.0,
    facts: [],
    snippet: productTitle,
  });

  // One node per corpus item
  for (const item of corpusItems) {
    const nodeType = corpusTypeToNodeType(item.type, item.metadata?.intent);
    const nodeId = item.id;

    graph.addNode({
      id: nodeId,
      type: nodeType,
      title: item.title,
      url: item.url,
      domain: item.domain,
      confidence: item.confidence,
      facts: extractFacts(item.content),
      snippet: item.content.slice(0, 300),
    });

    // Edge: product → this node
    const edgeType: EvidenceEdgeType =
      nodeType === 'review' || nodeType === 'forum' ? 'reviews' :
      nodeType === 'manual' || nodeType === 'spec_sheet' ? 'cites' :
      nodeType === 'accessory' || nodeType === 'battery' ? 'compatible_with' :
      'supports';

    graph.addEdge({
      from: productNodeId,
      to: nodeId,
      type: edgeType,
      weight: item.confidence,
    });
  }

  const summary = graph.getSummary();
  log.info(
    `[EvidenceGraph] Built: ${summary.nodeCount} nodes, ${summary.edgeCount} edges, ` +
      `${summary.manualCount} manuals, ${summary.conflictCount} conflicts`
  );

  return graph;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corpusTypeToNodeType(corpusType: string, intent?: string): EvidenceNodeType {
  if (corpusType === 'pdf') return 'manual';
  if (corpusType === 'spec_sheet') return 'spec_sheet';
  if (intent === 'compatibility') return 'accessory';
  if (intent === 'support') return 'review';
  if (corpusType === 'table') return 'spec_sheet';
  return 'review';
}

/** Extract spec: value pairs from text content. */
function extractFacts(content: string): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  // Pattern: "SpecName: 18 V" or "SpecName : 3000 rpm"
  const specPattern =
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,24})\s*:\s*([\d.,]+\s*(?:V|W|A|kg|g|mm|cm|m|rpm|kW|kVA|bar|l\/min|dB|Nm|Ah)?)/g;

  let match: RegExpExecArray | null;
  while ((match = specPattern.exec(content)) !== null) {
    const claim = match[1].trim();
    const value = match[2].trim();
    // Skip very short or generic claims
    if (claim.length < 3 || claim.toLowerCase().includes('http')) continue;
    facts.push({ claim, value, confidence: 0.75, source: content.slice(0, 60) });
    if (facts.length >= 10) break;
  }

  return facts;
}
