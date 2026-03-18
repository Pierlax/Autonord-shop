/**
 * Corpus Builder — Universal RAG v2, Layer 4
 *
 * Trasforma le risorse navigate in corpora tipizzati per modality e granularità,
 * come nel paper UniversalRAG ma costruiti dinamicamente al volo:
 *
 *   paragraph   — chunk di testo brevi (2-5 frasi)
 *   document    — contenuto pagina completo
 *   table       — dati tabulari (specifiche, matrici compatibilità)
 *   image       — URL immagine con alt text
 *   pdf         — manuale PDF o spec sheet
 *   spec_sheet  — scheda tecnica strutturata
 *
 * Il Corpus Builder non sceglie la strategia di retrieval (lo fa il Router),
 * ma prepara i corpora in modo che il Router possa selezionare la
 * granularità giusta per ogni query.
 */

import { loggers } from '@/lib/logger';
import { NavigatedResource } from './domain-navigator';
import { DiscoveredSource } from './source-discovery';

const log = loggers.shopify;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CorpusType =
  | 'paragraph'   // Short text chunk (2-5 sentences)
  | 'document'    // Full page content
  | 'table'       // Tabular / structured data
  | 'image'       // Image URL + alt text
  | 'pdf'         // PDF manual / spec sheet
  | 'spec_sheet'; // Structured technical specification

export type CorpusModality = 'text' | 'visual' | 'structured';

export interface CorpusItem {
  id: string;
  type: CorpusType;
  modality: CorpusModality;
  /** Text content or URL for images. */
  content: string;
  url: string;
  title: string;
  domain: string;
  confidence: number;
  tokenEstimate: number;
  metadata: {
    intent?: string;
    isPdf?: boolean;
    isTable?: boolean;
    hasSpecs?: boolean;
    depth?: number;
  };
}

export interface CorpusCollection {
  items: CorpusItem[];
  byType: Partial<Record<CorpusType, CorpusItem[]>>;
  totalItems: number;
  totalTokens: number;
  hasPdf: boolean;
  hasTable: boolean;
  hasImage: boolean;
  /**
   * 0-1 estimate of corpus coverage quality.
   * Rewards diversity of modalities and presence of high-value types (PDF, table).
   */
  coverageScore: number;
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/** Detect table or spec-matrix patterns in text. */
function detectTable(text: string): boolean {
  const pipeCount = (text.match(/\|/g) ?? []).length;
  const tabCount = (text.match(/\t/g) ?? []).length;
  const specPair = /[\w\s]{2,20}\s*:\s*[\d.,]+\s*(V|W|A|kg|mm|cm|rpm|kW|kVA|bar|l\/min|dB|Nm)/i;
  return pipeCount >= 3 || tabCount >= 4 || specPair.test(text);
}

/** Detect technical specification content. */
function detectSpecs(text: string): boolean {
  return /\b(volt|watt|amp|torque|rpm|kW|kVA|potenza|coppia|peso|dimensioni|capacità|portata|cilindrata|bar|litri|dB|Nm)\b/i.test(
    text
  );
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeId(url: string, type: CorpusType, idx: number): string {
  const slug = url.slice(-24).replace(/[^a-z0-9]/gi, '').slice(0, 16);
  return `corpus_${type}_${slug}_${idx}`;
}

// ---------------------------------------------------------------------------
// Corpus type classifier
// ---------------------------------------------------------------------------

function classifyType(
  url: string,
  title: string,
  content: string,
  isPdf: boolean
): CorpusType {
  const urlLow = url.toLowerCase();
  const titleLow = title.toLowerCase();

  // PDF → pdf corpus
  if (isPdf || urlLow.endsWith('.pdf')) return 'pdf';

  // Image file → image corpus
  if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(urlLow)) return 'image';

  // Tabular content → table corpus
  if (detectTable(content)) return 'table';

  // Structured spec sheet — official domain + spec content + spec keyword in title/URL
  if (
    detectSpecs(content) &&
    /scheda|datasheet|spec|caratteristiche|technical/i.test(titleLow + urlLow)
  ) {
    return 'spec_sheet';
  }

  // Long content → document; short → paragraph
  return content.length > 300 ? 'document' : 'paragraph';
}

function modalityOf(type: CorpusType): CorpusModality {
  if (type === 'image') return 'visual';
  if (type === 'table' || type === 'spec_sheet') return 'structured';
  return 'text';
}

// ---------------------------------------------------------------------------
// Core builder function
// ---------------------------------------------------------------------------

/**
 * Build a CorpusCollection from navigated resources and discovered sources.
 *
 * Priority: navigated resources (already ranked + depth-1 expanded) are
 * processed first; discovered sources fill remaining token budget.
 *
 * @param navigatedResources  Output from DomainNavigator
 * @param discoveredSources   Output from SourceDiscovery (fallback)
 * @param maxTokenBudget      Token cap for the entire corpus (default: 8000)
 */
export function buildCorpus(
  navigatedResources: NavigatedResource[],
  discoveredSources: DiscoveredSource[],
  maxTokenBudget = 8000
): CorpusCollection {
  const items: CorpusItem[] = [];
  let totalTokens = 0;
  let idx = 0;

  // -- Pass 1: navigated resources (high-confidence, already prioritised)
  for (const res of navigatedResources) {
    if (totalTokens >= maxTokenBudget) break;

    const content = res.snippet || res.title;
    const tokens = estimateTokens(content);
    if (tokens === 0) continue;

    const type = classifyType(res.url, res.title, content, res.isPdf);
    items.push({
      id: makeId(res.url, type, idx++),
      type,
      modality: modalityOf(type),
      content,
      url: res.url,
      title: res.title,
      domain: res.domain,
      confidence: res.confidence,
      tokenEstimate: tokens,
      metadata: {
        intent: res.intent,
        isPdf: res.isPdf,
        isTable: type === 'table',
        hasSpecs: detectSpecs(content),
        depth: res.depth,
      },
    });
    totalTokens += tokens;
  }

  // -- Pass 2: discovered sources not already in corpus (fill budget)
  const includedUrls = new Set(items.map((i) => i.url));
  for (const src of discoveredSources) {
    if (totalTokens >= maxTokenBudget) break;
    if (includedUrls.has(src.url)) continue;

    const content = src.snippet || src.title;
    const tokens = estimateTokens(content);
    if (tokens === 0) continue;

    const type = classifyType(src.url, src.title, content, src.isPdf);
    items.push({
      id: makeId(src.url, type, idx++),
      type,
      modality: modalityOf(type),
      content,
      url: src.url,
      title: src.title,
      domain: src.domain,
      confidence: src.confidence,
      tokenEstimate: tokens,
      metadata: {
        intent: src.intent,
        isPdf: src.isPdf,
        isTable: type === 'table',
        hasSpecs: detectSpecs(content),
      },
    });
    totalTokens += tokens;
  }

  // Group by type
  const byType: Partial<Record<CorpusType, CorpusItem[]>> = {};
  for (const item of items) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type]!.push(item);
  }

  const hasPdf = items.some((i) => i.type === 'pdf');
  const hasTable = items.some((i) => i.type === 'table' || i.type === 'spec_sheet');
  const hasImage = items.some((i) => i.type === 'image');

  // Coverage score rewards modality diversity
  let coverageScore = 0;
  if (items.length > 0) coverageScore += 0.15;
  if (items.length >= 5) coverageScore += 0.05;
  if (hasPdf) coverageScore += 0.25;
  if (hasTable) coverageScore += 0.25;
  if (byType.paragraph?.length || byType.document?.length) coverageScore += 0.15;
  if (hasImage) coverageScore += 0.10;
  if (new Set(items.map((i) => i.domain)).size >= 3) coverageScore += 0.05;
  coverageScore = Math.min(1.0, coverageScore);

  log.info(
    `[CorpusBuilder] ${items.length} items, ${totalTokens} tokens, ` +
      `coverage=${coverageScore.toFixed(2)}, pdf=${hasPdf}, table=${hasTable}, img=${hasImage}`
  );

  return { items, byType, totalItems: items.length, totalTokens, hasPdf, hasTable, hasImage, coverageScore };
}

