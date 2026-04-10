/**
 * Blog Researcher - Article Template
 * 
 * Defines the mandatory structure for all TAYA articles
 * with templates for different article types
 */

import { MANDATORY_ARTICLE_SECTIONS, ArticleSection } from './sources';

// =============================================================================
// TYPES
// =============================================================================

export type ArticleType = 
  | 'comparison'      // Product vs Product
  | 'review'          // Single product deep dive
  | 'problem'         // Common problems and solutions
  | 'buying-guide'    // Category buying guide
  | 'how-to';         // Tutorial/guide

export interface TechnicalSpec {
  name: string;
  product1Value: string;
  product2Value?: string;
  unit?: string;
  winner?: 'product1' | 'product2' | 'tie';
  note?: string;
}

export interface ArticleData {
  type: ArticleType;
  title: string;
  titleIT: string;
  slug: string;
  metaDescription: string;
  metaDescriptionIT: string;
  
  // Products involved
  products: string[];
  brands: string[];
  category: string;
  
  // Research data
  technicalSpecs: TechnicalSpec[];
  forumQuotes: {
    quote: string;
    source: string;
    url: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }[];
  
  // Content sections
  sections: {
    id: string;
    title: string;
    content: string;
    htmlContent?: string;
  }[];
  
  // Verdict
  verdict: {
    winner?: string;
    recommendation: string;
    recommendationIT: string;
    idealFor: string[];
    notIdealFor: string[];
  };
  
  // SEO
  keywords: string[];
  readingTime: number;
  
  // Sources
  sources: {
    name: string;
    url: string;
    dataUsed: string;
  }[];
}

// =============================================================================
// SPEC TABLE TEMPLATES
// =============================================================================

/**
 * Generate HTML for a comparison table
 */
export function generateSpecTable(
  specs: TechnicalSpec[],
  product1Name: string,
  product2Name?: string
): string {
  const isComparison = !!product2Name;
  
  let html = `<div class="overflow-x-auto my-8">
<table class="min-w-full bg-zinc-900 rounded-lg overflow-hidden">
  <thead class="bg-zinc-800">
    <tr>
      <th class="px-6 py-4 text-left text-sm font-semibold text-white">Specifica</th>
      <th class="px-6 py-4 text-left text-sm font-semibold text-amber-400">${product1Name}</th>`;
  
  if (isComparison) {
    html += `
      <th class="px-6 py-4 text-left text-sm font-semibold text-amber-400">${product2Name}</th>`;
  }
  
  html += `
    </tr>
  </thead>
  <tbody class="divide-y divide-zinc-700">`;
  
  for (const spec of specs) {
    const winnerClass1 = spec.winner === 'product1' ? 'text-green-400 font-semibold' : 'text-zinc-300';
    const winnerClass2 = spec.winner === 'product2' ? 'text-green-400 font-semibold' : 'text-zinc-300';
    
    html += `
    <tr class="hover:bg-zinc-800/50">
      <td class="px-6 py-4 text-sm text-zinc-400">${spec.name}${spec.unit ? ` (${spec.unit})` : ''}</td>
      <td class="px-6 py-4 text-sm ${winnerClass1}">${spec.product1Value}${spec.winner === 'product1' ? ' ✓' : ''}</td>`;
    
    if (isComparison && spec.product2Value) {
      html += `
      <td class="px-6 py-4 text-sm ${winnerClass2}">${spec.product2Value}${spec.winner === 'product2' ? ' ✓' : ''}</td>`;
    }
    
    html += `
    </tr>`;
  }
  
  html += `
  </tbody>
</table>
</div>`;
  
  if (specs.some(s => s.note)) {
    html += `
<p class="text-sm text-zinc-500 mt-2">
  ${specs.filter(s => s.note).map(s => `* ${s.note}`).join('<br>')}
</p>`;
  }
  
  return html;
}

/**
 * Generate HTML for forum quotes section
 */
export function generateForumQuotesSection(
  quotes: ArticleData['forumQuotes'],
  sectionTitle: string = 'Cosa Dicono nei Cantieri'
): string {
  if (quotes.length === 0) {
    return '';
  }
  
  let html = `<section class="my-12">
  <h2 class="text-2xl font-bold text-white mb-6">${sectionTitle}</h2>
  <div class="space-y-6">`;
  
  for (const quote of quotes) {
    const sentimentColor = {
      positive: 'border-green-500',
      negative: 'border-red-500',
      neutral: 'border-zinc-500',
    }[quote.sentiment];
    
    const sentimentIcon = {
      positive: '👍',
      negative: '⚠️',
      neutral: '💬',
    }[quote.sentiment];
    
    html += `
    <blockquote class="border-l-4 ${sentimentColor} pl-4 py-2 bg-zinc-900/50 rounded-r-lg">
      <p class="text-zinc-300 italic">"${quote.quote}"</p>
      <footer class="mt-2 text-sm text-zinc-500">
        ${sentimentIcon} — <a href="${quote.url}" target="_blank" rel="noopener" class="text-amber-400 hover:underline">${quote.source}</a>
      </footer>
    </blockquote>`;
  }
  
  html += `
  </div>
</section>`;
  
  return html;
}

/**
 * Generate HTML for verdict section
 */
