/**
 * Blog Researcher - Enhanced Article Drafting Module (V2)
 * 
 * Upgraded with:
 * - Whitelist source integration
 * - Forum sentiment analysis
 * - Mandatory article structure
 * - Technical spec tables
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.blog;
import { TopicAnalysis } from './analysis';
import { ForumResearchResult, researchProductSentiment, researchComparisonSentiment } from './sentiment';
import { 
  WHITELIST_SOURCES, 
  MANDATORY_ARTICLE_SECTIONS,
  getWhitelistDomains 
} from './sources';
import {
  ArticleData,
  ArticleType,
  TechnicalSpec,
  generateSpecTable,
  generateForumQuotesSection,
  generateVerdictSection,
  generateSourcesSection,
  validateArticle,
  calculateReadingTime,
  generateSlug,
} from './article-template';
import {
  AGENT_2_BLOG_DIRECTIVE,
  containsBannedPhrases,
  checkKrugCompliance,
} from '../core-philosophy';

// =============================================================================
// TYPES
// =============================================================================

export interface EnhancedArticleDraft {
  title: string;
  titleIT: string;
  slug: string;
  metaDescription: string;
  content: string;
  htmlContent: string;
  excerpt: string;
  tags: string[];
  category: string;
  estimatedReadTime: number;
  
  // Enhanced metadata
  articleType: ArticleType;
  products: string[];
  brands: string[];
  sources: { name: string; url: string; dataUsed: string }[];
  forumQuotes: ArticleData['forumQuotes'];
  technicalSpecs: TechnicalSpec[];
  
  // Validation
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

// =============================================================================
// WHITELIST SOURCE RESEARCH
// =============================================================================

/**
 * Search whitelist sources for technical data.
 *
 * NOTE (P0 fix): The previous implementation asked Gemini to "generate realistic specs"
 * from known sources — this was hallucination-by-design (invented numbers presented as
 * real measurements). Real scraping of protoolreviews.com / toolguyd.com / tooltalk.com
 * is not yet implemented. Until it is, we return empty arrays so the article is written
 * only from actual forum quotes and real RAG data, with no fabricated tables.
 */
/**
 * D26 fix: Search whitelist sources for real technical specs via web search.
 *
 * Previously returned empty arrays (P0 fix to prevent hallucination).
 * Now uses the existing search-client + cached search to find real spec pages
 * on whitelist domains, then extracts key-value specs from the snippets.
 * No LLM fabrication — only data that appears in actual search results.
 */
async function searchWhitelistSources(
  productName: string
): Promise<{ specs: TechnicalSpec[]; sources: ArticleData['sources'] }> {
  try {
    const { performWebSearch } = await import('@/lib/shopify/search-client');
    const whitelistDomains = getWhitelistDomains();
    if (whitelistDomains.length === 0) return { specs: [], sources: [] };

    const results = await performWebSearch(
      `${productName} specifiche tecniche scheda tecnica`,
      whitelistDomains.slice(0, 5),
      { maxResults: 5 }
    );

    if (results.length === 0) return { specs: [], sources: [] };

    // Extract key-value specs from snippets (only real data from search results)
    const specs: TechnicalSpec[] = [];
    const sources: ArticleData['sources'] = [];

    for (const r of results) {
      sources.push({ name: r.domain, url: r.link, dataUsed: 'specs' });

      // Extract "key: value" or "key = value" patterns from snippets
      const kvRegex = /([A-Za-zÀ-ú\s]{3,25})[:=]\s*(\d+[.,]?\d*\s*[A-Za-zμ°²³/]+)/g;
      let kv: RegExpExecArray | null;
      while ((kv = kvRegex.exec(r.snippet)) !== null) {
        specs.push({
          name: kv[1].trim(),
          product1Value: kv[2].trim(),
          note: `Fonte: ${r.domain}`,
        });
      }
    }

    if (specs.length > 0) {
      log.info(`[DraftingV2] D26: Extracted ${specs.length} real specs from ${results.length} whitelist results`);
    }
    return { specs, sources };
  } catch (err) {
    log.warn(`[DraftingV2] D26: searchWhitelistSources failed (non-blocking): ${err}`);
    return { specs: [], sources: [] };
  }
}

