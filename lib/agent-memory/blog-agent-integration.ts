/**
 * AgeMem Integration for Blog Agent (Agente 2)
 * 
 * This module provides easy-to-use functions for the Blog Agent
 * to leave notes and insights for the Product Agent.
 * 
 * Usage Pattern:
 * 1. During blog research, discover insights about brands/products
 * 2. Call `leaveNoteForProductAgent()` to share insights
 * 3. Product Agent will see these notes when generating content
 */

import {
  addMemory,
  searchMemory,
  leaveNoteForAgent,
  type MemoryEntry,
  type MemoryType
} from './agemem-core';

// ============================================================================
// TYPES
// ============================================================================

export interface BlogInsight {
  title: string;
  content: string;
  targetBrands?: string[];
  targetCategories?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

export interface CompetitorMention {
  competitorName: string;
  context: string;
  recommendation: 'avoid' | 'mention_carefully' | 'ok_to_mention';
  targetBrands?: string[];
}

// ============================================================================
// MAIN FUNCTIONS FOR BLOG AGENT
// ============================================================================

/**
 * Leave a note for the Product Agent
 * 
 * Use this when the Blog Agent discovers something that the Product Agent
 * should know when generating product descriptions.
 * 
 * @example
 * ```typescript
 * leaveNoteForProductAgent({
 *   title: "Milwaukee preferisce tono tecnico",
 *   content: "Dalle analisi dei contenuti Milwaukee, il brand preferisce un tono molto tecnico e professionale. Evitare linguaggio troppo commerciale.",
 *   targetBrands: ["Milwaukee"],
 *   priority: "high"
 * });
 * ```
 */
export function leaveNoteForProductAgent(insight: BlogInsight): MemoryEntry {
  console.log(`[AgeMem-BlogAgent] Leaving note for Product Agent: "${insight.title}"`);
  
  return leaveNoteForAgent('blog_agent', {
    title: insight.title,
    content: insight.content,
    targetBrands: insight.targetBrands,
    targetCategories: insight.targetCategories,
    priority: insight.priority || 'medium'
  });
}

/**
 * Report a competitor that should not be mentioned
 * 
 * Use this when the Blog Agent identifies competitors that should
 * be avoided in product descriptions.
 * 
 * @example
 * ```typescript
 * reportCompetitorToAvoid({
 *   competitorName: "BrandX",
 *   context: "Competitor diretto di Milwaukee, non menzionare nei contenuti Milwaukee",
 *   recommendation: "avoid",
 *   targetBrands: ["Milwaukee"]
 * });
 * ```
 */
export function reportCompetitorToAvoid(mention: CompetitorMention): MemoryEntry {
  const priority = mention.recommendation === 'avoid' ? 'critical' : 
                   mention.recommendation === 'mention_carefully' ? 'high' : 'medium';
  
  const actionText = mention.recommendation === 'avoid' 
    ? 'NON MENZIONARE MAI' 
    : mention.recommendation === 'mention_carefully'
    ? 'Menzionare con cautela'
    : 'OK da menzionare';
  
  console.log(`[AgeMem-BlogAgent] Reporting competitor: ${mention.competitorName} (${actionText})`);
  
  return addMemory({
    type: 'business_rule',
    source: 'blog_agent',
    title: `Competitor: ${mention.competitorName} - ${actionText}`,
    content: `${actionText}: ${mention.competitorName}. ${mention.context}`,
    targetBrands: mention.targetBrands,
    priority,
    keywords: [mention.competitorName.toLowerCase(), 'competitor', 'concorrente']
  });
}

/**
 * Share a brand insight discovered during blog research
 * 
 * Use this when the Blog Agent learns something about a brand's
 * preferences, style, or positioning.
 */
export function shareBrandInsight(insight: {
  brand: string;
  insightType: 'tone' | 'positioning' | 'target_audience' | 'key_features' | 'avoid';
  content: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}): MemoryEntry {
  const typeLabels = {
    tone: 'Tono di comunicazione',
    positioning: 'Posizionamento',
    target_audience: 'Target audience',
    key_features: 'Caratteristiche chiave',
    avoid: 'Da evitare'
  };
  
  console.log(`[AgeMem-BlogAgent] Sharing brand insight: ${insight.brand} - ${typeLabels[insight.insightType]}`);
  
  return addMemory({
    type: 'brand_note',
    source: 'blog_agent',
    title: `${insight.brand}: ${typeLabels[insight.insightType]}`,
    content: insight.content,
    targetBrands: [insight.brand],
    priority: insight.priority || 'medium',
    keywords: [insight.brand.toLowerCase(), insight.insightType]
  });
}

/**
 * Share a category guideline discovered during blog research
 * 
 * Use this when the Blog Agent learns something about how to
 * write content for a specific product category.
 */
export function shareCategoryGuideline(guideline: {
  category: string;
  guidelineType: 'structure' | 'key_specs' | 'common_questions' | 'pain_points' | 'selling_points';
  content: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}): MemoryEntry {
  const typeLabels = {
    structure: 'Struttura contenuto',
    key_specs: 'Specifiche chiave',
    common_questions: 'Domande frequenti',
    pain_points: 'Pain points clienti',
    selling_points: 'Punti di forza'
  };
  
  console.log(`[AgeMem-BlogAgent] Sharing category guideline: ${guideline.category} - ${typeLabels[guideline.guidelineType]}`);
  
  return addMemory({
    type: 'content_guideline',
    source: 'blog_agent',
    title: `${guideline.category}: ${typeLabels[guideline.guidelineType]}`,
    content: guideline.content,
    targetCategories: [guideline.category],
    priority: guideline.priority || 'medium',
    keywords: [guideline.category.toLowerCase(), guideline.guidelineType]
  });
}

/**
 * Share a product-specific insight
 * 
 * Use this when the Blog Agent discovers something specific about
 * a product that the Product Agent should know.
 */
export function shareProductInsight(insight: {
  productHandle: string;
  productTitle: string;
  insightType: 'known_issue' | 'user_feedback' | 'comparison_note' | 'highlight';
  content: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}): MemoryEntry {
  const typeLabels = {
    known_issue: 'Problema noto',
    user_feedback: 'Feedback utenti',
    comparison_note: 'Nota comparativa',
    highlight: 'Da evidenziare'
  };
  
  console.log(`[AgeMem-BlogAgent] Sharing product insight: ${insight.productTitle} - ${typeLabels[insight.insightType]}`);
  
  return addMemory({
    type: 'product_insight',
    source: 'blog_agent',
    title: `${insight.productTitle}: ${typeLabels[insight.insightType]}`,
    content: insight.content,
    targetProducts: [insight.productHandle],
    priority: insight.priority || 'medium',
    keywords: [insight.productHandle, insight.insightType]
  });
}

// ============================================================================
// QUERY FUNCTIONS FOR BLOG AGENT
// ============================================================================

/**
 * Get existing notes about a brand before writing blog content
 */
export function getExistingBrandNotes(brand: string): MemoryEntry[] {
  const results = searchMemory({
    types: ['brand_note', 'business_rule', 'cross_agent_note'],
    brands: [brand],
    limit: 10
  });
  
  return results.map(r => r.entry);
}

/**
 * Get existing notes about a category before writing blog content
 */
export function getExistingCategoryNotes(category: string): MemoryEntry[] {
  const results = searchMemory({
    types: ['content_guideline', 'cross_agent_note'],
    categories: [category],
    limit: 10
  });
  
  return results.map(r => r.entry);
}

/**
 * Check if a competitor has already been flagged
 */
export function isCompetitorFlagged(competitorName: string): {
  flagged: boolean;
  recommendation?: 'avoid' | 'mention_carefully' | 'ok_to_mention';
  entry?: MemoryEntry;
} {
  const results = searchMemory({
    query: competitorName,
    types: ['business_rule'],
    keywords: ['competitor', 'concorrente'],
    limit: 1
  });
  
  if (results.length === 0) {
    return { flagged: false };
  }
  
  const entry = results[0].entry;
  const content = entry.content.toLowerCase();
  
  let recommendation: 'avoid' | 'mention_carefully' | 'ok_to_mention' = 'ok_to_mention';
  if (content.includes('non menzionare') || content.includes('avoid')) {
    recommendation = 'avoid';
  } else if (content.includes('cautela') || content.includes('carefully')) {
    recommendation = 'mention_carefully';
  }
  
  return {
    flagged: true,
    recommendation,
    entry
  };
}
