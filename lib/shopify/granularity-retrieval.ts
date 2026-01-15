/**
 * Granularity-Aware Retrieval - UniversalRAG Implementation
 * 
 * Based on "UniversalRAG: Retrieval-Augmented Generation over Corpora 
 * of Diverse Modalities and Granularities" (KAIST, 2026)
 * 
 * Different queries require different levels of detail:
 * - "What is the voltage?" → Single fact
 * - "How does the motor work?" → Paragraph
 * - "Compare Milwaukee vs Makita ecosystem" → Full section/document
 * 
 * This module determines the optimal granularity level for each query
 * and adjusts retrieval and context window usage accordingly.
 */

import Anthropic from '@anthropic-ai/sdk';

// Granularity levels from finest to coarsest
export type GranularityLevel = 
  | 'fact'           // Single data point (e.g., "18V", "2.5kg")
  | 'sentence'       // One complete sentence
  | 'paragraph'      // 2-5 sentences, one concept
  | 'section'        // Multiple paragraphs, one topic
  | 'document';      // Full document/page

// Query complexity classification
export type QueryComplexity = 
  | 'simple'         // Single fact lookup
  | 'moderate'       // Requires some context
  | 'complex'        // Multi-hop reasoning
  | 'comprehensive'; // Full analysis needed

export interface GranularityDecision {
  level: GranularityLevel;
  complexity: QueryComplexity;
  maxTokens: number;
  maxChunks: number;
  reasoning: string;
  confidence: number;
}

export interface GranularityConfig {
  defaultLevel: GranularityLevel;
  tokenBudget: number;
  enableAdaptive: boolean;
}

const DEFAULT_CONFIG: GranularityConfig = {
  defaultLevel: 'paragraph',
  tokenBudget: 4000,
  enableAdaptive: true,
};

// Token budgets per granularity level
const GRANULARITY_TOKEN_LIMITS: Record<GranularityLevel, { maxTokens: number; maxChunks: number }> = {
  fact: { maxTokens: 200, maxChunks: 5 },
  sentence: { maxTokens: 500, maxChunks: 8 },
  paragraph: { maxTokens: 1500, maxChunks: 6 },
  section: { maxTokens: 3000, maxChunks: 4 },
  document: { maxTokens: 6000, maxChunks: 2 },
};

