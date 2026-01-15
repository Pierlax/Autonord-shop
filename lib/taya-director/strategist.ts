/**
 * TAYA Director - Strategist Module (The Planner)
 * 
 * Analyzes the catalog and content to identify gaps:
 * - Product categories without blog coverage
 * - Brands without comparison articles
 * - Common problems without solution guides
 * - Products without AI enrichment
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ContentGap,
  EditorialPlan,
  DirectorProduct,
  DirectorArticle,
} from './types';

const MODEL = 'claude-sonnet-4-20250514';

/**
 * Analyze catalog and existing content to find gaps
 */
export async function analyzeContentGaps(
  products: DirectorProduct[],
  articles: DirectorArticle[]
): Promise<ContentGap[]> {
  const gaps: ContentGap[] = [];

  // 1. Find product categories without blog coverage
  const categoryGaps = findCategoryGaps(products, articles);
  gaps.push(...categoryGaps);

  // 2. Find brands without comparison articles
  const brandGaps = findBrandGaps(products, articles);
  gaps.push(...brandGaps);

  // 3. Find products needing enrichment
  const enrichmentGaps = findEnrichmentGaps(products);
  gaps.push(...enrichmentGaps);

  // 4. Use AI to suggest additional content ideas
  const aiSuggestions = await getAISuggestions(products, articles, gaps);
  gaps.push(...aiSuggestions);

  // Sort by priority
  return sortByPriority(gaps);
}

/**
 * Find product categories that don't have blog articles
 */
function findCategoryGaps(
  products: DirectorProduct[],
  articles: DirectorArticle[]
): ContentGap[] {
  const gaps: ContentGap[] = [];

  // Count products per category
  const categoryCount: Record<string, number> = {};
  for (const product of products) {
    const category = product.productType || 'Altro';
    categoryCount[category] = (categoryCount[category] || 0) + 1;
  }

  // Check which categories have articles
  const articleCategories = new Set(
    articles.flatMap(a => a.tags.map(t => t.toLowerCase()))
  );

  // Find gaps
  for (const [category, count] of Object.entries(categoryCount)) {
    const categoryLower = category.toLowerCase();
    const hasArticle = articleCategories.has(categoryLower) ||
      articles.some(a => 
        a.title.toLowerCase().includes(categoryLower) ||
        a.handle.includes(categoryLower.replace(/\s+/g, '-'))
      );

    if (!hasArticle && count >= 3) {
      gaps.push({
        type: 'product_category',
        identifier: category,
        description: `La categoria "${category}" ha ${count} prodotti ma nessun articolo dedicato`,
        priority: count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low',
        suggestedArticleTitle: `Guida Completa ai ${category}: Come Scegliere il Migliore per il Tuo Lavoro`,
        suggestedArticleType: 'guide',
        productCount: count,
      });
    }
  }

  return gaps;
}

/**
 * Find brands that could use comparison articles
 */