export function generateVerdictSection(verdict: ArticleData['verdict']): string {
  let html = `<section class="my-12 bg-gradient-to-r from-amber-900/20 to-zinc-900 rounded-xl p-8 border border-amber-500/30">
  <h2 class="text-2xl font-bold text-amber-400 mb-4">🎯 Il Verdetto di Autonord</h2>
  
  <p class="text-lg text-white mb-6">${verdict.recommendationIT}</p>`;
  
  if (verdict.winner) {
    html += `
  <div class="inline-block bg-amber-500 text-black font-bold px-4 py-2 rounded-lg mb-6">
    VINCITORE: ${verdict.winner}
  </div>`;
  }
  
  html += `
  <div class="grid md:grid-cols-2 gap-6 mt-6">
    <div>
      <h3 class="text-lg font-semibold text-green-400 mb-3">✅ Ideale per:</h3>
      <ul class="space-y-2">
        ${verdict.idealFor.map(item => `<li class="text-zinc-300">• ${item}</li>`).join('\n        ')}
      </ul>
    </div>
    <div>
      <h3 class="text-lg font-semibold text-red-400 mb-3">❌ Non ideale per:</h3>
      <ul class="space-y-2">
        ${verdict.notIdealFor.map(item => `<li class="text-zinc-300">• ${item}</li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;
  
  return html;
}

/**
 * Generate HTML for sources section
 */
export function generateSourcesSection(sources: ArticleData['sources']): string {
  if (sources.length === 0) {
    return '';
  }
  
  let html = `<section class="my-12 border-t border-zinc-700 pt-8">
  <h3 class="text-lg font-semibold text-zinc-400 mb-4">📚 Fonti</h3>
  <ul class="space-y-2 text-sm text-zinc-500">`;
  
  for (const source of sources) {
    html += `
    <li>
      <a href="${source.url}" target="_blank" rel="noopener" class="text-amber-400 hover:underline">${source.name}</a>
      — ${source.dataUsed}
    </li>`;
  }
  
  html += `
  </ul>
</section>`;
  
  return html;
}

// =============================================================================
// ARTICLE TEMPLATES
// =============================================================================

/**
 * Template for comparison articles (Product A vs Product B)
 */
export const COMPARISON_ARTICLE_TEMPLATE = `
# {title}

{metaDescription}

---

## TL;DR - Per Chi Ha Fretta

{tldr}

---

## Specifiche Tecniche a Confronto

{specTable}

*Dati tecnici da: {specSources}*

---

## Cosa Dicono nei Cantieri

{forumQuotes}

---

## Pro e Contro

### {product1}

**Pro:**
{product1Pros}

**Contro:**
{product1Cons}

### {product2}

**Pro:**
{product2Pros}

**Contro:**
{product2Cons}

---

## Il Verdetto di Autonord

{verdict}

---

## Domande Frequenti

{faq}

---

## Fonti

{sources}
`;

/**
 * Template for single product review
 */
export const REVIEW_ARTICLE_TEMPLATE = `
# {title}

{metaDescription}

---

## In Breve

{summary}

---

## Specifiche Tecniche

{specTable}

*Dati da: {specSources}*

---

## Cosa Dicono nei Cantieri

{forumQuotes}

---

## Pro e Contro Onesti

**Perché Comprarlo:**
{pros}

**Perché NON Comprarlo:**
{cons}

---

## Problemi Comuni e Soluzioni

{commonProblems}

---

## Il Verdetto di Autonord

{verdict}

---

## Domande Frequenti

{faq}

---

## Fonti

{sources}
`;

/**
 * Template for problem/troubleshooting articles
 */
export const PROBLEM_ARTICLE_TEMPLATE = `
# {title}

{metaDescription}

---

## Il Problema in Breve

{problemSummary}

---

## Cosa Dicono gli Utenti

{forumQuotes}

---

## Cause Comuni

{causes}

---

## Soluzioni Testate

{solutions}

---

## Quando Chiamare l'Assistenza

{whenToCallSupport}

---

## Il Parere di Autonord

{verdict}

---

## Domande Frequenti

{faq}

---

## Fonti

{sources}
`;

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that an article has all mandatory sections
 */
export function validateArticle(article: ArticleData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check mandatory sections
  for (const required of MANDATORY_ARTICLE_SECTIONS.filter(s => s.required)) {
    const section = article.sections.find(s => s.id === required.id);
    
    if (!section) {
      errors.push(`Sezione obbligatoria mancante: ${required.titleIT}`);
    } else if (required.minWords > 0) {
      const wordCount = section.content.split(/\s+/).length;
      if (wordCount < required.minWords) {
        warnings.push(`Sezione "${required.titleIT}" troppo corta: ${wordCount}/${required.minWords} parole`);
      }
    }
  }
  
  // Check technical specs
  if (article.technicalSpecs.length === 0) {
    errors.push('Tabella specifiche tecniche mancante');
  } else if (article.technicalSpecs.length < 5) {
    warnings.push('Tabella specifiche con pochi dati (< 5 righe)');
  }
  
  // Check forum quotes
  if (article.forumQuotes.length === 0) {
    errors.push('Sezione "Cosa dicono nei cantieri" senza citazioni');
  } else if (article.forumQuotes.length < 3) {
    warnings.push('Poche citazioni dai forum (< 3)');
  }
  
  // Check verdict
  if (!article.verdict.recommendationIT) {
    errors.push('Verdetto mancante');
  }
  if (article.verdict.idealFor.length === 0) {
    warnings.push('Nessun "Ideale per" specificato');
  }
  if (article.verdict.notIdealFor.length === 0) {
    warnings.push('Nessun "Non ideale per" specificato');
  }
  
  // Check sources
  if (article.sources.length === 0) {
    errors.push('Nessuna fonte citata');
  }
  
  // Check for whitelist sources
  const whitelistDomains = ['protoolreviews.com', 'toolguyd.com', 'tooltalk.com'];
  const hasWhitelistSource = article.sources.some(s => 
    whitelistDomains.some(d => s.url.includes(d))
  );
  if (!hasWhitelistSource) {
    warnings.push('Nessuna fonte dalla whitelist (protoolreviews, toolguyd, tooltalk)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate reading time for an article
 */
export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Generate SEO-friendly slug from title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
