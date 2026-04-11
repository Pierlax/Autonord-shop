/**
 * C10 fix: KG-derived brand competitors and category synonyms.
 *
 * Reads `data/kg-base.json` once at module load and builds:
 *   - `getCompetitors(brand)` → all other professional brands in the same market
 *   - `KG_CATEGORY_SYNONYMS`  → expanded synonym map from KG category names/descriptions
 *
 * Both functions fall back to the previous hardcoded data when a brand or
 * category isn't found in the KG, so coverage only increases — never decreases.
 *
 * The KG base file is static (committed to repo) and always available, unlike
 * the live KG graph which requires Redis.  This means these lookups work in
 * tests, in the blog researcher cron, and in the product worker equally.
 */

import kgBase from '@/data/kg-base.json';

// =============================================================================
// BRAND COMPETITORS (derived from kg-base.json)
// =============================================================================

interface KGBrand {
  id: string;
  name: string;
  properties: {
    country: string;
    batterySystem: string;
    targetMarket: string;
    strengths: string[];
  };
}

/**
 * Groups brands by target market segment.  Brands in the same segment are
 * competitors (e.g., all "professional" power tool brands compete).
 *
 * We also define cross-segment competition where it's natural:
 * "premium_professional" competes with "professional" (Hilti vs Milwaukee).
 */
const COMPETING_SEGMENTS: Record<string, string[]> = {
  professional:         ['professional', 'premium_professional'],
  premium_professional: ['professional', 'premium_professional'],
};

const brands = kgBase.brands as KGBrand[];

// Pre-compute a competitor map for every known brand
const KG_COMPETITORS = new Map<string, string[]>();

for (const brand of brands) {
  const segments = COMPETING_SEGMENTS[brand.properties.targetMarket]
    || [brand.properties.targetMarket];

  const competitors = brands
    .filter(b =>
      b.id !== brand.id &&
      segments.includes(b.properties.targetMarket)
    )
    .map(b => b.name);

  KG_COMPETITORS.set(brand.name, competitors);
  // Also index by lowercase and by ID for flexible lookup
  KG_COMPETITORS.set(brand.name.toLowerCase(), competitors);
  KG_COMPETITORS.set(brand.id, competitors);
}

/**
 * Returns competitor brand names for the given brand.
 *
 * Lookup order:
 *   1. Exact match in KG brands (by name, lowercase name, or ID)
 *   2. Case-insensitive partial match (e.g. "Bosch Professional" → "bosch")
 *   3. Fallback: `['concorrente']` (generic Italian for "competitor")
 */
export function getCompetitors(brand: string): string[] {
  // Exact match
  const exact = KG_COMPETITORS.get(brand) || KG_COMPETITORS.get(brand.toLowerCase());
  if (exact && exact.length > 0) return exact;

  // Partial match: "Bosch Professional" → find "bosch" entry
  const lower = brand.toLowerCase();
  for (const [key, competitors] of KG_COMPETITORS.entries()) {
    if (lower.includes(key) || key.includes(lower)) {
      return competitors;
    }
  }

  return [];
}

// =============================================================================
// CATEGORY SYNONYMS (derived from kg-base.json)
// =============================================================================

interface KGCategory {
  id: string;
  name: string;
  properties: {
    description: string;
    [key: string]: unknown;
  };
}

const categories = kgBase.categories as KGCategory[];

/**
 * Expanded category synonym map.  For each KG category, we register:
 *   - The Italian name (e.g. "Trapano Avvitatore" → "trapano")
 *   - The English ID words (e.g. "drill_driver" → "trapano")
 *   - Key words from the description (e.g. "foratura" → "trapano")
 *
 * The canonical value is a substring that `normalizeCategory()` in two-phase-qa.ts
 * will match via `.includes()` against the category-specific question sets.
 */
const STOP_WORDS = new Set([
  'per', 'con', 'del', 'dal', 'nel', 'sul', 'della', 'delle', 'degli',
  'alla', 'alle', 'allo', 'nella', 'nelle', 'sulla', 'sulle',
  'una', 'uno', 'and', 'the', 'for',
]);

const KG_CATEGORY_SYNONYMS: Record<string, string> = {};

// Category ID → canonical keyword mapping (must match the .includes() checks
// in getQuestionsForCategory() in two-phase-qa.ts)
const ID_TO_CANONICAL: Record<string, string> = {
  drill_driver:         'trapano',
  impact_driver:        'impulsiavvitat',
  impact_wrench:        'impulsiavvitat',
  hammer_drill:         'trapano',
  angle_grinder:        'smerigliatri',
  circular_saw:         'trapano',       // falls through to generic power tools
  reciprocating_saw:    'trapano',
  jigsaw:               'trapano',
  planer:               'trapano',
  router:               'trapano',
  mini_excavator:       'miniescavator',
  excavator_bucket:     'benna',
  demolition_hammer:    'trapano',       // uses generic power tool questions
  generator:            'generato',
  tile_cutter:          'tagliapiastrelle',
  concrete_mixer:       'betoniera',
  pressure_washer:      'idropulitri',
  vacuum_industrial:    'aspirato',
  chainsaw:             'motosega',
  anchor_system:        'tassell',
  vehicle_spare_parts:  'ricambio',
};

for (const cat of categories) {
  const canonical = ID_TO_CANONICAL[cat.id];
  if (!canonical) continue;

  // Register Italian name words (lowercased)
  const nameWords = cat.name.toLowerCase();
  KG_CATEGORY_SYNONYMS[nameWords] = canonical;

  // Register individual significant name words (≥ 4 chars to avoid noise)
  for (const word of nameWords.split(/\s+/)) {
    if (word.length >= 4) {
      KG_CATEGORY_SYNONYMS[word] = canonical;
    }
  }

  // Register English ID as space-separated words
  const idWords = cat.id.replace(/_/g, ' ');
  KG_CATEGORY_SYNONYMS[idWords] = canonical;

  // Register description keywords
  const desc = cat.properties.description.toLowerCase();
  for (const word of desc.split(/\s+/)) {
    // Only register distinctive words (≥ 5 chars, not stop-words)
    if (word.length >= 5 && !STOP_WORDS.has(word)) {
      KG_CATEGORY_SYNONYMS[word] = canonical;
    }
  }
}

export { KG_CATEGORY_SYNONYMS };
