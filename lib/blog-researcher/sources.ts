/**
 * Blog Researcher - Sources Configuration
 *
 * Whitelist of trusted sources and forum configurations
 * for high-quality technical research aligned with the Danea catalog:
 * utensili elettrici, macchine cantiere, gruppi elettrogeni, attrezzatura edile.
 */

// =============================================================================
// WHITELIST SOURCES - Priority Technical Data
// =============================================================================

export interface TrustedSource {
  domain: string;
  name: string;
  type: 'technical' | 'review' | 'forum' | 'community' | 'blog';
  priority: number; // 1-10, higher = more important
  dataTypes: string[];
  language: 'en' | 'it' | 'both';
}

/**
 * Primary whitelist sources for technical data.
 * These are the FIRST sources to check for any article.
 */
export const WHITELIST_SOURCES: TrustedSource[] = [
  // ── Tier 1: EN technical benchmarks ──────────────────────────────────────
  {
    domain: 'protoolreviews.com',
    name: 'Pro Tool Reviews',
    type: 'technical',
    priority: 10,
    dataTypes: ['specs', 'benchmarks', 'comparisons', 'teardowns', 'runtime-tests'],
    language: 'en',
  },
  {
    domain: 'toolguyd.com',
    name: 'ToolGuyd',
    type: 'review',
    priority: 9,
    dataTypes: ['feature-analysis', 'hands-on', 'news', 'deals', 'comparisons'],
    language: 'en',
  },
  {
    domain: 'tooltalk.com',
    name: 'ToolTalk',
    type: 'community',
    priority: 8,
    dataTypes: ['user-opinions', 'real-world-use', 'durability-reports'],
    language: 'en',
  },

  // ── Tier 2: EN additional quality sources ────────────────────────────────
  {
    domain: 'thetoolreport.com',
    name: 'The Tool Report',
    type: 'technical',
    priority: 7,
    dataTypes: ['specs', 'comparisons', 'buying-guides'],
    language: 'en',
  },
  {
    domain: 'coptool.com',
    name: 'Coptool',
    type: 'review',
    priority: 7,
    dataTypes: ['hands-on', 'news', 'first-looks'],
    language: 'en',
  },

  // ── Tier 3: IT dealer blogs & industry publications ───────────────────────
  {
    domain: 'misterworker.com',
    name: 'Mister Worker Blog',
    type: 'blog',
    priority: 8,
    dataTypes: ['buying-guides', 'comparisons', 'brand-reviews'],
    language: 'it',
  },
  {
    domain: 'perinelliforniture.it',
    name: 'Perinelli Forniture Blog',
    type: 'blog',
    priority: 7,
    dataTypes: ['field-tests', 'professional-guides', 'practical-tips'],
    language: 'it',
  },
  {
    domain: 'extoltools.com',
    name: 'Extol Tools Blog IT',
    type: 'blog',
    priority: 6,
    dataTypes: ['brand-rankings', 'comparisons', 'buying-guides'],
    language: 'it',
  },
  {
    domain: 'festool.it',
    name: 'Festool Italia Blog',
    type: 'blog',
    priority: 6,
    dataTypes: ['technical-depth', 'system-explanations', 'professional-use'],
    language: 'it',
  },
  {
    domain: 'mariniproworker.it',
    name: 'Marini ProWorker Blog',
    type: 'blog',
    priority: 5,
    dataTypes: ['site-tools', 'professional-guides'],
    language: 'it',
  },

  // ── Tier 3: IT generator & heavy equipment blogs ─────────────────────────
  {
    domain: 'bertolisrl.it',
    name: 'Bertoli SRL Generatori',
    type: 'blog',
    priority: 6,
    dataTypes: ['generator-guides', 'site-equipment', 'buying-guides'],
    language: 'it',
  },
  {
    domain: 'oreficegenerators.com',
    name: 'Orefice Generators Blog',
    type: 'blog',
    priority: 6,
    dataTypes: ['generator-specs', 'site-safety', 'maintenance'],
    language: 'it',
  },
  {
    domain: 'eurobrico.com',
    name: 'Eurobrico Magazine',
    type: 'blog',
    priority: 5,
    dataTypes: ['generator-guides', 'equipment-guides', 'diy'],
    language: 'it',
  },
  {
    domain: 'mastropaolo.net',
    name: 'Mastropaolo Elettrotecnica',
    type: 'technical',
    priority: 6,
    dataTypes: ['generator-technical', 'electrical-specs', 'load-analysis'],
    language: 'it',
  },
  {
    domain: 'generatoradvisor.com',
    name: 'Generator Advisor',
    type: 'technical',
    priority: 7,
    dataTypes: ['generator-reviews', 'load-tests', 'autonomy-tests'],
    language: 'en',
  },
];

