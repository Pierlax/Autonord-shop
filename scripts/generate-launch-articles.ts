/**
 * Generate Launch Articles Script
 * 
 * Generates the 5 launch articles for Autonord blog
 * using the enhanced Blog Researcher with whitelist sources
 */

import { generateLaunchArticles, EnhancedArticleDraft } from '../lib/blog-researcher';
import * as fs from 'fs';
import * as path from 'path';

// Define the 5 launch articles
const LAUNCH_ARTICLES: { topic: string; type: 'comparison' | 'problem' | 'review' | 'buying-guide'; targetAudience: string; tayaCategory: 'pricing' | 'problems' | 'comparisons' | 'reviews' | 'best' }[] = [
  {
    topic: 'Milwaukee M18 FUEL vs Makita 40V XGT - Avvitatori a impulsi',
    type: 'comparison',
    targetAudience: 'Elettricisti e installatori professionisti che devono scegliere tra i due ecosistemi',
    tayaCategory: 'comparisons',
  },
  {
    topic: 'DeWalt vs Milwaukee - Trapani a percussione',
    type: 'comparison',
    targetAudience: 'Muratori e carpentieri che lavorano su cantieri edili',
    tayaCategory: 'comparisons',
  },
  {
    topic: 'Batterie Milwaukee che si scaricano velocemente - Cause e soluzioni',
    type: 'problem',
    targetAudience: 'Professionisti Milwaukee che hanno problemi di autonomia',
    tayaCategory: 'problems',
  },
  {
    topic: 'Hilti TE 30-A36 - Vale il prezzo premium?',
    type: 'review',
    targetAudience: 'Professionisti che considerano di investire in attrezzatura Hilti',
    tayaCategory: 'reviews',
  },
  {
    topic: 'Come scegliere il miglior avvitatore per elettricisti',
    type: 'buying-guide',
    targetAudience: 'Elettricisti che devono acquistare il primo avvitatore professionale',
    tayaCategory: 'best',
  },
];

async function main() {
  console.log('='.repeat(60));
  console.log('AUTONORD - GENERAZIONE PACCHETTO LANCIO');
  console.log('='.repeat(60));
  console.log(`\nGenerazione di ${LAUNCH_ARTICLES.length} articoli...\n`);
  
  const startTime = Date.now();
  
  try {
    const articles = await generateLaunchArticles(LAUNCH_ARTICLES);
    
    // Save articles to files
    const outputDir = path.join(__dirname, '../content/launch-articles');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    for (const article of articles) {
      // Save HTML version
      const htmlPath = path.join(outputDir, `${article.slug}.html`);
      fs.writeFileSync(htmlPath, article.htmlContent || article.content);
      
      // Save JSON metadata
      const jsonPath = path.join(outputDir, `${article.slug}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify({
        title: article.title,
        titleIT: article.titleIT,
        slug: article.slug,
        metaDescription: article.metaDescription,
        excerpt: article.excerpt,
        tags: article.tags,
        category: article.category,
        estimatedReadTime: article.estimatedReadTime,
        articleType: article.articleType,
        products: article.products,
        brands: article.brands,
        sources: article.sources,
        forumQuotes: article.forumQuotes,
        technicalSpecs: article.technicalSpecs,
        validation: article.validation,
        generatedAt: new Date().toISOString(),
      }, null, 2));
      
      console.log(`\n✓ Saved: ${article.slug}`);
    }
    
    // Generate summary report
    const summaryPath = path.join(outputDir, 'SUMMARY.md');
    const summary = generateSummaryReport(articles);
    fs.writeFileSync(summaryPath, summary);
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n' + '='.repeat(60));
    console.log('GENERAZIONE COMPLETATA');
    console.log('='.repeat(60));
    console.log(`\nArticoli generati: ${articles.length}/${LAUNCH_ARTICLES.length}`);
    console.log(`Tempo totale: ${duration} minuti`);
    console.log(`Output: ${outputDir}`);
    
    // Validation summary
    const validCount = articles.filter(a => a.validation.valid).length;
    const warningCount = articles.reduce((sum, a) => sum + a.validation.warnings.length, 0);
    
    console.log(`\nValidazione:`);
    console.log(`  - Articoli validi: ${validCount}/${articles.length}`);
    console.log(`  - Warning totali: ${warningCount}`);
    
    if (validCount < articles.length) {
      console.log('\n⚠️  Alcuni articoli hanno errori di validazione. Controlla SUMMARY.md');
    }
    
  } catch (error) {
    console.error('\n❌ Errore durante la generazione:', error);
    process.exit(1);
  }
}

function generateSummaryReport(articles: EnhancedArticleDraft[]): string {
  let report = `# Pacchetto Lancio - Report Generazione

**Data:** ${new Date().toLocaleDateString('it-IT', { dateStyle: 'full' })}
**Articoli generati:** ${articles.length}

---

## Articoli

`;

  for (const article of articles) {
    report += `### ${article.titleIT || article.title}

- **Slug:** ${article.slug}
- **Tipo:** ${article.articleType}
- **Categoria:** ${article.category}
- **Tempo lettura:** ${article.estimatedReadTime} min
- **Prodotti:** ${article.products.join(', ')}
- **Brand:** ${article.brands.join(', ')}

**Fonti utilizzate:**
${article.sources.map(s => `- ${s.name}: ${s.dataUsed}`).join('\n')}

**Citazioni forum:** ${article.forumQuotes.length}
**Specifiche tecniche:** ${article.technicalSpecs.length}

**Validazione:** ${article.validation.valid ? '✅ Valido' : '❌ Errori'}
${article.validation.errors.length > 0 ? `- Errori: ${article.validation.errors.join(', ')}` : ''}
${article.validation.warnings.length > 0 ? `- Warning: ${article.validation.warnings.join(', ')}` : ''}

---

`;
  }

  report += `## Prossimi Passi

1. Revisione manuale degli articoli
2. Upload su Shopify Blog
3. Ottimizzazione immagini
4. Pubblicazione

---

*Generato automaticamente da Autonord Blog Researcher v2*
`;

  return report;
}

// Run
main().catch(console.error);
