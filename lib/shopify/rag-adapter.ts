/**
 * RAG Adapter - Bridges UniversalRAG output to TwoPhaseQA input
 * 
 * This module transforms the raw output from the UniversalRAG pipeline
 * into the structured format expected by the TwoPhaseQA module.
 * 
 * Key responsibilities:
 * 1. Extract and flatten evidence from RAG fusion results
 * 2. Build a coherent "sourceData" string for atomic fact extraction
 * 3. Handle empty/failed RAG results gracefully (no crashes)
 * 4. Track which sources contributed to the final data
 * 
 * Usage:
 *   import { adaptRagToQa } from './rag-adapter';
 *   const qaInput = adaptRagToQa(ragResult, productTitle, vendor, sku, productType);
 *   const qaResult = await runTwoPhaseQA(qaInput, anthropic);
 */

import { UniversalRAGResult } from './universal-rag';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

// =============================================================================
// TYPES
// =============================================================================

/**
 * The input format expected by TwoPhaseQA's `runTwoPhaseQA` function.
 */
export interface TwoPhaseQAInput {
  title: string;
  description: string;
  brand: string;
  sku: string;
  category: string;
  sourceData?: string;
}

/**
 * Metadata about the adaptation process, useful for debugging and logging.
 */
export interface AdaptationMetadata {
  /** Whether the RAG pipeline returned usable data */
  ragSucceeded: boolean;
  /** Number of evidence items extracted from RAG */
  evidenceCount: number;
  /** Sources that contributed to the sourceData */
  contributingSources: string[];
  /** Total character length of the sourceData string */
  sourceDataLength: number;
  /** Whether benchmark/competitor data was included */
  hasBenchmarkContext: boolean;
  /** Any warnings during adaptation */
  warnings: string[];
}

/**
 * Complete result of the adaptation process.
 */
export interface AdaptationResult {
  /** The input ready for TwoPhaseQA */
  qaInput: TwoPhaseQAInput;
  /** Metadata about the adaptation */
  metadata: AdaptationMetadata;
}

// =============================================================================
// MAIN ADAPTER FUNCTION
// =============================================================================

/**
 * Transforms UniversalRAG output into the format expected by TwoPhaseQA.
 * 
 * This function is designed to be resilient:
 * - If RAG fails, it returns a valid but minimal input (no crash)
 * - If RAG returns partial data, it extracts what's available
 * - If RAG returns rich data, it formats it optimally for fact extraction
 * 
 * @param ragResult - The output from UniversalRAGPipeline.enrichProduct()
 * @param productTitle - Product title
 * @param vendor - Brand/vendor name
 * @param sku - Product SKU
 * @param productType - Product category/type
 * @returns AdaptationResult with qaInput and metadata
 */