// =============================================================================
// RSS SOURCES — Structured feed fetching (no API key required)
// =============================================================================

export interface RssSource {
  domain: string;
  name: string;
  feedUrl: string;
  language: 'en' | 'it';
  category: 'tools' | 'generators' | 'construction' | 'general';
  priority: number;
}

/**
 * Sources with public RSS feeds — fetched automatically every cron run.
 */
export const RSS_SOURCES: RssSource[] = [
  {
    domain: 'toolguyd.com',
    name: 'ToolGuyd',
    feedUrl: 'https://toolguyd.com/feed/',
    language: 'en',
    category: 'tools',
    priority: 9,
  },
  {
    domain: 'protoolreviews.com',
    name: 'Pro Tool Reviews',
    feedUrl: 'https://www.protoolreviews.com/feed/',
    language: 'en',
    category: 'tools',
    priority: 10,
  },
  {
    domain: 'misterworker.com',
    name: 'Mister Worker IT',
    feedUrl: 'https://www.misterworker.com/it/blog/feed',
    language: 'it',
    category: 'tools',
    priority: 8,
  },
  {
    domain: 'perinelliforniture.it',
    name: 'Perinelli Forniture',
    feedUrl: 'https://perinelliforniture.it/feed/',
    language: 'it',
    category: 'tools',
    priority: 7,
  },
];

// =============================================================================
// FORUM SOURCES — Sentiment analysis & real-world opinions
// =============================================================================

export interface ForumSource {
  domain: string;
  name: string;
  type: 'reddit' | 'forum' | 'community';
  language: 'en' | 'it';
  searchPatterns: string[];
  sentimentWeight: number;
}

/**
 * Forums for sentiment analysis and real-world opinions.
 */
export const FORUM_SOURCES: ForumSource[] = [
  // ── Reddit EN ─────────────────────────────────────────────────────────────
  {
    domain: 'reddit.com/r/Tools',
    name: 'Reddit r/Tools',
    type: 'reddit',
    language: 'en',
    searchPatterns: [
      'site:reddit.com/r/Tools',
      'site:reddit.com/r/MilwaukeeTool',
      'site:reddit.com/r/Makita',
      'site:reddit.com/r/DeWalt',
    ],
    sentimentWeight: 0.9,
  },
  {
    domain: 'reddit.com/r/Contractor',
    name: 'Reddit r/Contractor',
    type: 'reddit',
    language: 'en',
    searchPatterns: ['site:reddit.com/r/Contractor'],
    sentimentWeight: 0.9,
  },
  {
    domain: 'reddit.com/r/Construction',
    name: 'Reddit r/Construction',
    type: 'reddit',
    language: 'en',
    searchPatterns: ['site:reddit.com/r/Construction'],
    sentimentWeight: 0.85,
  },
  {
    domain: 'reddit.com/r/Electricians',
    name: 'Reddit r/Electricians',
    type: 'reddit',
    language: 'en',
    searchPatterns: ['site:reddit.com/r/Electricians'],
    sentimentWeight: 0.9,
  },
  {
    domain: 'garagejournal.com',
    name: 'Garage Journal',
    type: 'forum',
    language: 'en',
    searchPatterns: ['site:garagejournal.com'],
    sentimentWeight: 0.8,
  },
  {
    domain: 'contractortalk.com',
    name: 'Contractor Talk',
    type: 'forum',
    language: 'en',
    searchPatterns: ['site:contractortalk.com'],
    sentimentWeight: 0.85,
  },

  // ── IT Forum generali ─────────────────────────────────────────────────────
  {
    domain: 'plcforum.it',
    name: 'PLC Forum Italia',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:plcforum.it'],
    sentimentWeight: 0.9,
  },
  {
    domain: 'electroyou.it',
    name: 'ElectroYou',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:electroyou.it/forum'],
    sentimentWeight: 0.8,
  },
  {
    domain: 'sv-italia.it',
    name: 'SV Italia Forum Utensili',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:sv-italia.it/forum'],
    sentimentWeight: 0.75,
  },

  // ── IT Forum macchine da cantiere ─────────────────────────────────────────
  {
    domain: 'forum-macchine.it',
    name: 'Forum Macchine',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:forum-macchine.it'],
    sentimentWeight: 0.9,
  },
  {
    domain: 'mmtitalia.it',
    name: 'MMT Italia Escavatori',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:mmtitalia.it/macchine_edili'],
    sentimentWeight: 0.85,
  },
];

