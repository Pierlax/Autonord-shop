/**
 * Tests — Evidence graph conflict detection
 *
 * Verifies that EvidenceGraph.detectConflicts():
 * 1. Returns empty array when no conflicting facts exist
 * 2. Detects when two sources assert different values for the same claim
 * 3. Does NOT flag as conflict when two sources agree on the same value
 * 4. Is case- and whitespace-insensitive on claim keys
 * 5. Reports all sources and all distinct values for each conflict
 * 6. Handles nodes with no facts gracefully
 */

import { describe, it, expect } from 'vitest';
import { EvidenceGraph, buildEvidenceGraph } from '@/lib/shopify/evidence-graph';
import type { EvidenceNode } from '@/lib/shopify/evidence-graph';
import type { CorpusItem } from '@/lib/shopify/corpus-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nodeCounter = 0;

function makeNode(
  type: EvidenceNode['type'],
  facts: Array<{ claim: string; value: string }>,
): EvidenceNode {
  const id = `node-${++nodeCounter}`;
  return {
    id,
    type,
    title: `Test node ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    confidence: 0.9,
    snippet: '',
    facts: facts.map(f => ({
      claim: f.claim,
      value: f.value,
      confidence: 0.9,
      source: `https://example.com/${id}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// No conflicts
// ---------------------------------------------------------------------------

describe('EvidenceGraph.detectConflicts() — no conflicts', () => {
  it('returns empty array for a graph with no nodes', () => {
    const graph = new EvidenceGraph();
    expect(graph.detectConflicts()).toHaveLength(0);
  });

  it('returns empty array for a single node', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'peso', value: '2.1 kg' }]));
    expect(graph.detectConflicts()).toHaveLength(0);
  });

  it('returns empty array when two nodes agree on the same value', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'coppia', value: '135 Nm' }]));
    graph.addNode(makeNode('review', [{ claim: 'coppia', value: '135 Nm' }]));
    expect(graph.detectConflicts()).toHaveLength(0);
  });

  it('returns empty array for nodes with no facts', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('forum', []));
    graph.addNode(makeNode('review', []));
    expect(graph.detectConflicts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('EvidenceGraph.detectConflicts() — detects conflicts', () => {
  it('detects a weight conflict between manual and review', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'peso', value: '2.1 kg' }]));
    graph.addNode(makeNode('review', [{ claim: 'peso', value: '2.5 kg' }]));

    const conflicts = graph.detectConflicts();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const weightConflict = conflicts.find(c => c.claim === 'peso');
    expect(weightConflict).toBeDefined();
    expect(weightConflict!.values).toContain('2.1 kg');
    expect(weightConflict!.values).toContain('2.5 kg');
  });

  it('detects a torque conflict across forum and manual', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'coppia massima', value: '135 Nm' }]));
    graph.addNode(makeNode('forum', [{ claim: 'coppia massima', value: '120 Nm' }]));

    const conflicts = graph.detectConflicts();
    expect(conflicts.some(c => c.claim === 'coppia massima')).toBe(true);
  });

  it('reports all sources involved in the conflict', () => {
    const graph = new EvidenceGraph();
    const n1 = makeNode('manual', [{ claim: 'tensione', value: '18 V' }]);
    const n2 = makeNode('review', [{ claim: 'tensione', value: '20 V' }]);
    graph.addNode(n1);
    graph.addNode(n2);

    const conflicts = graph.detectConflicts();
    const tensionConflict = conflicts.find(c => c.claim === 'tensione');
    expect(tensionConflict!.sources.length).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates claim keys (case-insensitive)', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'Peso', value: '2.1 kg' }]));
    graph.addNode(makeNode('review', [{ claim: 'peso', value: '2.5 kg' }])); // lowercase

    const conflicts = graph.detectConflicts();
    // Should find exactly one conflict (not two), keyed on lowercase "peso"
    const pesoConflicts = conflicts.filter(c => c.claim === 'peso');
    expect(pesoConflicts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getSummary() — indirect test of detectConflicts()
// ---------------------------------------------------------------------------

describe('EvidenceGraph.getSummary()', () => {
  it('conflictCount is 0 when graph has no conflicts', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'peso', value: '2.1 kg' }]));
    expect(graph.getSummary().conflictCount).toBe(0);
  });

  it('conflictCount > 0 when graph has conflicts', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('manual', [{ claim: 'peso', value: '2.1 kg' }]));
    graph.addNode(makeNode('review', [{ claim: 'peso', value: '2.5 kg' }]));
    expect(graph.getSummary().conflictCount).toBeGreaterThan(0);
  });

  it('nodeCount matches the number of added nodes', () => {
    const graph = new EvidenceGraph();
    graph.addNode(makeNode('product', []));
    graph.addNode(makeNode('manual', []));
    graph.addNode(makeNode('review', []));
    expect(graph.getSummary().nodeCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// C6: extractFacts() — multi-pattern extraction (tested via buildEvidenceGraph)
// ---------------------------------------------------------------------------

function makeCorpusItem(content: string, id?: string): CorpusItem {
  return {
    id: id || `item-${++nodeCounter}`,
    type: 'paragraph',
    modality: 'text',
    content,
    url: 'https://example.com/specs',
    title: 'Test spec page',
    domain: 'example.com',
    confidence: 0.9,
    tokenEstimate: Math.ceil(content.length / 4),
    metadata: {},
  };
}

/** Helper: returns the extracted facts from the first corpus-derived node. */
function factsFrom(content: string) {
  const graph = buildEvidenceGraph('Test Product', 'https://shop.example.com/p/1', [
    makeCorpusItem(content),
  ]);
  // Node 0 is the root product node (no facts); node 1 is our corpus item
  const nodes = graph.getNodesByType('product');
  // Get the non-product node — it has the extracted facts
  const allNodes = ['manual', 'spec_sheet', 'review', 'forum', 'accessory', 'battery', 'product'] as const;
  for (const type of allNodes) {
    const ns = graph.getNodesByType(type);
    for (const n of ns) {
      if (n.facts.length > 0) return n.facts;
    }
  }
  // fallback: look at all nodes via getSummary nodeCount
  return [] as { claim: string; value: string }[];
}

describe('extractFacts() — colon-separated specs (Pattern A)', () => {
  it('extracts standard "Key: value unit" specs', () => {
    const facts = factsFrom('Tensione: 18 V. Coppia massima: 135 Nm. Peso: 2.1 kg.');
    expect(facts.some(f => f.value.includes('18') && f.value.includes('V'))).toBe(true);
    expect(facts.some(f => f.value.includes('135') && f.value.includes('Nm'))).toBe(true);
    expect(facts.some(f => f.value.includes('2.1') && f.value.includes('kg'))).toBe(true);
  });

  it('handles claims with hyphens and parentheses', () => {
    const facts = factsFrom('Max-speed: 3000 rpm. Noise (dB): 72 dB. Temp. max.: 50 °C.');
    expect(facts.some(f => f.value.includes('3000'))).toBe(true);
    expect(facts.some(f => f.value.includes('72'))).toBe(true);
    expect(facts.some(f => f.value.includes('50'))).toBe(true);
  });

  it('handles units not in the old allowlist: psi, Hz, %, Wh, mAh', () => {
    const facts = factsFrom('Pressione: 8 psi. Frequenza: 50 Hz. Efficienza: 95%. Energia: 72 Wh. Capacità: 5000 mAh.');
    expect(facts.some(f => f.value.includes('psi'))).toBe(true);
    expect(facts.some(f => f.value.includes('Hz'))).toBe(true);
    expect(facts.some(f => f.value.includes('%'))).toBe(true);
    expect(facts.some(f => f.value.includes('Wh'))).toBe(true);
    expect(facts.some(f => f.value.includes('mAh'))).toBe(true);
  });

  it('handles range values like 0-3000 rpm', () => {
    const facts = factsFrom('Velocità: 0-3000 rpm. Temperatura operativa: 10–50 °C.');
    expect(facts.some(f => f.value.includes('0-3000') || f.value.includes('0–3000'))).toBe(true);
  });

  it('handles claims longer than 25 characters', () => {
    const facts = factsFrom('Massima velocità di rotazione: 3000 rpm.');
    expect(facts.some(f => f.value.includes('3000'))).toBe(true);
  });

  it('handles Italian unit aliases: giri/min, l/min', () => {
    const facts = factsFrom('Velocità massima: 3000 giri/min. Portata aria: 250 l/min.');
    expect(facts.some(f => f.value.includes('giri/min'))).toBe(true);
    expect(facts.some(f => f.value.includes('l/min'))).toBe(true);
  });
});

describe('extractFacts() — tab/pipe separated (Pattern B)', () => {
  it('extracts specs from pipe-separated tables', () => {
    const facts = factsFrom('Tensione | 18 V\nCoppia | 135 Nm\nPeso | 2.1 kg');
    expect(facts.some(f => f.value.includes('18'))).toBe(true);
    expect(facts.some(f => f.value.includes('135'))).toBe(true);
  });

  it('extracts specs from tab-separated tables', () => {
    const facts = factsFrom('Tensione\t18 V\nPotenza\t1300 W');
    expect(facts.some(f => f.value.includes('18'))).toBe(true);
    expect(facts.some(f => f.value.includes('1300'))).toBe(true);
  });
});

describe('extractFacts() — unit-anchored without separator (Pattern C)', () => {
  it('extracts "Peso 2.1 kg" without colon', () => {
    const facts = factsFrom('Peso 2.1 kg, tensione 18 V, coppia 135 Nm.');
    expect(facts.some(f => f.value.includes('2.1') && f.value.includes('kg'))).toBe(true);
    expect(facts.some(f => f.value.includes('18') && f.value.includes('V'))).toBe(true);
  });
});

describe('extractFacts() — deduplication and limits', () => {
  it('deduplicates by normalised claim key', () => {
    const facts = factsFrom('Tensione: 18 V. tensione: 18 V. TENSIONE: 18 V.');
    const tensionFacts = facts.filter(f => f.claim.toLowerCase().includes('tension'));
    expect(tensionFacts).toHaveLength(1);
  });

  it('skips claims shorter than 3 chars', () => {
    // Each on its own line to prevent cross-line claim merging
    const facts = factsFrom('V: 18\nOK: 1');
    // "V" is only 1 char, "OK" is only 2 chars — both should be skipped
    expect(facts).toHaveLength(0);
  });

  it('caps at 15 facts', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Spec ${i}: ${i * 10} W`).join('\n');
    const facts = factsFrom(lines);
    expect(facts.length).toBeLessThanOrEqual(15);
  });
});