// ---------------------------------------------------------------------------
// Corpus → context string (for AI prompts)
// ---------------------------------------------------------------------------

/**
 * Serialise a CorpusCollection into a structured text block for AI prompts.
 *
 * Priority order: spec_sheet → pdf → table → document → paragraph → image
 * (highest information density first).
 */
export function corpusToContext(corpus: CorpusCollection, maxTokens = 4000): string {
  const typeOrder: CorpusType[] = ['spec_sheet', 'pdf', 'table', 'document', 'paragraph', 'image'];
  const sections: string[] = [];
  let usedTokens = 0;

  for (const type of typeOrder) {
    for (const item of corpus.byType[type] ?? []) {
      if (usedTokens + item.tokenEstimate > maxTokens) continue;

      const header =
        type === 'pdf'        ? `[PDF MANUALE: ${item.title}]` :
        type === 'spec_sheet' ? `[SCHEDA TECNICA: ${item.title}]` :
        type === 'table'      ? `[TABELLA DATI: ${item.title}]` :
        type === 'image'      ? `[IMMAGINE: ${item.title}]` :
                                `[${type.toUpperCase()}: ${item.title}]`;

      sections.push(`${header}\nFonte: ${item.url}\n${item.content}`);
      usedTokens += item.tokenEstimate;
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Convert corpus items to SearchResult-compatible objects for injection into
 * the existing UniversalRAG retrieval data maps (no downstream changes needed).
 */
export function corpusToSearchResults(corpus: CorpusCollection): Array<{
  title: string;
  link: string;
  snippet: string;
  domain: string;
  provider: 'google' | 'bing' | 'mock';
}> {
  return corpus.items.map((item) => ({
    title: item.title,
    link: item.url,
    snippet: item.content,
    domain: item.domain,
    // All v2 corpus items treated as mock (pre-processed, not live search results)
    provider: 'mock' as const,
  }));
}