// Query patterns for granularity detection
const GRANULARITY_PATTERNS: { pattern: RegExp; level: GranularityLevel; complexity: QueryComplexity }[] = [
  // Fact-level queries
  { pattern: /^(qual è|quanto|quanti|che) (il |la |lo |l')?(volt|peso|dimensioni|capacità|potenza|coppia|rpm|ah|wh)/i, level: 'fact', complexity: 'simple' },
  { pattern: /^(voltage|weight|dimensions|capacity|power|torque|rpm)/i, level: 'fact', complexity: 'simple' },
  { pattern: /specifiche tecniche|technical specs|datasheet/i, level: 'fact', complexity: 'simple' },
  
  // Sentence-level queries
  { pattern: /^(è |ha |può |supporta )/i, level: 'sentence', complexity: 'simple' },
  { pattern: /compatibile con|funziona con|adatto per/i, level: 'sentence', complexity: 'simple' },
  
  // Paragraph-level queries
  { pattern: /come funziona|how does|spiegami|descrivi/i, level: 'paragraph', complexity: 'moderate' },
  { pattern: /vantaggi|svantaggi|pro e contro|pros and cons/i, level: 'paragraph', complexity: 'moderate' },
  { pattern: /caratteristiche principali|main features/i, level: 'paragraph', complexity: 'moderate' },
  
  // Section-level queries
  { pattern: /confronto|comparison|vs|versus|differenze tra/i, level: 'section', complexity: 'complex' },
  { pattern: /guida all'acquisto|buying guide|come scegliere/i, level: 'section', complexity: 'complex' },
  { pattern: /recensione completa|full review|analisi dettagliata/i, level: 'section', complexity: 'complex' },
  
  // Document-level queries
  { pattern: /manuale|manual|istruzioni complete|guida completa/i, level: 'document', complexity: 'comprehensive' },
  { pattern: /tutto su|everything about|panoramica completa/i, level: 'document', complexity: 'comprehensive' },
];

/**
 * Rule-based granularity detection
 */
export function detectGranularityRules(query: string): GranularityDecision {
  const queryLower = query.toLowerCase();
  
  // Check patterns
  for (const { pattern, level, complexity } of GRANULARITY_PATTERNS) {
    if (pattern.test(queryLower)) {
      const limits = GRANULARITY_TOKEN_LIMITS[level];
      return {
        level,
        complexity,
        maxTokens: limits.maxTokens,
        maxChunks: limits.maxChunks,
        reasoning: `Pattern match: ${pattern.source}`,
        confidence: 0.8,
      };
    }
  }
  
  // Heuristics based on query length and structure
  const wordCount = query.split(/\s+/).length;
  const hasQuestionWords = /chi|cosa|come|quando|dove|perché|quale|quanto/i.test(queryLower);
  const hasComparisonWords = /vs|versus|confronto|meglio|differenza/i.test(queryLower);
  
  if (wordCount <= 5 && hasQuestionWords) {
    return createGranularityDecision('fact', 'simple', 'Short question query');
  }
  
  if (hasComparisonWords) {
    return createGranularityDecision('section', 'complex', 'Comparison query detected');
  }
  
  if (wordCount > 15) {
    return createGranularityDecision('section', 'complex', 'Long complex query');
  }
  
  // Default to paragraph for most product queries
  return createGranularityDecision('paragraph', 'moderate', 'Default granularity for product enrichment');
}

/**
 * LLM-based granularity detection for complex cases
 */
export async function detectGranularityLLM(
  query: string,
  productContext?: { title: string; vendor: string }
): Promise<GranularityDecision> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `Sei un sistema di classificazione per un RAG di e-commerce elettroutensili.
Determina il livello di granularità ottimale per rispondere alla query.

LIVELLI DI GRANULARITÀ:
- fact: Singolo dato (voltaggio, peso, prezzo) - max 200 token
- sentence: Una frase completa - max 500 token
- paragraph: 2-5 frasi, un concetto - max 1500 token
- section: Più paragrafi, un argomento - max 3000 token
- document: Documento completo - max 6000 token

COMPLESSITÀ:
- simple: Lookup singolo fatto
- moderate: Richiede contesto
- complex: Ragionamento multi-step
- comprehensive: Analisi completa

Rispondi SOLO con JSON:
{
  "level": "fact|sentence|paragraph|section|document",
  "complexity": "simple|moderate|complex|comprehensive",
  "reasoning": "Breve spiegazione",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        { role: 'user', content: `Query: "${query}"${productContext ? `\nProdotto: ${productContext.title} (${productContext.vendor})` : ''}` }
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const limits = GRANULARITY_TOKEN_LIMITS[parsed.level as GranularityLevel];
    
    return {
      level: parsed.level as GranularityLevel,
      complexity: parsed.complexity as QueryComplexity,
      maxTokens: limits.maxTokens,
      maxChunks: limits.maxChunks,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
    };
  } catch (error) {
    console.error('[GranularityRetrieval] LLM detection failed:', error);
    return detectGranularityRules(query);
  }
}

/**
 * Adaptive granularity selection based on retrieved content
 */
export function adaptGranularity(
  initialDecision: GranularityDecision,
  retrievedContentLength: number,
  informationDensity: number // 0-1, how much relevant info per token
): GranularityDecision {
  // If content is sparse, increase granularity
  if (informationDensity < 0.3 && initialDecision.level !== 'document') {
    const levels: GranularityLevel[] = ['fact', 'sentence', 'paragraph', 'section', 'document'];
    const currentIndex = levels.indexOf(initialDecision.level);
    const newLevel = levels[Math.min(currentIndex + 1, levels.length - 1)];
    const limits = GRANULARITY_TOKEN_LIMITS[newLevel];
    
    return {
      ...initialDecision,
      level: newLevel,
      maxTokens: limits.maxTokens,
      maxChunks: limits.maxChunks,
      reasoning: `${initialDecision.reasoning} [Adapted: increased due to low density]`,
    };
  }
  
  // If content is very dense, we might be able to use less
  if (informationDensity > 0.8 && initialDecision.level !== 'fact') {
    const levels: GranularityLevel[] = ['fact', 'sentence', 'paragraph', 'section', 'document'];
    const currentIndex = levels.indexOf(initialDecision.level);
    const newLevel = levels[Math.max(currentIndex - 1, 0)];
    const limits = GRANULARITY_TOKEN_LIMITS[newLevel];
    
    return {
      ...initialDecision,
      level: newLevel,
      maxTokens: limits.maxTokens,
      maxChunks: limits.maxChunks,
      reasoning: `${initialDecision.reasoning} [Adapted: decreased due to high density]`,
    };
  }
  
  return initialDecision;
}

/**
 * Chunk content according to granularity level
 */
export function chunkByGranularity(
  content: string,
  level: GranularityLevel
): string[] {
  switch (level) {
    case 'fact':
      // Extract individual facts (lines, list items, key-value pairs)
      return content
        .split(/[\n\r]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length < 200);
    
    case 'sentence':
      // Split by sentence boundaries
      return content
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10);
    
    case 'paragraph':
      // Split by paragraph (double newline or significant whitespace)
      return content
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 50);
    
    case 'section':
      // Split by headers or major breaks
      return content
        .split(/(?=^#{1,3}\s|^[A-Z][^.]*:\s*\n)/m)
        .map(s => s.trim())
        .filter(s => s.length > 100);
    
    case 'document':
      // Return as single chunk or split by major sections
      if (content.length < 10000) {
        return [content];
      }
      return content
        .split(/(?=^#{1,2}\s)/m)
        .map(s => s.trim())
        .filter(s => s.length > 200);
    
    default:
      return [content];
  }
}

/**
 * Score chunks by relevance to query
 */
export function scoreChunks(
  chunks: string[],
  query: string,
  keywords: string[]
): { chunk: string; score: number }[] {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
  
  return chunks.map(chunk => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    
    // Query term matches
    for (const term of queryTerms) {
      if (term.length > 2 && chunkLower.includes(term)) {
        score += 1;
      }
    }
    
    // Keyword matches (weighted higher)
    for (const keyword of keywordSet) {
      if (chunkLower.includes(keyword)) {
        score += 2;
      }
    }
    
    // Normalize by chunk length (prefer concise chunks)
    const lengthPenalty = Math.log(chunk.length + 1) / 10;
    score = score / (1 + lengthPenalty);
    
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Select top chunks within token budget
 */
export function selectChunksWithinBudget(
  scoredChunks: { chunk: string; score: number }[],
  maxTokens: number,
  maxChunks: number
): string[] {
  const selected: string[] = [];
  let totalTokens = 0;
  
  // Rough token estimation (4 chars per token average)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  
  for (const { chunk, score } of scoredChunks) {
    if (selected.length >= maxChunks) break;
    if (score <= 0) break; // Don't include irrelevant chunks
    
    const chunkTokens = estimateTokens(chunk);
    if (totalTokens + chunkTokens <= maxTokens) {
      selected.push(chunk);
      totalTokens += chunkTokens;
    }
  }
  
  return selected;
}

/**
 * Main function: Determine granularity for product enrichment
 */
export async function determineGranularity(
  productTitle: string,
  vendor: string,
  enrichmentType: 'specs' | 'description' | 'pros_cons' | 'faqs' | 'full'
): Promise<GranularityDecision> {
  // Different enrichment types need different granularities
  const typeMapping: Record<string, { level: GranularityLevel; complexity: QueryComplexity }> = {
    specs: { level: 'fact', complexity: 'simple' },
    description: { level: 'paragraph', complexity: 'moderate' },
    pros_cons: { level: 'paragraph', complexity: 'moderate' },
    faqs: { level: 'sentence', complexity: 'simple' },
    full: { level: 'section', complexity: 'complex' },
  };
  
  const mapping = typeMapping[enrichmentType] || typeMapping.full;
  const limits = GRANULARITY_TOKEN_LIMITS[mapping.level];
  
  return {
    level: mapping.level,
    complexity: mapping.complexity,
    maxTokens: limits.maxTokens,
    maxChunks: limits.maxChunks,
    reasoning: `Optimized for ${enrichmentType} enrichment of ${vendor} ${productTitle}`,
    confidence: 0.9,
  };
}

// Helper function
function createGranularityDecision(
  level: GranularityLevel,
  complexity: QueryComplexity,
  reasoning: string
): GranularityDecision {
  const limits = GRANULARITY_TOKEN_LIMITS[level];
  return {
    level,
    complexity,
    maxTokens: limits.maxTokens,
    maxChunks: limits.maxChunks,
    reasoning,
    confidence: 0.75,
  };
}

export { DEFAULT_CONFIG as GRANULARITY_DEFAULT_CONFIG };
