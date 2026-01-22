/**
 * Query Expander Module (CLaRa-Inspired)
 * 
 * Implements the Query Reasoner pattern from the CLaRa paper:
 * - Expand base queries with anticipated relevant terms
 * - Generate multiple query variants for comprehensive search
 * - Include technical terms, problems, comparisons, and forum-style questions
 * 
 * Benefits:
 * - More targeted searches
 * - Better coverage of relevant content
 * - Finds content that matches user intent, not just keywords
 */

import Anthropic from '@anthropic-ai/sdk';
import { loggers } from '@/lib/logger';

const log = loggers.blog;

// ============================================================================
// Types
// ============================================================================

export interface ExpandedQuery {
  original: string;
  variants: QueryVariant[];
  expansionTime: number;
}

export interface QueryVariant {
  query: string;
  type: QueryType;
  intent: string;
  expectedSources: string[];
}

export type QueryType = 
  | 'technical'      // Technical specs and features
  | 'problem'        // Issues and complaints
  | 'comparison'     // vs competitors
  | 'forum'          // Real user questions
  | 'review'         // Professional reviews
  | 'howto';         // Practical usage

// ============================================================================
// Query Expansion Templates
// ============================================================================

// =============================================================================
// TAYA SHADOW QUERIES - Always search for problems (Onestà Radicale)
// =============================================================================

/**
 * Shadow queries are ALWAYS added to any search, regardless of article type.
 * This ensures TAYA compliance: we always know the problems before writing.
 */
const SHADOW_QUERIES_PROBLEMS: string[] = [
  '{product} problems issues',
  '{product} broke after',
  '{product} warranty claim',
  '{product} problemi difetti',
  '{product} si è rotto',
  '{product} non funziona più',
  '{brand} common problems',
  '{brand} known issues',
  '{product} reddit problems',
  '{product} forum complaints',
];

/**
 * Additional shadow queries for competitive intelligence
 */
const SHADOW_QUERIES_COMPETITION: string[] = [
  '{product} vs {competitor} which better',
  '{product} or {competitor} reddit',
  'why {competitor} instead of {product}',
  '{product} disadvantages compared to',
];

const EXPANSION_TEMPLATES: Record<QueryType, string[]> = {
  technical: [
    '{product} specifiche tecniche',
    '{product} scheda tecnica PDF',
    '{product} brushless specs',
    '{brand} {category} caratteristiche',
  ],
  problem: [
    // Enhanced problem queries (TAYA-compliant)
    '{product} problemi',
    '{product} difetti',
    '{product} si surriscalda',
    '{product} batteria non dura',
    '{product} rottura',
    '{product} issues reddit',
    '{product} problems after 6 months',
    '{product} warranty issues',
    '{brand} quality problems 2024 2025',
    '{product} broke stopped working',
  ],
  comparison: [
    '{product} vs {competitor}',
    '{product} o {competitor}',
    '{brand} vs {competitor_brand} {category}',
    'meglio {product} o {competitor}',
    '{product} alternativa',
  ],
  forum: [
    '{product} opinioni',
    '{product} vale la pena',
    '{product} esperienza',
    '{product} dopo 1 anno',
    '{product} consiglio acquisto',
    'chi usa {product}',
  ],
  review: [
    '{product} recensione',
    '{product} test',
    '{product} pro tool reviews',
    '{product} review professionale',
  ],
  howto: [
    'come usare {product}',
    '{product} manutenzione',
    '{product} accessori consigliati',
    '{product} setup iniziale',
  ],
};

// ============================================================================
// Competitor Mapping
// ============================================================================

const BRAND_COMPETITORS: Record<string, string[]> = {
  'Milwaukee': ['Makita', 'DeWalt', 'Bosch', 'Hilti'],
  'Makita': ['Milwaukee', 'DeWalt', 'HiKOKI', 'Bosch'],
  'DeWalt': ['Milwaukee', 'Makita', 'Bosch', 'Stanley'],
  'Bosch': ['Milwaukee', 'Makita', 'DeWalt', 'Metabo'],
  'Hilti': ['Milwaukee', 'Makita', 'Bosch', 'Festool'],
  'Metabo': ['Bosch', 'Milwaukee', 'Makita', 'Festool'],
  'Festool': ['Makita', 'Bosch', 'Metabo', 'Milwaukee'],
  'HiKOKI': ['Makita', 'Milwaukee', 'DeWalt', 'Bosch'],
};

// ============================================================================
// AI-Powered Query Expansion
// ============================================================================