export function adaptRagToQa(
  ragResult: UniversalRAGResult,
  productTitle: string,
  vendor: string,
  sku: string,
  productType: string
): AdaptationResult {
  const warnings: string[] = [];
  const contributingSources: string[] = [];
  let evidenceCount = 0;

  log.info(`[RAG Adapter] Adapting RAG result for: ${vendor} ${productTitle}`);

  // =========================================================================
  // CASE 1: RAG failed completely
  // =========================================================================
  if (!ragResult.success || !ragResult.data) {
    log.info('[RAG Adapter] RAG pipeline failed or returned no data — using empty sourceData');
    warnings.push('RAG pipeline failed: ' + (ragResult.data?.error || 'unknown error'));

    return {
      qaInput: createEmptyQaInput(productTitle, vendor, sku, productType),
      metadata: {
        ragSucceeded: false,
        evidenceCount: 0,
        contributingSources: [],
        sourceDataLength: 0,
        hasBenchmarkContext: false,
        warnings,
      },
    };
  }

  // =========================================================================
  // CASE 2: RAG succeeded — extract and format data
  // =========================================================================
  const data = ragResult.data;
  const sections: string[] = [];

  // --- Extract evidence from fusion results ---
  if (data.evidence && Array.isArray(data.evidence)) {
    for (const item of data.evidence) {
      evidenceCount++;
      const sourceLabel = item.source || item.sourceType || 'unknown';
      if (!contributingSources.includes(sourceLabel)) {
        contributingSources.push(sourceLabel);
      }

      // Format each evidence item
      if (typeof item === 'string') {
        sections.push(item);
      } else if (item.content || item.text || item.snippet) {
        const text = item.content || item.text || item.snippet;
        const confidence = item.confidence ? ` [confidence: ${item.confidence}]` : '';
        sections.push(`[Source: ${sourceLabel}${confidence}]\n${text}`);
      } else if (typeof item === 'object') {
        // Generic object — stringify relevant fields
        const relevantFields = extractRelevantFields(item);
        if (relevantFields) {
          sections.push(`[Source: ${sourceLabel}]\n${relevantFields}`);
        }
      }
    }
  }

  // --- Extract from raw source data (fallback if no fusion) ---
  if (evidenceCount === 0 && typeof data === 'object') {
    // Try to extract from source-keyed data (e.g., { official_specs: [...], retailer_data: [...] })
    for (const [key, value] of Object.entries(data)) {
      if (key === 'benchmarkContext' || key === 'brandProfile' || key === 'competitors') {
        continue; // Handle these separately below
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          evidenceCount++;
          if (!contributingSources.includes(key)) {
            contributingSources.push(key);
          }
          const text = typeof item === 'string' ? item : extractRelevantFields(item);
          if (text) {
            sections.push(`[Source: ${key}]\n${text}`);
          }
        }
      } else if (typeof value === 'string' && value.length > 20) {
        evidenceCount++;
        if (!contributingSources.includes(key)) {
          contributingSources.push(key);
        }
        sections.push(`[Source: ${key}]\n${value}`);
      }
    }
  }

  // --- Include benchmark/competitor context ---
  let hasBenchmarkContext = false;
  if (data.benchmarkContext && typeof data.benchmarkContext === 'string') {
    sections.push(`\n--- BENCHMARK CONTEXT (Ancora di Verità) ---\n${data.benchmarkContext}`);
    hasBenchmarkContext = true;
    if (!contributingSources.includes('benchmark')) {
      contributingSources.push('benchmark');
    }
  }

  if (data.brandProfile) {
    const brandInfo = typeof data.brandProfile === 'string' 
      ? data.brandProfile 
      : JSON.stringify(data.brandProfile, null, 2);
    sections.push(`\n--- BRAND PROFILE ---\n${brandInfo}`);
    hasBenchmarkContext = true;
  }

  if (data.competitors && Array.isArray(data.competitors) && data.competitors.length > 0) {
    const competitorInfo = data.competitors
      .map((c: any) => `- ${c.name || c.title || JSON.stringify(c)}`)
      .join('\n');
    sections.push(`\n--- COMPETITOR REFERENCE ---\n${competitorInfo}`);
    hasBenchmarkContext = true;
  }

  // --- Include confidence and coverage scores ---
  if (data.confidence !== undefined || data.coverage !== undefined) {
    const meta: string[] = [];
    if (data.confidence !== undefined) meta.push(`Confidence: ${data.confidence}`);
    if (data.coverage !== undefined) meta.push(`Coverage: ${data.coverage}`);
    sections.push(`\n--- RAG QUALITY ---\n${meta.join(', ')}`);
  }

  // --- Include conflict information ---
  if (data.conflicts && Array.isArray(data.conflicts) && data.conflicts.length > 0) {
    const conflictInfo = data.conflicts
      .map((c: any) => typeof c === 'string' ? c : `${c.field || 'unknown'}: ${c.description || JSON.stringify(c)}`)
      .join('\n');
    sections.push(`\n--- DATA CONFLICTS (verify manually) ---\n${conflictInfo}`);
    warnings.push(`${data.conflicts.length} data conflicts detected`);
  }

  // --- Build the final sourceData string ---
  const sourceData = sections.join('\n\n');

  if (evidenceCount === 0) {
    warnings.push('RAG succeeded but no extractable evidence found');
    log.info('[RAG Adapter] Warning: RAG succeeded but produced no extractable evidence');
  } else {
    log.info(`[RAG Adapter] Extracted ${evidenceCount} evidence items from ${contributingSources.length} sources`);
  }

  // --- Build description from RAG data or use empty ---
  const description = buildDescriptionFromRag(data, productTitle, vendor);

  return {
    qaInput: {
      title: productTitle,
      description,
      brand: vendor,
      sku: sku || '',
      category: productType || 'Elettroutensile',
      sourceData: sourceData || undefined,
    },
    metadata: {
      ragSucceeded: true,
      evidenceCount,
      contributingSources,
      sourceDataLength: sourceData.length,
      hasBenchmarkContext,
      warnings,
    },
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates an empty but valid QA input when RAG fails.
 * This ensures the TwoPhaseQA module can still run (with lower quality output).
 */
function createEmptyQaInput(
  productTitle: string,
  vendor: string,
  sku: string,
  productType: string
): TwoPhaseQAInput {
  return {
    title: productTitle,
    description: `${vendor} ${productTitle}`,
    brand: vendor,
    sku: sku || '',
    category: productType || 'Elettroutensile',
    sourceData: undefined,
  };
}

/**
 * Extracts human-readable text from an arbitrary object.
 * Focuses on fields that are likely to contain useful product information.
 */
function extractRelevantFields(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;

  const relevantKeys = [
    'content', 'text', 'snippet', 'description', 'summary',
    'title', 'specs', 'specifications', 'features',
    'pros', 'cons', 'rating', 'review',
    'queries', 'source', 'granularity',
  ];

  const parts: string[] = [];

  for (const key of relevantKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0) {
        parts.push(`${key}: ${value}`);
      } else if (Array.isArray(value)) {
        const items = value.filter(v => typeof v === 'string').join(', ');
        if (items) parts.push(`${key}: ${items}`);
      } else if (typeof value === 'object') {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Attempts to build a product description from RAG data.
 * Falls back to a simple title+vendor string if no description is found.
 */
function buildDescriptionFromRag(
  data: any,
  productTitle: string,
  vendor: string
): string {
  // Try to find a description in the RAG data
  if (data.description && typeof data.description === 'string') {
    return data.description;
  }

  // Try to find it in evidence
  if (data.evidence && Array.isArray(data.evidence)) {
    for (const item of data.evidence) {
      if (item.description && typeof item.description === 'string') {
        return item.description;
      }
    }
  }

  // Fallback
  return `${vendor} ${productTitle}`;
}
