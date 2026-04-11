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
      // R3: Use semantic conflict detection instead of naive string comparison
      const hasConflict = entries.some((a, i) =>
        entries.slice(i + 1).some((b) => factsConflict(a.value, b.value))
      );
      if (hasConflict) {
        conflicts.push({
          claim,
          sources: entries.map((e: { value: string; source: string }) => e.source),
          values: Array.from(new Set(entries.map((e: { value: string; source: string }) => e.value.toLowerCase().trim()))),
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

/**
 * W2 fix: Unit family map for semantic conflict detection.
 *
 * Units that belong to different physical dimensions (e.g. RPM vs BPM)
 * should be treated as incompatible even when the numeric value matches.
 * Two facts with the same value but different dimensions are a conflict
 * because they describe different physical properties.
 */
const UNIT_FAMILY_MAP: Record<string, string> = {
  // Electrical
  v:   'voltage',
  kv:  'voltage',
  a:   'current',
  ah:  'capacity',
  w:   'power',
  kw:  'power',
  kva: 'power_apparent',
  // Mechanical
  nm:  'torque',
  rpm: 'rotational_speed',
  bpm: 'percussion_rate',
  ipm: 'percussion_rate',
  // Mass / dimension
  kg:  'mass',
  g:   'mass',
  mm:  'length',
  cm:  'length',
  m:   'length',
  // Pressure / flow / noise
  bar: 'pressure',
  psi: 'pressure',
  db:  'noise',
  l:   'volume',
  hz:  'frequency',
};

/**
 * R3: Semantic normalization for numeric fact values.
 * Extracts number + unit, maps unit aliases, so "18V" and "18 V" don't create spurious conflicts.
 */
function parseNumericFact(value: string): { num: number | null; unit: string } {
  // Unit alias map: normalize synonyms to canonical form
  const unitAliases: Record<string, string> = {
    'volt': 'v', 'volts': 'v',
    'watt': 'w', 'watts': 'w', 'kw': 'kw', 'kva': 'kva',
    'newton-metro': 'nm', 'newtonmetro': 'nm',
    'ah': 'ah', 'amperehour': 'ah',
    'rpm': 'rpm', 'giri/min': 'rpm', 'min-1': 'rpm',
    'bpm': 'bpm', 'colpi/min': 'bpm',
    'ipm': 'ipm',
    'kg': 'kg', 'kilogrammi': 'kg',
    'db': 'db', 'dba': 'db',
    'bar': 'bar', 'psi': 'psi',
    'litri': 'l', 'liter': 'l', 'litre': 'l',
    'mm': 'mm', 'cm': 'cm', 'm': 'm',
    'hz': 'hz',
  };

  const match = value.trim().match(/^([\d.,]+)\s*([a-zA-Z/²³°-]+)?$/);
  if (!match) return { num: null, unit: '' };

  const num = parseFloat(match[1].replace(',', '.'));
  const rawUnit = (match[2] || '').toLowerCase().trim();
  const unit = unitAliases[rawUnit] ?? rawUnit;

  return { num: isNaN(num) ? null : num, unit };
}

/**
 * W2 fix: Returns true if two fact values represent a real conflict.
 *
 * Three cases handled:
 * 1. Same unit, different values → conflict (e.g. "18V" vs "20V")
 * 2. Different physical dimensions → conflict (e.g. "3000 RPM" vs "3000 BPM")
 * 3. Compatible units, same value → no conflict (e.g. "18V" vs "18 V")
 *
 * "18V" vs "18 V" → no conflict; "18V" vs "20V" → conflict;
 * "3000 RPM" vs "3000 BPM" → conflict (different physical properties).
 */
function factsConflict(v1: string, v2: string): boolean {
  const n1 = parseNumericFact(v1);
  const n2 = parseNumericFact(v2);

  if (n1.num !== null && n2.num !== null && n1.unit !== '' && n2.unit !== '') {
    const family1 = UNIT_FAMILY_MAP[n1.unit];
    const family2 = UNIT_FAMILY_MAP[n2.unit];

    // W2: Different physical dimensions = conflict even if numeric value matches
    if (family1 && family2 && family1 !== family2) {
      return true;
    }

    // Same unit (or same family): compare with 1% tolerance
    if (n1.unit === n2.unit || (family1 && family1 === family2)) {
      const tolerance = Math.max(Math.abs(n1.num), Math.abs(n2.num)) * 0.01;
      return Math.abs(n1.num - n2.num) > tolerance;
    }
  }

  // Fallback: normalised string comparison
  return v1.toLowerCase().trim() !== v2.toLowerCase().trim();
}

/**
 * C6 fix: Multi-pattern fact extraction from text content.
 *
 * The previous regex only matched `Key: numericValue unit` with 11 hardcoded
 * units.  This missed specs with hyphens in claim names, tab/pipe-separated
 * tables, range values, Italian unit aliases, and many units already present
 * in the UNIT_FAMILY_MAP.
 *
 * Now uses three complementary patterns:
 *   A — colon-separated specs (expanded claim chars + units)
 *   B — tab/pipe-separated spec tables
 *   C — known-unit anchored (specs without explicit separator)
 *
 * All patterns share the same comprehensive unit list derived from
 * UNIT_FAMILY_MAP + Italian aliases.  Results are deduplicated by
 * normalised claim key.
 */

// Comprehensive unit regex fragment — covers every unit in UNIT_FAMILY_MAP,
// common aliases (Italian & English), and symbols.
// Ordered longest-first so `kVA` matches before `kV` before `V`, etc.
const UNITS = [
  // multi-char units first (longest match wins)
  'giri/min', 'colpi/min', 'newton-metro', 'l/min', 'l/h',
  'min-1', 'mAh',
  'kVA', 'kW', 'kV',
  'dBA', 'dB',
  'Nm', 'Ah', 'Wh',
  'rpm', 'bpm', 'ipm', 'psi', 'bar',
  'kg', 'mm', 'cm', 'Hz',
  '°C',
  // single-char last
  'V', 'W', 'A', 'g', 'm', 'l',
  '%',
].join('|');

// Claim name: letters (with accents), digits, regular spaces, hyphens, periods,
// parentheses, slashes, apostrophes.  2–40 chars.
// Uses literal space (not \s) to avoid matching tabs and newlines.
const CLAIM = `[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()./'°-]{1,39}`;

// Value: one or two numeric groups (for ranges like 0-3000) + optional unit.
const VALUE = `[\\d.,]+(?:\\s*[-–/]\\s*[\\d.,]+)?\\s*(?:${UNITS})?`;

function extractFacts(content: string): EvidenceFact[] {
  const seen = new Map<string, EvidenceFact>();  // normalised claim → fact
  const sourceSnippet = content.slice(0, 60);
  const MAX_FACTS = 15;

  function add(claim: string, value: string): void {
    if (seen.size >= MAX_FACTS) return;
    claim = claim.trim();
    value = value.trim();
    if (claim.length < 3 || claim.toLowerCase().includes('http')) return;
    // Skip if value is just a bare number with no unit and < 2 digits
    // (too ambiguous — could be a list index or page number)
    if (/^\d$/.test(value)) return;
    const key = claim.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) {
      seen.set(key, { claim, value, confidence: 0.75, source: sourceSnippet });
    }
  }

  // ── Pattern A: colon-separated ──────────────────────────────────────────
  // "Coppia massima: 135 Nm", "Tensione : 18 V", "RPM max.: 0-3000 rpm"
  const colonPattern = new RegExp(`(${CLAIM})\\s*:\\s*(${VALUE})`, 'g');
  let m: RegExpExecArray | null;
  while ((m = colonPattern.exec(content)) !== null) add(m[1], m[2]);

  // ── Pattern B: tab or pipe separated ────────────────────────────────────
  // "Tensione\t18 V" or "Tensione | 18 V" — common in HTML-stripped spec tables
  const tabPipePattern = new RegExp(`(${CLAIM})\\s*[\\t|]\\s*(${VALUE})`, 'g');
  while ((m = tabPipePattern.exec(content)) !== null) add(m[1], m[2]);

  // ── Pattern C: unit-anchored (no separator) ─────────────────────────────
  // "Peso 2.1 kg", "Tensione 18V" — requires a recognised unit to avoid
  // false positives on arbitrary "word number" sequences.
  const UNITS_REQUIRED = UNITS;  // unit must be present (not optional)
  const VALUE_WITH_UNIT = `[\\d.,]+(?:\\s*[-–/]\\s*[\\d.,]+)?\\s*(?:${UNITS_REQUIRED})`;
  const anchoredPattern = new RegExp(
    `(${CLAIM})\\s+(${VALUE_WITH_UNIT})(?=[\\s,;.)\\n]|$)`, 'g'
  );
  while ((m = anchoredPattern.exec(content)) !== null) {
    // Only add if the match includes a real unit (not just digits)
    if (/[A-Za-z°%]/.test(m[2])) add(m[1], m[2]);
  }

  return Array.from(seen.values());
}