/**
 * Search whitelist sources for comparison data.
 *
 * NOTE (P0 fix): The previous implementation asked Gemini to fabricate comparative
 * tables with winner/loser decisions — hallucinated data presented with source citations
 * to non-existent URLs. Real scraping is not yet implemented.
 * Until it is, we return empty arrays so comparisons are written only from real data.
 */
/**
 * D26 fix: Search for real comparison specs via web search.
 * Searches for both products on whitelist domains and merges the specs.
 */
async function searchComparisonSpecs(
  product1: string,
  product2: string
): Promise<{ specs: TechnicalSpec[]; sources: ArticleData['sources'] }> {
  const [r1, r2] = await Promise.all([
    searchWhitelistSources(product1),
    searchWhitelistSources(product2),
  ]);

  // Tag specs with their product for comparison tables
  const specs = [
    ...r1.specs.map(s => ({ ...s, name: `${product1} — ${s.name}` })),
    ...r2.specs.map(s => ({ ...s, name: `${product2} — ${s.name}` })),
  ];
  const sources = [...r1.sources, ...r2.sources];

  // Deduplicate sources by URL
  const seenUrls = new Set<string>();
  const uniqueSources = sources.filter(s => {
    if (seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });

  return { specs, sources: uniqueSources };
}

// =============================================================================
// ENHANCED ARTICLE GENERATION
// =============================================================================

// The Pragmatic Truth Philosophy for Blog Researcher
const ENHANCED_DRAFTING_PROMPT = `${AGENT_2_BLOG_DIRECTIVE}

---

## PERSONA: REDAZIONE AUTONORD

Siete la Redazione Tecnica di Autonord Service, un team di esperti con oltre 40 anni di esperienza combinata nel settore degli elettroutensili professionali. Scrivete per il blog di Autonord Service, rivenditore a Genova. Usate il "noi" editoriale per rappresentare l'esperienza collettiva del team.

## REGOLE TAYA POTENZIATE

1. **Onestà radicale**: Ammetti sempre i difetti. Se un prodotto ha problemi noti, parlane per primo.
2. **Dati concreti**: Usa numeri specifici, mai aggettivi vaghi ("potente" → "135Nm di coppia").
3. **Opinioni chiare**: Prendi posizione. "Secondo me..." non è debolezza, è autenticità.
4. **Citazioni reali**: Usa le opinioni dei forum per dare voce ai professionisti.
5. **Verdetto netto**: Mai "dipende". Dì chiaramente per chi è e per chi NON è.
6. **Confronti scomodi**: Confronta SEMPRE con competitor, anche se scomodo.
7. **Prezzi reali**: Parla di prezzi concreti, non "contattaci per un preventivo".

## REGOLE KRUG PER ARTICOLI

1. **Risposta immediata**: Nei primi 100 parole, rispondi alla domanda del titolo
2. **Tabella comparativa**: Scannable in 5 secondi
3. **Gerarchia visiva**: H2 per sezioni, H3 per sottosezioni, grassetti per key points
4. **Frasi corte**: Max 20 parole per frase
5. **Paragrafi brevi**: Max 3 frasi per paragrafo

## REGOLE JTBD PER ARTICOLI

1. **Inquadra nel lavoro**: "Se sei un idraulico che fa 10 installazioni/settimana..."
2. **Calcola ROI**: "Si ripaga in 3 mesi se..." quando possibile
3. **Specifica mestiere**: Non "professionisti" ma "elettricisti, cartongessisti, idraulici"

## STRUTTURA OBBLIGATORIA

L'articolo DEVE contenere queste sezioni:

1. **Introduzione** - Hook che parte dal PROBLEMA, non dal prodotto
2. **Tabella Specifiche Tecniche** - Dati numerici da fonti autorevoli
3. **Cosa Dicono nei Cantieri** - Citazioni reali dai forum (fornite sotto)
4. **Pro e Contro** - Lista onesta con almeno 3 contro reali
5. **Il Verdetto di Autonord** - Opinione chiara e sbilanciata

## FONTI DA CITARE

Usa ESPLICITAMENTE queste fonti per i dati tecnici:
- Pro Tool Reviews (protoolreviews.com) - benchmark e test
- ToolGuyd (toolguyd.com) - analisi feature
- ToolTalk (tooltalk.com) - opinioni utenti

## STILE

- Italiano naturale, come parli a un collega
- Frasi varie: alterna brevi e articolate
- Esempi concreti: "L'elettricista che fa 50 punti luce al giorno"
- Mai: "In questo articolo...", "In conclusione...", superlativi vuoti

## DATI ARTICOLO

**Tipo:** {articleType}
**Prodotti:** {products}
**Target:** {targetAudience}
**Categoria TAYA:** {tayaCategory}

**Specifiche Tecniche (da fonti whitelist):**
{technicalSpecs}

**Citazioni dai Forum:**
{forumQuotes}

**Problemi Comuni Riportati:**
{commonProblems}

**Fonti Disponibili:**
{sources}

---

Scrivi l'articolo completo in HTML. Rispondi SOLO con JSON valido:
{
  "title": "Titolo SEO (50-60 char)",
  "titleIT": "Titolo italiano completo",
  "metaDescription": "Meta description (150-160 char)",
  "content": "<article>...HTML completo con tutte le sezioni obbligatorie...</article>",
  "excerpt": "Riassunto 2-3 frasi",
  "tags": ["tag1", "tag2"],
  "category": "Confronti|Recensioni|Guide|FAQ",
  "verdict": {
    "winner": "nome prodotto vincitore (se confronto)",
    "recommendation": "Raccomandazione chiara in inglese",
    "recommendationIT": "Raccomandazione chiara in italiano",
    "idealFor": ["profilo ideale 1", "profilo ideale 2"],
    "notIdealFor": ["profilo non ideale 1", "profilo non ideale 2"]
  }
}`;

/**
 * Generate enhanced article with whitelist sources and forum sentiment.
 *
 * @param preDiscoveredForumResearch - Optional research already gathered by the RAG Bridge.
 *   When provided for non-comparison articles, the forum search phase is skipped entirely,
 *   eliminating the double-search where rag-bridge and sentiment.ts both query the same
 *   forums for the same topic (audit fix R3).
 */
export async function generateEnhancedArticle(
  topic: TopicAnalysis,
  articleType: ArticleType = 'review',
  preDiscoveredForumResearch?: ForumResearchResult,
  visualClues: string[] = [] // W-BR-3/W-BR-6: visual context from RAG Bridge for image suggestions
): Promise<EnhancedArticleDraft> {
  log.info(`[DraftingV2] Generating enhanced article for: ${topic.topic}`);
  log.info(`[DraftingV2] Article type: ${articleType}`);

  // Extract products from topic
  const products = extractProducts(topic.topic);
  log.info(`[DraftingV2] Products identified: ${products.join(', ')}`);

  // 1. Research forum sentiment.
  // R3: Use pre-discovered research if available to avoid double-searching the same forums.
  let forumResearch: ForumResearchResult | null = null;
  let comparisonResearch: Awaited<ReturnType<typeof researchComparisonSentiment>> | null = null;

  if (articleType === 'comparison' && products.length >= 2) {
    log.info(`[DraftingV2] Researching comparison sentiment...`);
    comparisonResearch = await researchComparisonSentiment(products[0], products[1]);
    forumResearch = comparisonResearch.product1Research;
  } else if (preDiscoveredForumResearch) {
    log.info(`[DraftingV2] R3: Using pre-discovered forum research (${preDiscoveredForumResearch.postsAnalyzed} posts — skipping search)`);
    forumResearch = preDiscoveredForumResearch;
  } else if (products.length > 0) {
    log.info(`[DraftingV2] Researching product sentiment...`);
    forumResearch = await researchProductSentiment(products[0]);
  }
  
  // 2. Get technical specs from whitelist sources
  let specs: TechnicalSpec[] = [];
  let sources: ArticleData['sources'] = [];
  
  if (articleType === 'comparison' && products.length >= 2) {
    const specData = await searchComparisonSpecs(products[0], products[1]);
    specs = specData.specs;
    sources = specData.sources;
  } else if (products.length > 0) {
    const specData = await searchWhitelistSources(products[0]);
    specs = specData.specs;
    sources = specData.sources;
  }
  
  // 3. Prepare forum quotes
  const forumQuotes: ArticleData['forumQuotes'] = forumResearch?.sentiment.quotes.map(q => ({
    quote: q.quote,
    source: q.source,
    url: q.url,
    sentiment: q.sentiment,
  })) || [];

  // R29: Canary check — if forum research returns 0 quotes for known brands, the parser may be broken
  const KNOWN_BRANDS_REQUIRING_FORUM_DATA = ['milwaukee', 'makita', 'dewalt', 'bosch', 'hilti', 'metabo'];
  const topicLower = topic.topic.toLowerCase();
  const isKnownBrand = KNOWN_BRANDS_REQUIRING_FORUM_DATA.some(b => topicLower.includes(b));
  if (isKnownBrand && forumQuotes.length === 0) {
    log.warn(
      `[DraftingV2] R29 Canary: 0 forum quotes for known brand topic "${topic.topic}". ` +
      `Reddit/forum parser may be broken or rate-limited. Consider checking researchProductSentiment().`
    );
  }

  // 4. Prepare common problems
  const commonProblems = forumResearch?.topProblems.map(p => 
    `- ${p.issue} (${p.frequency}x menzionato, severità: ${p.severity})`
  ).join('\n') || 'Nessun problema significativo riportato';
  
  // W-BR-3: Two-phase generation — Phase 1 plans structure, Phase 2 writes HTML.
  // Separates planning from writing to prevent quality degradation / truncation
  // in complex multi-product articles. Combined budget (1500 + 5000) > old 6000.

  // Phase 1 uses abbreviated data (planning only needs a summary)
  const specsAbbrev = specs.slice(0, 5).map(s =>
    `- ${s.name}: ${s.product1Value}${s.product2Value ? ` vs ${s.product2Value}` : ''}`
  ).join('\n') || '(verifica con fonti whitelist)';
  const quotesAbbrev = forumQuotes.slice(0, 3).map(q => `"${q.quote}" — ${q.source}`).join('\n') || '(nessuna citazione)';

  const phase1Prompt = `Sei la Redazione Tecnica di Autonord Service, esperti in elettroutensili professionali.
Tipo articolo: ${articleType} | Prodotti: ${products.join(' vs ')} | Audience: ${topic.targetAudience} | Categoria TAYA: ${topic.tayaCategory}
Specifiche (prime 5): ${specsAbbrev}
Citazioni forum (prime 3): ${quotesAbbrev}
Regole TAYA: dati numerici concreti, verdetto netto (chi è / chi NON è), pro/contro onesti (min 3 contro).
Genera SOLO il PIANO EDITORIALE JSON (no HTML dell'articolo):
{
  "title": "Titolo SEO (50-60 char)",
  "titleIT": "Titolo italiano",
  "metaDescription": "Meta description (150-160 char)",
  "excerpt": "Riassunto 2-3 frasi",
  "tags": ["tag1","tag2","tag3"],
  "category": "Confronti|Recensioni|Guide|FAQ",
  "sectionOutline": [
    { "id": "intro", "heading": "H2 title", "keyPoints": ["p1","p2","p3"] },
    { "id": "specs_table", "heading": "Specifiche Tecniche", "keyPoints": [] },
    { "id": "field_opinions", "heading": "Cosa Dicono nei Cantieri", "keyPoints": ["cit1","cit2"] },
    { "id": "pros_cons", "heading": "Pro e Contro", "keyPoints": ["pro1","contro1","contro2","contro3"] },
    { "id": "verdict", "heading": "Il Verdetto di Autonord", "keyPoints": ["raccomandazione","per chi è","NON per chi"] }
  ],
  "verdict": { "winner": null, "recommendation": "...", "recommendationIT": "...", "idealFor": ["..."], "notIdealFor": ["..."] }
}`;

  // 6. Generate with Gemini — W-BR-3: two phases
  try {
    // Phase 1: scaffold (planning)
    const phase1Result = await generateTextSafe({ prompt: phase1Prompt, maxTokens: 1500, temperature: 0.3 });
    const phase1Match = phase1Result.text.match(/\{[\s\S]*\}/);
    if (!phase1Match) throw new Error('[DraftingV2] W-BR-3: Phase 1 scaffold JSON not found');
    const scaffold = JSON.parse(phase1Match[0]);
    log.info(`[DraftingV2] W-BR-3: Phase 1 scaffold — ${scaffold.sectionOutline?.length ?? 0} sections planned`);

    // Phase 2: full article HTML, guided by scaffold
    const outlineBlock = (scaffold.sectionOutline ?? [])
      .map((s: { heading: string; keyPoints: string[] }) =>
        `  - ${s.heading}: ${(s.keyPoints ?? []).join('; ')}`)
      .join('\n');

    const phase2Prompt = `Sei la Redazione Tecnica di Autonord. Scrivi l'articolo seguendo ESATTAMENTE il piano.
Titolo: ${scaffold.titleIT ?? scaffold.title}
Verdetto: ${scaffold.verdict?.recommendationIT ?? ''}
Sezioni (in ordine):
${outlineBlock}

DATI:
Specifiche: ${specs.map(s => `- ${s.name}: ${s.product1Value}${s.product2Value ? ` vs ${s.product2Value}` : ''}`).join('\n') || '(usa dati noti)'}
Forum: ${forumQuotes.map(q => `"${q.quote}" — ${q.source} (${q.sentiment})`).join('\n') || '(nessuna citazione)'}
Problemi: ${commonProblems}${visualClues.length > 0 ? `\nVisual context (per suggerire immagini): ${visualClues.join(', ')}` : ''}
Fonti: ${sources.map(s => s.name).join(', ') || '(whitelist)'}

HTML completo (min 1200 parole). Segnaposto obbligatori: <!-- SPEC_TABLE -->, <!-- FORUM_QUOTES -->, <!-- VERDICT -->, <!-- SOURCES -->.
TAYA: numeri concreti, no superlativi, pro/contro onesti.
Rispondi SOLO JSON: { "content": "<article>...tutto l'HTML...</article>" }`;

    const phase2Result = await generateTextSafe({ prompt: phase2Prompt, maxTokens: 5000, temperature: 0.5 });
    const phase2Match = phase2Result.text.match(/\{[\s\S]*\}/);
    if (!phase2Match) throw new Error('[DraftingV2] W-BR-3: Phase 2 content JSON not found');
    const contentData = JSON.parse(phase2Match[0]);

    // Merge scaffold + content — same shape as old single-call articleData
    const articleData = { ...scaffold, content: contentData.content };
    
    // 7. Generate enhanced HTML sections
    const specTableHtml = generateSpecTable(
      specs,
      products[0] || 'Prodotto',
      products[1]
    );
    
    const forumQuotesHtml = generateForumQuotesSection(forumQuotes);
    
    const verdictHtml = generateVerdictSection(articleData.verdict || {
      recommendationIT: 'Verdetto in elaborazione',
      idealFor: [],
      notIdealFor: [],
    });
    
    const sourcesHtml = generateSourcesSection(sources);
    
    // 8. Combine into final HTML
    const enhancedContent = articleData.content
      .replace('<!-- SPEC_TABLE -->', specTableHtml)
      .replace('<!-- FORUM_QUOTES -->', forumQuotesHtml)
      .replace('<!-- VERDICT -->', verdictHtml)
      .replace('<!-- SOURCES -->', sourcesHtml);
    
    // 9. Build article data for validation
    const fullArticleData: ArticleData = {
      type: articleType,
      title: articleData.title,
      titleIT: articleData.titleIT,
      slug: generateSlug(articleData.titleIT || articleData.title),
      metaDescription: articleData.metaDescription,
      metaDescriptionIT: articleData.metaDescription,
      products,
      brands: extractBrands(products),
      category: articleData.category || 'Guide',
      technicalSpecs: specs,
      forumQuotes,
      sections: [
        { id: 'intro', title: 'Introduzione', content: '' },
        { id: 'specs_table', title: 'Specifiche', content: specTableHtml },
        { id: 'field_opinions', title: 'Cosa Dicono', content: forumQuotesHtml },
        { id: 'pros_cons', title: 'Pro e Contro', content: '' },
        { id: 'verdict', title: 'Verdetto', content: verdictHtml },
      ],
      verdict: articleData.verdict || {
        recommendationIT: '',
        idealFor: [],
        notIdealFor: [],
      },
      keywords: articleData.tags || [],
      readingTime: calculateReadingTime(enhancedContent),
      sources,
    };
    
    // D28 fix: Blog content fact-checking — cross-check numbers in the article
    // against numbers from real sources (specs + forum quotes).
    // Unlike the product pipeline which has TwoPhaseQA, blog content had no
    // numeric verification. Now we flag hallucinated numbers before publishing.
    const realNumbers = new Set<string>();
    for (const spec of specs) {
      const nums = spec.product1Value.match(/\d+[.,]?\d*/g) ?? [];
      for (const n of nums) realNumbers.add(n);
    }
    for (const quote of forumQuotes) {
      const nums = quote.quote.match(/\d+[.,]?\d*/g) ?? [];
      for (const n of nums) realNumbers.add(n);
    }
    if (realNumbers.size > 0) {
      const articleNumbers = enhancedContent.match(/\d+[.,]?\d*/g) ?? [];
      const suspicious = articleNumbers.filter((n: string) => {
        if (/^20[12]\d$/.test(n)) return false; // Skip years
        if (parseInt(n, 10) < 3) return false;   // Skip trivial (1, 2)
        return !realNumbers.has(n) && !realNumbers.has(n.replace(',', '.'));
      });
      if (suspicious.length > 0) {
        log.warn(
          `[DraftingV2] D28 Fact-check: ${suspicious.length} number(s) in blog article not found in sources: ` +
          `${suspicious.slice(0, 10).join(', ')} — review for hallucination`
        );
      } else if (articleNumbers.length > 0) {
        log.info('[DraftingV2] D28 Fact-check: all numbers in article are grounded in source data ✓');
      }
    }

    // 10. Validate
    const validation = validateArticle(fullArticleData);
    
    if (validation.warnings.length > 0) {
      log.warn('[DraftingV2] Validation warnings:', validation.warnings);
    }
    if (!validation.valid) {
      log.error('[DraftingV2] Validation errors:', validation.errors);
    }
    
    return {
      title: articleData.title,
      titleIT: articleData.titleIT,
      slug: fullArticleData.slug,
      metaDescription: articleData.metaDescription,
      content: articleData.content,
      htmlContent: enhancedContent,
      excerpt: articleData.excerpt,
      tags: articleData.tags || [],
      category: articleData.category || 'Guide',
      estimatedReadTime: fullArticleData.readingTime,
      articleType,
      products,
      brands: fullArticleData.brands,
      sources,
      forumQuotes,
      technicalSpecs: specs,
      validation,
    };
    
  } catch (error) {
    log.error('[DraftingV2] Error generating article:', error);
    throw error;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract product names from topic string
 */
function extractProducts(topic: string): string[] {
  const products: string[] = [];
  
  // Pattern: "Product1 vs Product2"
  const vsMatch = topic.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) {
    products.push(vsMatch[1].trim(), vsMatch[2].trim());
    return products;
  }
  
  // Pattern: "Product1 o Product2"
  const orMatch = topic.match(/(.+?)\s+o\s+(.+)/i);
  if (orMatch) {
    products.push(orMatch[1].trim(), orMatch[2].trim());
    return products;
  }
  
  // Single product - extract brand + model
  const brandPatterns = [
    /milwaukee\s+[\w-]+/i,
    /makita\s+[\w-]+/i,
    /dewalt\s+[\w-]+/i,
    /bosch\s+[\w-]+/i,
    /hilti\s+[\w-]+/i,
    /metabo\s+[\w-]+/i,
    /festool\s+[\w-]+/i,
  ];
  
  for (const pattern of brandPatterns) {
    const match = topic.match(pattern);
    if (match) {
      products.push(match[0]);
    }
  }
  
  // Fallback: use the whole topic
  if (products.length === 0) {
    products.push(topic);
  }
  
  return products;
}

/**
 * Extract brand names from product names
 */
function extractBrands(products: string[]): string[] {
  const brands = new Set<string>();
  const brandNames = ['milwaukee', 'makita', 'dewalt', 'bosch', 'hilti', 'metabo', 'festool', 'hikoki', 'ryobi'];
  
  for (const product of products) {
    const lower = product.toLowerCase();
    for (const brand of brandNames) {
      if (lower.includes(brand)) {
        brands.add(brand.charAt(0).toUpperCase() + brand.slice(1));
      }
    }
  }
  
  return Array.from(brands);
}

/**
 * Generate a batch of launch articles
 */
export async function generateLaunchArticles(
  topics: { topic: string; type: ArticleType; targetAudience: string; tayaCategory: 'pricing' | 'problems' | 'comparisons' | 'reviews' | 'best' }[]
): Promise<EnhancedArticleDraft[]> {
  const articles: EnhancedArticleDraft[] = [];
  
  for (const topicConfig of topics) {
    log.info(`\n[DraftingV2] === Generating: ${topicConfig.topic} ===\n`);
    
    const topicAnalysis: TopicAnalysis = {
      topic: topicConfig.topic,
      painPoint: `Professionisti che cercano informazioni su ${topicConfig.topic}`,
      articleAngle: topicConfig.type,
      targetAudience: topicConfig.targetAudience,
      tayaCategory: topicConfig.tayaCategory,
      emotionalHook: 'Incertezza nella scelta',
      searchIntent: topicConfig.topic,
      samplePosts: [],
      frequency: 1,
      avgEngagement: 100,
    };
    
    try {
      const article = await generateEnhancedArticle(topicAnalysis, topicConfig.type);
      articles.push(article);
      
      log.info(`[DraftingV2] ✓ Generated: ${article.title}`);
      log.info(`[DraftingV2]   - ${article.technicalSpecs.length} specs`);
      log.info(`[DraftingV2]   - ${article.forumQuotes.length} forum quotes`);
      log.info(`[DraftingV2]   - ${article.sources.length} sources`);
      log.info(`[DraftingV2]   - Valid: ${article.validation.valid}`);
      
      // Rate limiting between articles
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      log.error(`[DraftingV2] ✗ Failed: ${topicConfig.topic}`, error);
    }
  }
  
  return articles;
}
