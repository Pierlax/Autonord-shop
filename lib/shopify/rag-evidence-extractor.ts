/**
 * Shared RAG Evidence Extractor — R8 (Simplification Audit)
 *
 * Previously rag-adapter.ts and ai-enrichment-v3.ts both extracted evidence
 * from UniversalRAGResult.data with duplicated, potentially divergent logic.
 *
 * This module is the single implementation. Both consumers import from here:
 *   - rag-adapter.ts     → uses snippets as flat text sections for QA; also imports
 *                          SourceType / inferSourceType / getTrustScore so StructuredSource
 *                          stays consistent with the extractor's trust model
 *   - ai-enrichment-v3.ts → uses the structured form for provenance & ★★★ prompt rendering
 */

import { UniversalRAGResult } from './universal-rag';

// =============================================================================
// Source trust model — single definition used by rag-adapter AND ai-enrichment-v3
// =============================================================================

/**
 * Semantic type of a RAG evidence source.
 * Used to assign trust scores and render ★ provenance labels in LLM prompts.
 */
export type SourceType =
  | 'spec_sheet'  // Official manufacturer PDF / specification page
  | 'manual'      // User or service manual
  | 'brand_site'  // Official brand website (non-spec page)
  | 'retailer'    // E-commerce product page (Amazon, Leroy Merlin, etc.)
  | 'review'      // Expert review or comparative test site
  | 'forum'       // Community forum, Reddit, social media
  | 'benchmark'   // Comparative benchmark or competitor context
  | 'unknown';

/** Infer the semantic type of a source from its label and optional evidenceType tag. */
export function inferSourceType(sourceLabel: string, evidenceType?: string): SourceType {
  const s = (sourceLabel + ' ' + (evidenceType ?? '')).toLowerCase();
  if (s.includes('spec') || s.includes('scheda') || s.includes('spec_sheet') || s.includes('pdf'))
    return 'spec_sheet';
  if (s.includes('manual') || s.includes('manuale') || s.includes('istruzion'))
    return 'manual';
  if (s.includes('benchmark') || s.includes('competitor') || s.includes('brand_profile'))
    return 'benchmark';
  if (s.includes('review') || s.includes('recensione') || s.includes('test'))
    return 'review';
  if (
    s.includes('amazon') || s.includes('ebay') || s.includes('leroy') ||
    s.includes('retailer') || s.includes('shop') || s.includes('store') ||
    s.includes('e-commerce')
  )
    return 'retailer';
  if (
    s.includes('forum') || s.includes('reddit') || s.includes('community') ||
    s.includes('fai-da-te') || s.includes('discuss')
  )
    return 'forum';
  const BRAND_PATTERNS = [
    'makita', 'bosch', 'dewalt', 'milwaukee', 'hilti', 'metabo',
    'festool', 'hitachi', 'hikoki', 'karcher', 'husqvarna', 'flex',
  ];
  if (BRAND_PATTERNS.some(b => s.includes(b))) return 'brand_site';
  return 'unknown';
}

/** Map a SourceType to a numeric trust score (0–1). */
export function getTrustScore(type: SourceType): number {
  const scores: Record<SourceType, number> = {
    spec_sheet: 0.95,
    manual:     0.90,
    brand_site: 0.80,
    benchmark:  0.80,
    review:     0.70,
    retailer:   0.60,
    unknown:    0.50,
    forum:      0.40,
  };
  return scores[type];
}

/** Convert a 0–1 trust score to a ★/★★/★★★ string for LLM prompts. */
export function trustToStars(trust: number): string {
  if (trust >= 0.85) return '★★★';
  if (trust >= 0.65) return '★★';
  return '★';
}

// =============================================================================
// Types
// =============================================================================

export interface RAGEvidenceItem {
  text: string;
  source: string;
  confidence?: string | number;
  /** Semantic type inferred from the source label */
  sourceType: SourceType;
  /** Trust score 0–1 derived from sourceType */
  trust: number;
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

  // Helper to build a typed snippet
  function makeSnippet(
    text: string,
    source: string,
    confidence?: string | number,
    evidenceTypeHint?: string,
    isVerified?: boolean
  ): RAGEvidenceItem {
    const srcType = inferSourceType(source, evidenceTypeHint);
    const baseTrust = getTrustScore(srcType);
    const trust = isVerified ? Math.max(baseTrust, 0.85) : baseTrust;
    return { text, source, confidence, sourceType: srcType, trust };
  }

  // --- evidence[] array (primary path) ---
  if (data.evidence && Array.isArray(data.evidence)) {
    for (const item of data.evidence) {
      const text = item.content || item.text || item.snippet || '';
      const source = item.source || item.sourceType || 'unknown';
      if (text && typeof text === 'string' && text.length > 5 && !isMock(text)) {
        evidence.snippets.push(
          makeSnippet(text, source, item.confidence, item.evidenceType, item.isVerified)
        );
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
            evidence.snippets.push(makeSnippet(text, key));
          }
        }
      } else if (typeof value === 'string' && value.length > 20 && !isMock(value)) {
        evidence.snippets.push(makeSnippet(value, key));
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