// =============================================================================
// SEARCH QUERY TEMPLATES
// =============================================================================

export const SENTIMENT_QUERY_TEMPLATES = {
  problems: [
    '{product} problemi',
    '{product} guasto',
    '{product} difetti',
    '{product} si rompe',
    '{product} problems',
    '{product} issues',
    '{product} broke',
    '{product} failure',
    '{product} warranty claim',
  ],
  opinions: [
    'opinioni {product}',
    'cosa ne pensate {product}',
    '{product} pro e contro',
    '{product} review',
    '{product} worth it',
    '{product} honest opinion',
    '{product} vale la pena',
  ],
  comparisons: [
    '{product1} vs {product2}',
    '{product1} o {product2}',
    '{product1} meglio di {product2}',
    '{product1} confronto {product2}',
    '{product1} compared to {product2}',
    'switch from {product1} to {product2}',
  ],
  durability: [
    '{product} durata',
    '{product} dopo un anno',
    '{product} longevity',
    '{product} long term',
    '{product} affidabilità',
  ],
};

// =============================================================================
// ARTICLE STRUCTURE REQUIREMENTS
// =============================================================================

export interface ArticleSection {
  id: string;
  title: string;
  titleIT: string;
  required: boolean;
  minWords: number;
  description: string;
}

export const MANDATORY_ARTICLE_SECTIONS: ArticleSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    titleIT: 'Introduzione',
    required: true,
    minWords: 100,
    description: 'Hook the reader with a real problem or question',
  },
  {
    id: 'specs_table',
    title: 'Technical Specifications',
    titleIT: 'Specifiche Tecniche',
    required: true,
    minWords: 0,
    description: 'Comparative table with numerical data from whitelist sources',
  },
  {
    id: 'field_opinions',
    title: 'What They Say on Job Sites',
    titleIT: 'Cosa Dicono nei Cantieri',
    required: true,
    minWords: 200,
    description: 'Synthesis of real opinions from forums with citations',
  },
  {
    id: 'pros_cons',
    title: 'Pros and Cons',
    titleIT: 'Pro e Contro',
    required: true,
    minWords: 150,
    description: 'Honest assessment including real drawbacks',
  },
  {
    id: 'verdict',
    title: 'Autonord Verdict',
    titleIT: 'Il Verdetto di Autonord',
    required: true,
    minWords: 150,
    description: 'Clear, opinionated recommendation - not wishy-washy',
  },
  {
    id: 'faq',
    title: 'FAQ',
    titleIT: 'Domande Frequenti',
    required: false,
    minWords: 100,
    description: 'Common questions from forum research',
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getProblemQueries(productName: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.problems.map(t => t.replace('{product}', productName));
}

export function getOpinionQueries(productName: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.opinions.map(t => t.replace('{product}', productName));
}

export function getComparisonQueries(product1: string, product2: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.comparisons.map(t =>
    t.replace('{product1}', product1).replace('{product2}', product2)
  );
}

export function getForumSearchPatterns(query: string, language?: 'en' | 'it'): string[] {
  const patterns: string[] = [];
  for (const forum of FORUM_SOURCES) {
    if (language && forum.language !== language) continue;
    for (const pattern of forum.searchPatterns) {
      patterns.push(`${pattern} ${query}`);
    }
  }
  return patterns;
}

export function getWhitelistDomains(): string[] {
  return WHITELIST_SOURCES.map(s => s.domain);
}

export function getItSourceDomains(): string[] {
  return WHITELIST_SOURCES
    .filter(s => s.language === 'it' || s.language === 'both')
    .map(s => s.domain);
}

export function validateArticleStructure(sections: string[]): {
  valid: boolean;
  missing: string[];
} {
  const required = MANDATORY_ARTICLE_SECTIONS.filter(s => s.required).map(s => s.id);
  const missing = required.filter(id => !sections.includes(id));
  return { valid: missing.length === 0, missing };
}