function findBrandGaps(
  products: DirectorProduct[],
  articles: DirectorArticle[]
): ContentGap[] {
  const gaps: ContentGap[] = [];

  // Count products per brand
  const brandCount: Record<string, number> = {};
  for (const product of products) {
    const brand = product.vendor || 'Altro';
    brandCount[brand] = (brandCount[brand] || 0) + 1;
  }

  // Get top brands (at least 5 products)
  const topBrands = Object.entries(brandCount)
    .filter(([_, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([brand]) => brand);

  // Check for comparison articles between top brands
  const existingComparisons = articles.filter(a => 
    a.title.toLowerCase().includes(' vs ') ||
    a.handle.includes('-vs-') ||
    a.tags.includes('confronto')
  );

  // Generate potential comparisons
  for (let i = 0; i < topBrands.length; i++) {
    for (let j = i + 1; j < topBrands.length; j++) {
      const brand1 = topBrands[i];
      const brand2 = topBrands[j];

      const hasComparison = existingComparisons.some(a => {
        const titleLower = a.title.toLowerCase();
        return (
          (titleLower.includes(brand1.toLowerCase()) && titleLower.includes(brand2.toLowerCase()))
        );
      });

      if (!hasComparison) {
        gaps.push({
          type: 'comparison',
          identifier: `${brand1}-vs-${brand2}`,
          description: `Manca un confronto tra ${brand1} e ${brand2}`,
          priority: 'medium',
          suggestedArticleTitle: `${brand1} vs ${brand2}: Quale Scegliere? Confronto Onesto per Professionisti`,
          suggestedArticleType: 'comparison',
        });
      }
    }
  }

  return gaps.slice(0, 3); // Limit to top 3 comparison gaps
}

/**
 * Find products that need AI enrichment
 */
function findEnrichmentGaps(products: DirectorProduct[]): ContentGap[] {
  const gaps: ContentGap[] = [];

  // Group non-enriched products by category
  const nonEnrichedByCategory: Record<string, DirectorProduct[]> = {};
  
  for (const product of products) {
    if (!product.hasAiEnhanced) {
      const category = product.productType || 'Altro';
      if (!nonEnrichedByCategory[category]) {
        nonEnrichedByCategory[category] = [];
      }
      nonEnrichedByCategory[category].push(product);
    }
  }

  // Create gaps for categories with many non-enriched products
  for (const [category, categoryProducts] of Object.entries(nonEnrichedByCategory)) {
    if (categoryProducts.length >= 5) {
      gaps.push({
        type: 'product_category',
        identifier: `enrich-${category}`,
        description: `${categoryProducts.length} prodotti in "${category}" non hanno contenuti AI`,
        priority: categoryProducts.length >= 20 ? 'critical' : categoryProducts.length >= 10 ? 'high' : 'medium',
        suggestedArticleTitle: '', // Not an article gap
        suggestedArticleType: 'guide',
        productCount: categoryProducts.length,
      });
    }
  }

  return gaps;
}

/**
 * Use AI to suggest additional content ideas based on catalog analysis
 */
async function getAISuggestions(
  products: DirectorProduct[],
  articles: DirectorArticle[],
  existingGaps: ContentGap[]
): Promise<ContentGap[]> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Build catalog summary
  const categories = [...new Set(products.map(p => p.productType).filter(Boolean))];
  const brands = [...new Set(products.map(p => p.vendor).filter(Boolean))];
  const articleTitles = articles.map(a => a.title);

  const systemPrompt = `Sei un content strategist esperto nella filosofia TAYA (They Ask You Answer).
Analizza il catalogo di un e-commerce di elettroutensili e suggerisci contenuti mancanti.

PRINCIPI TAYA:
- Rispondi alle domande che i clienti fanno davvero
- Parla di prezzi, problemi, confronti, recensioni oneste
- Aiuta il cliente a decidere, anche se significa NON comprare

Rispondi SOLO con un array JSON di suggerimenti:
[
  {
    "type": "problem" | "use_case" | "comparison",
    "title": "Titolo articolo suggerito",
    "description": "Perché questo articolo è importante",
    "priority": "high" | "medium" | "low"
  }
]

Massimo 3 suggerimenti, solo idee ad alto impatto.`;

  const userPrompt = `CATALOGO:
- Categorie: ${categories.join(', ')}
- Brand: ${brands.join(', ')}
- Totale prodotti: ${products.length}

ARTICOLI ESISTENTI:
${articleTitles.join('\n')}

GAP GIÀ IDENTIFICATI:
${existingGaps.slice(0, 5).map(g => `- ${g.description}`).join('\n')}

Suggerisci 2-3 articoli TAYA che mancano e sarebbero utili ai clienti.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return [];
    }

    // Parse JSON array from response
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const suggestions = JSON.parse(jsonMatch[0]);

    return suggestions.map((s: any) => ({
      type: s.type || 'use_case',
      identifier: s.title.toLowerCase().replace(/\s+/g, '-').slice(0, 50),
      description: s.description,
      priority: s.priority || 'medium',
      suggestedArticleTitle: s.title,
      suggestedArticleType: s.type === 'problem' ? 'problem_solution' : s.type === 'comparison' ? 'comparison' : 'guide',
    }));

  } catch (error) {
    console.error('Error getting AI suggestions:', error);
    return [];
  }
}

/**
 * Sort gaps by priority
 */
function sortByPriority(gaps: ContentGap[]): ContentGap[] {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return gaps.sort((a, b) => 
    priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

/**
 * Generate a complete editorial plan
 */
export async function generateEditorialPlan(
  products: DirectorProduct[],
  articles: DirectorArticle[]
): Promise<EditorialPlan> {
  // Analyze gaps
  const gaps = await analyzeContentGaps(products, articles);

  // Find products needing enrichment
  const productsNeedingEnrichment = products
    .filter(p => !p.hasAiEnhanced)
    .map(p => p.id);

  // Find products needing re-enrichment (placeholder for supervisor results)
  const productsNeedingReEnrichment: string[] = [];

  // Get next article to write (highest priority article gap)
  const articleGaps = gaps.filter(g => 
    g.suggestedArticleTitle && 
    g.type !== 'product_category' || !g.identifier.startsWith('enrich-')
  );
  const nextArticleToWrite = articleGaps.length > 0 ? articleGaps[0] : null;

  return {
    generatedAt: new Date().toISOString(),
    gaps,
    nextArticleToWrite,
    productsNeedingEnrichment: productsNeedingEnrichment.slice(0, 50), // Limit
    productsNeedingReEnrichment,
  };
}

/**
 * Get a summary of the editorial plan for logging
 */
export function getEditorialPlanSummary(plan: EditorialPlan): string {
  const lines: string[] = [
    `📊 Piano Editoriale generato: ${plan.generatedAt}`,
    ``,
    `📝 Gap identificati: ${plan.gaps.length}`,
    ...plan.gaps.slice(0, 5).map(g => `  - [${g.priority.toUpperCase()}] ${g.description}`),
    ``,
    `📦 Prodotti da arricchire: ${plan.productsNeedingEnrichment.length}`,
    `🔄 Prodotti da ri-arricchire: ${plan.productsNeedingReEnrichment.length}`,
    ``,
  ];

  if (plan.nextArticleToWrite) {
    lines.push(`✍️ Prossimo articolo suggerito:`);
    lines.push(`   "${plan.nextArticleToWrite.suggestedArticleTitle}"`);
    lines.push(`   Tipo: ${plan.nextArticleToWrite.suggestedArticleType}`);
  }

  return lines.join('\n');
}
