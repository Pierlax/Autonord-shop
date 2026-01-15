/**
 * Blog Researcher - Sources Configuration
 * 
 * Whitelist of trusted sources and forum configurations
 * for high-quality technical research
 */

// =============================================================================
// WHITELIST SOURCES - Priority Technical Data
// =============================================================================

export interface TrustedSource {
  domain: string;
  name: string;
  type: 'technical' | 'review' | 'forum' | 'community';
  priority: number; // 1-10, higher = more important
  dataTypes: string[]; // What kind of data we can get
  language: 'en' | 'it' | 'both';
}

/**
 * Primary whitelist sources for technical data
 * These are the FIRST sources to check for any article
 */
export const WHITELIST_SOURCES: TrustedSource[] = [
  // Tier 1 - Primary Technical Data
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
  
  // Tier 2 - Additional Quality Sources
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
];

// =============================================================================
// FORUM SOURCES - Sentiment Analysis
// =============================================================================

export interface ForumSource {
  domain: string;
  name: string;
  type: 'reddit' | 'forum' | 'community';
  language: 'en' | 'it';
  searchPatterns: string[]; // URL patterns for searching
  sentimentWeight: number; // How much to weight opinions from this source
}

/**
 * Forums for sentiment analysis and real-world opinions
 */
export const FORUM_SOURCES: ForumSource[] = [
  // English Forums
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
  
  // Italian Forums
  {
    domain: 'plcforum.it',
    name: 'PLC Forum Italia',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:plcforum.it'],
    sentimentWeight: 0.9,
  },
  {
    domain: 'forum-macchine.it',
    name: 'Forum Macchine',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:forum-macchine.it'],
    sentimentWeight: 0.85,
  },
  {
    domain: 'electroyou.it',
    name: 'ElectroYou',
    type: 'forum',
    language: 'it',
    searchPatterns: ['site:electroyou.it'],
    sentimentWeight: 0.8,
  },
];

// =============================================================================
// SEARCH QUERY TEMPLATES
// =============================================================================

/**
 * Query templates for finding problems and opinions
 */
export const SENTIMENT_QUERY_TEMPLATES = {
  problems: [
    '{product} problemi',
    '{product} guasto',
    '{product} difetti',
    '{product} problems',
    '{product} issues',
    '{product} broke',
    '{product} failure',
    '{product} warranty claim',
  ],
  opinions: [
    'opinioni {product}',
    '{product} review',
    '{product} worth it',
    '{product} honest opinion',
    'cosa ne pensate {product}',
    '{product} pro e contro',
  ],
  comparisons: [
    '{product1} vs {product2}',
    '{product1} o {product2}',
    '{product1} meglio di {product2}',
    '{product1} compared to {product2}',
    'switch from {product1} to {product2}',
  ],
  durability: [
    '{product} durata',
    '{product} longevity',
    '{product} after 1 year',
    '{product} dopo un anno',
    '{product} long term',
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

/**
 * Mandatory sections for every article
 */
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
    minWords: 0, // Table, not prose
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

/**
 * Get search queries for a product's problems
 */
export function getProblemQueries(productName: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.problems.map(template =>
    template.replace('{product}', productName)
  );
}

/**
 * Get search queries for a product's opinions
 */
export function getOpinionQueries(productName: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.opinions.map(template =>
    template.replace('{product}', productName)
  );
}

/**
 * Get search queries for product comparisons
 */
export function getComparisonQueries(product1: string, product2: string): string[] {
  return SENTIMENT_QUERY_TEMPLATES.comparisons.map(template =>
    template.replace('{product1}', product1).replace('{product2}', product2)
  );
}

/**
 * Get all forum search patterns for a query
 */
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

/**
 * Get whitelist domains for search filtering
 */
export function getWhitelistDomains(): string[] {
  return WHITELIST_SOURCES.map(source => source.domain);
}

/**
 * Validate article has all mandatory sections
 */
export function validateArticleStructure(sections: string[]): {
  valid: boolean;
  missing: string[];
} {
  const required = MANDATORY_ARTICLE_SECTIONS
    .filter(s => s.required)
    .map(s => s.id);
  
  const missing = required.filter(id => !sections.includes(id));
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
