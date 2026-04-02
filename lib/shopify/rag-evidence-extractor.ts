/**
 * Shared RAG Evidence Extractor — R8 (Simplification Audit)
 *
 * Previously rag-adapter.ts and ai-enrichment-v3.ts both extracted evidence
 * from UniversalRAGResult.data with duplicated, potentially divergent logic.
 *
 * This module is the single implementation. Both consumers import from here:
 *   - rag-adapter.ts     → uses snippets as flat text sections for QA
 *   - ai-enrichment-v3.ts → uses the structured form for provenance & prompt
 */

import { UniversalRAGResult } from './universal-rag';

// =============================================================================
// Types
// =============================================================================

export interface RAGEvidenceItem {
  text: string;
  source: string;
  confidence?: string | number;
}

export interface RAGEvidence {
  snippets: RAGEvidenceItem[];
  benchmarkContext: string | null;
  brandProfile: string | null;
  competitors: string[];
  conflicts: string[];
  accessories: { name: string; reason: string }[];
}

// =============================================================================
// Helpers
// =============================================================================

const MOCK_MARKERS = [
  '[MOCK DATA]',
  'simulated search result',
  'Configure a search API key',
  'mock-result-',
];

function isMock(text: string): boolean {
  return MOCK_MARKERS.some(m => text.includes(m));
}

// =============================================================================
// Main extractor
// =============================================================================

/**
 * Extract structured evidence from a UniversalRAGResult.
 *
 * Handles all observed runtime shapes of `data`:
 *   - `{ evidence: [...] }` — from proactive-fusion or direct assembly
 *   - `{ official_specs: [...], retailer_data: [...] }` — source-keyed fallback
 *   - Plain string fields
 */
export function extractRAGEvidence(ragResult: UniversalRAGResult): RAGEvidence {
  const evidence: RAGEvidence = {
    snippets: [],
    benchmarkContext: null,
    brandProfile: null,
    competitors: [],
    conflicts: [],
    accessories: [],
  };

  if (!ragResult.success || !ragResult.data) {
    return evidence;
  }

  const data = ragResult.data;

  // --- evidence[] array (primary path) ---
  if (data.evidence && Array.isArray(data.evidence)) {
    for (const item of data.evidence) {
      const text = item.content || item.text || item.snippet || '';
      const source = item.source || item.sourceType || 'unknown';
      if (text && typeof text === 'string' && text.length > 5 && !isMock(text)) {
        evidence.snippets.push({ text, source, confidence: item.confidence });
      }
    }
  }

  // --- source-keyed fallback when evidence[] is absent ---
  const RESERVED_KEYS = new Set([
    'benchmarkContext', 'brandProfile', 'competitors', 'confidence',
    'coverage', 'conflicts', 'error', 'v2CorpusContext', 'v2EvidenceGraphContext',
  ]);

  if (evidence.snippets.length === 0 && typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (RESERVED_KEYS.has(key) || key.startsWith('_') || key.startsWith('v2')) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          const text = typeof item === 'string'
            ? item
            : ((item as any)?.content || (item as any)?.text || (item as any)?.snippet || '');
          if (text && typeof text === 'string' && text.length > 5 && !isMock(text)) {
            evidence.snippets.push({ text, source: key });
          }
        }
      } else if (typeof value === 'string' && value.length > 20 && !isMock(value)) {
        evidence.snippets.push({ text: value, source: key });
      }
    }
  }

  // --- Benchmark context ---
  if (data.benchmarkContext && typeof data.benchmarkContext === 'string') {
    evidence.benchmarkContext = data.benchmarkContext;
  }

  // --- Brand profile ---
  if (data.brandProfile) {
    evidence.brandProfile = typeof data.brandProfile === 'string'
      ? data.brandProfile
      : JSON.stringify(data.brandProfile);
  }

  // --- Competitors ---
  if (data.competitors && Array.isArray(data.competitors)) {
    evidence.competitors = (data.competitors as any[]).map(c =>
      typeof c === 'string' ? c : (c.name || c.title || JSON.stringify(c))
    );
  }

  // --- Conflicts (filter mock) ---
  if (data.conflicts && Array.isArray(data.conflicts)) {
    evidence.conflicts = (data.conflicts as any[])
      .map(c => typeof c === 'string' ? c : (c.description || c.field || JSON.stringify(c)))
      .filter((c: string) => !isMock(c));
  }

  return evidence;
}
