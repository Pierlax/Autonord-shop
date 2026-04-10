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
import { EvidenceGraph } from '@/lib/shopify/evidence-graph';
import type { EvidenceNode } from '@/lib/shopify/evidence-graph';

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