export async function expandQueryWithAI(
  baseQuery: string,
  context: {
    product?: string;
    brand?: string;
    category?: string;
    articleType?: 'comparison' | 'problem' | 'review' | 'guide';
  },
  anthropic: Anthropic
): Promise<ExpandedQuery> {
  const startTime = Date.now();

  const prompt = `Sei un tecnico esperto di elettroutensili che deve cercare informazioni REALI e PRATICHE.

QUERY ORIGINALE: "${baseQuery}"

CONTESTO:
- Prodotto: ${context.product || 'non specificato'}
- Brand: ${context.brand || 'non specificato'}
- Categoria: ${context.category || 'non specificato'}
- Tipo articolo: ${context.articleType || 'generale'}

---

Genera 8-10 varianti della query che cercano informazioni DIVERSE ma correlate.

Per ogni variante, specifica:
1. La query esatta da cercare
2. Il tipo (technical, problem, comparison, forum, review, howto)
3. L'intento (cosa ci aspettiamo di trovare)
4. Le fonti attese (es. "Reddit", "Pro Tool Reviews", "forum italiani")

REGOLE:
- Includi SEMPRE almeno 2 query "problem" (problemi reali degli utenti)
- Includi SEMPRE almeno 1 query "comparison" con competitor specifico
- Includi query in ITALIANO e in INGLESE
- Usa termini che i PROFESSIONISTI userebbero (non marketing)
- Includi query tipo forum ("vale la pena", "dopo 1 anno", "chi usa")

Rispondi in JSON:
{
  "variants": [
    {
      "query": "la query esatta",
      "type": "technical|problem|comparison|forum|review|howto",
      "intent": "cosa ci aspettiamo di trovare",
      "expectedSources": ["fonte 1", "fonte 2"]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      original: baseQuery,
      variants: parsed.variants || [],
      expansionTime: Date.now() - startTime,
    };
  } catch {
    log.error('Failed to parse query expansion response');
    // Fallback to template-based expansion
    return expandQueryWithTemplates(baseQuery, context);
  }
}

// ============================================================================
// Template-Based Query Expansion (Fallback)
// ============================================================================

export function expandQueryWithTemplates(
  baseQuery: string,
  context: {
    product?: string;
    brand?: string;
    category?: string;
  }
): ExpandedQuery {
  const startTime = Date.now();
  const variants: QueryVariant[] = [];

  const product = context.product || baseQuery;
  const brand = context.brand || '';
  const category = context.category || 'utensile';
  const competitors = brand ? (BRAND_COMPETITORS[brand] || ['concorrente']) : ['concorrente'];

  // Generate variants for each type
  for (const [type, templates] of Object.entries(EXPANSION_TEMPLATES)) {
    for (const template of templates.slice(0, 2)) { // Max 2 per type
      const query = template
        .replace(/{product}/g, product)
        .replace(/{brand}/g, brand)
        .replace(/{category}/g, category)
        .replace(/{competitor}/g, competitors[0])
        .replace(/{competitor_brand}/g, competitors[0]);

      variants.push({
        query,
        type: type as QueryType,
        intent: getIntentForType(type as QueryType),
        expectedSources: getExpectedSourcesForType(type as QueryType),
      });
    }
  }

  return {
    original: baseQuery,
    variants,
    expansionTime: Date.now() - startTime,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getIntentForType(type: QueryType): string {
  const intents: Record<QueryType, string> = {
    technical: 'Trovare specifiche tecniche verificate',
    problem: 'Identificare problemi reali segnalati dagli utenti',
    comparison: 'Confrontare con prodotti concorrenti',
    forum: 'Raccogliere opinioni reali di professionisti',
    review: 'Trovare recensioni professionali approfondite',
    howto: 'Trovare guide pratiche e consigli d\'uso',
  };
  return intents[type];
}

function getExpectedSourcesForType(type: QueryType): string[] {
  const sources: Record<QueryType, string[]> = {
    technical: ['Sito ufficiale', 'Manuali PDF', 'Schede tecniche'],
    problem: ['Reddit r/Tools', 'Forum italiani', 'Amazon reviews'],
    comparison: ['Pro Tool Reviews', 'ToolGuyd', 'YouTube'],
    forum: ['Reddit', 'PLC Forum', 'Forum Macchine'],
    review: ['Pro Tool Reviews', 'ToolGuyd', 'Tooltalk'],
    howto: ['YouTube', 'Blog tecnici', 'Manuali'],
  };
  return sources[type];
}

// ============================================================================
// Query Prioritization
// ============================================================================

export function prioritizeQueries(
  expanded: ExpandedQuery,
  articleType: 'comparison' | 'problem' | 'review' | 'guide'
): QueryVariant[] {
  const priorities: Record<string, Record<QueryType, number>> = {
    comparison: {
      comparison: 10,
      technical: 8,
      forum: 6,
      problem: 5,
      review: 4,
      howto: 2,
    },
    problem: {
      problem: 10,
      forum: 8,
      technical: 5,
      review: 4,
      comparison: 3,
      howto: 2,
    },
    review: {
      review: 10,
      technical: 8,
      problem: 7,
      forum: 6,
      comparison: 5,
      howto: 3,
    },
    guide: {
      howto: 10,
      technical: 8,
      forum: 6,
      problem: 5,
      review: 4,
      comparison: 3,
    },
  };

  const typePriorities = priorities[articleType];

  return [...expanded.variants].sort((a, b) => {
    return (typePriorities[b.type] || 0) - (typePriorities[a.type] || 0);
  });
}

// ============================================================================
// Main Export: Smart Query Expansion
// ============================================================================

export async function smartExpandQuery(
  baseQuery: string,
  context: {
    product?: string;
    brand?: string;
    category?: string;
    articleType?: 'comparison' | 'problem' | 'review' | 'guide';
  },
  anthropic?: Anthropic,
  options: {
    includeShadowQueries?: boolean;  // Default: true (TAYA compliance)
    shadowQueryRatio?: number;       // Default: 0.3 (30% of queries are shadow)
  } = {}
): Promise<{
  queries: QueryVariant[];
  original: string;
  expansionMethod: 'ai' | 'template';
  shadowQueriesIncluded: number;
}> {
  const { includeShadowQueries = true, shadowQueryRatio = 0.3 } = options;
  
  let expanded: ExpandedQuery;
  let method: 'ai' | 'template' = 'template';

  if (anthropic) {
    try {
      expanded = await expandQueryWithAI(baseQuery, context, anthropic);
      method = 'ai';
    } catch (error) {
      log.error('AI expansion failed, falling back to templates:', error);
      expanded = expandQueryWithTemplates(baseQuery, context);
    }
  } else {
    expanded = expandQueryWithTemplates(baseQuery, context);
  }

  // Prioritize based on article type
  let prioritized = context.articleType 
    ? prioritizeQueries(expanded, context.articleType)
    : expanded.variants;

  // TAYA COMPLIANCE: Always inject shadow queries for problems
  let shadowQueriesIncluded = 0;
  if (includeShadowQueries) {
    const shadowQueries = generateShadowQueries(context);
    const numShadowToAdd = Math.max(3, Math.floor(prioritized.length * shadowQueryRatio));
    
    // Add shadow queries, ensuring they're distributed throughout results
    const shadowToAdd = shadowQueries.slice(0, numShadowToAdd);
    shadowQueriesIncluded = shadowToAdd.length;
    
    // Interleave shadow queries with regular queries
    prioritized = interleaveShadowQueries(prioritized, shadowToAdd);
    
    log.info(`[QueryExpander] TAYA: Added ${shadowQueriesIncluded} shadow queries for problems/competition`);
  }

  log.info(`[QueryExpander] Expanded "${baseQuery}" into ${prioritized.length} variants (method: ${method})`);

  return {
    queries: prioritized,
    original: baseQuery,
    expansionMethod: method,
    shadowQueriesIncluded,
  };
}

/**
 * Generate shadow queries based on context (TAYA compliance)
 * These queries search for problems and competitive weaknesses
 */
function generateShadowQueries(context: {
  product?: string;
  brand?: string;
  category?: string;
}): QueryVariant[] {
  const product = context.product || 'product';
  const brand = context.brand || '';
  const competitors = brand ? (BRAND_COMPETITORS[brand] || ['competitor']) : ['competitor'];
  
  const shadowVariants: QueryVariant[] = [];
  
  // Problem shadow queries
  for (const template of SHADOW_QUERIES_PROBLEMS) {
    const query = template
      .replace(/{product}/g, product)
      .replace(/{brand}/g, brand);
    
    shadowVariants.push({
      query,
      type: 'problem',
      intent: 'TAYA Shadow: Find real problems users report',
      expectedSources: ['Reddit', 'Forums', 'Amazon Reviews'],
    });
  }
  
  // Competition shadow queries
  for (const template of SHADOW_QUERIES_COMPETITION) {
    const query = template
      .replace(/{product}/g, product)
      .replace(/{competitor}/g, competitors[0]);
    
    shadowVariants.push({
      query,
      type: 'comparison',
      intent: 'TAYA Shadow: Find competitive weaknesses',
      expectedSources: ['Reddit', 'Pro Tool Reviews', 'Forums'],
    });
  }
  
  return shadowVariants;
}

/**
 * Interleave shadow queries with regular queries
 * Ensures problems are searched throughout, not just at the end
 */
function interleaveShadowQueries(
  regular: QueryVariant[],
  shadow: QueryVariant[]
): QueryVariant[] {
  if (shadow.length === 0) return regular;
  
  const result: QueryVariant[] = [];
  const interval = Math.max(2, Math.floor(regular.length / shadow.length));
  
  let shadowIndex = 0;
  
  for (let i = 0; i < regular.length; i++) {
    result.push(regular[i]);
    
    // Insert shadow query at intervals
    if ((i + 1) % interval === 0 && shadowIndex < shadow.length) {
      result.push(shadow[shadowIndex]);
      shadowIndex++;
    }
  }
  
  // Add remaining shadow queries at the end
  while (shadowIndex < shadow.length) {
    result.push(shadow[shadowIndex]);
    shadowIndex++;
  }
  
  return result;
}
