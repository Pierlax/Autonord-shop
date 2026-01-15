/**
 * Product Enrichment - Source Hierarchy Configuration
 * 
 * Defines the trusted sources and their priority for product data enrichment.
 * Higher priority sources override lower priority ones in case of conflicts.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DataSource {
  name: string;
  type: 'official' | 'manual' | 'retailer' | 'review' | 'forum';
  priority: number; // 1-10, higher = more trusted
  url?: string;
  language: 'it' | 'en' | 'both';
}

export interface BrandConfig {
  name: string;
  officialSite: string;
  supportSite?: string;
  manualSearchPattern: string;
  alternativeNames: string[];
}

export interface DataConflict {
  field: string;
  values: { source: string; value: string; priority: number }[];
  resolved: boolean;
  resolvedValue?: string;
  requiresManualCheck: boolean;
  notes?: string;
}

export interface EnrichmentSource {
  name: string;
  url: string;
  dataType: 'specs' | 'reviews' | 'accessories' | 'problems';
  reliability: number; // 0-1
  extractedData: Record<string, any>;
  conflicts: DataConflict[];
}

// =============================================================================
// SOURCE HIERARCHY - TECHNICAL SPECS
// =============================================================================

/**
 * Priority hierarchy for technical specifications
 * Rule: Official Site > Manual PDF > Trusted Retailer
 */
export const SPEC_SOURCE_HIERARCHY: DataSource[] = [
  // Tier 1 - Official Sources (Priority 10)
  {
    name: 'Sito Ufficiale Produttore',
    type: 'official',
    priority: 10,
    language: 'both',
  },
  {
    name: 'Manuale PDF Ufficiale',
    type: 'manual',
    priority: 9,
    language: 'both',
  },
  
  // Tier 2 - Trusted Retailers (Priority 7-8)
  {
    name: 'Amazon (scheda tecnica)',
    type: 'retailer',
    priority: 8,
    url: 'amazon.it',
    language: 'it',
  },
  {
    name: 'Fixami',
    type: 'retailer',
    priority: 7,
    url: 'fixami.it',
    language: 'it',
  },
  {
    name: 'Rotopino',
    type: 'retailer',
    priority: 7,
    url: 'rotopino.it',
    language: 'it',
  },
  {
    name: 'Toolnation',
    type: 'retailer',
    priority: 7,
    url: 'toolnation.it',
    language: 'it',
  },
  
  // Tier 3 - Review Sites (Priority 5-6)
  {
    name: 'Pro Tool Reviews',
    type: 'review',
    priority: 6,
    url: 'protoolreviews.com',
    language: 'en',
  },
  {
    name: 'ToolGuyd',
    type: 'review',
    priority: 6,
    url: 'toolguyd.com',
    language: 'en',
  },
];

// =============================================================================
// BRAND CONFIGURATIONS
// =============================================================================

export const BRAND_CONFIGS: Record<string, BrandConfig> = {
  milwaukee: {
    name: 'Milwaukee',
    officialSite: 'https://www.milwaukeetool.eu/it-it/',
    supportSite: 'https://www.milwaukeetool.eu/it-it/support/',
    manualSearchPattern: 'site:milwaukeetool.eu filetype:pdf {model}',
    alternativeNames: ['Milwaukee Tool', 'Milwaukee Electric Tool'],
  },
  makita: {
    name: 'Makita',
    officialSite: 'https://www.makita.it/',
    supportSite: 'https://www.makita.it/supporto/',
    manualSearchPattern: 'site:makita.it filetype:pdf {model}',
    alternativeNames: ['Makita Italia'],
  },
  dewalt: {
    name: 'DeWalt',
    officialSite: 'https://www.dewalt.it/',
    supportSite: 'https://www.dewalt.it/support/',
    manualSearchPattern: 'site:dewalt.it filetype:pdf {model}',
    alternativeNames: ['DeWALT', 'DEWALT'],
  },
  bosch: {
    name: 'Bosch',
    officialSite: 'https://www.bosch-professional.com/it/it/',
    supportSite: 'https://www.bosch-professional.com/it/it/service/',
    manualSearchPattern: 'site:bosch-professional.com filetype:pdf {model}',
    alternativeNames: ['Bosch Professional', 'Bosch Blue'],
  },
  hilti: {
    name: 'Hilti',
    officialSite: 'https://www.hilti.it/',
    supportSite: 'https://www.hilti.it/content/hilti/W1/IT/it/services.html',
    manualSearchPattern: 'site:hilti.it filetype:pdf {model}',
    alternativeNames: [],
  },
  metabo: {
    name: 'Metabo',
    officialSite: 'https://www.metabo.com/it/it/',
    manualSearchPattern: 'site:metabo.com filetype:pdf {model}',
    alternativeNames: ['Metabo HPT'],
  },
  festool: {
    name: 'Festool',
    officialSite: 'https://www.festool.it/',
    manualSearchPattern: 'site:festool.it filetype:pdf {model}',
    alternativeNames: [],
  },
  hikoki: {
    name: 'HiKOKI',
    officialSite: 'https://hikoki-powertools.it/',
    manualSearchPattern: 'site:hikoki-powertools.it filetype:pdf {model}',
    alternativeNames: ['Hitachi', 'HiKoki'],
  },
};

// =============================================================================
// REVIEW SOURCES - For "Parere Autonord" & Pro/Contro
// =============================================================================

export const REVIEW_SOURCES = {
  // Balanced reviews (3-4 stars) are most valuable
  amazon: {
    name: 'Amazon Italia',
    url: 'amazon.it',
    searchPattern: '{product} site:amazon.it',
    targetRating: [3, 4], // Focus on balanced reviews
    language: 'it',
  },
  amazonCom: {
    name: 'Amazon US',
    url: 'amazon.com',
    searchPattern: '{product} site:amazon.com',
    targetRating: [3, 4],
    language: 'en',
  },
  
  // Forums for real-world problems
  redditTools: {
    name: 'Reddit r/Tools',
    url: 'reddit.com/r/Tools',
    searchPattern: '{product} (problem OR issue OR broke OR disappointed) site:reddit.com/r/Tools',
    language: 'en',
  },
  redditBrand: {
    name: 'Reddit Brand Subs',
    searchPattern: '{product} (problem OR issue) site:reddit.com/r/{brand}',
    language: 'en',
  },
};

// =============================================================================
// COMPETITOR SOURCES - For Accessory Recommendations
// =============================================================================

export const COMPETITOR_SOURCES = {
  fixami: {
    name: 'Fixami',
    url: 'https://www.fixami.it',
    searchPattern: '{sku} site:fixami.it',
    accessorySelector: '.product-accessories, .related-products',
  },
  rotopino: {
    name: 'Rotopino',
    url: 'https://www.rotopino.it',
    searchPattern: '{sku} site:rotopino.it',
    accessorySelector: '.accessories, .complementary',
  },
  toolnation: {
    name: 'Toolnation',
    url: 'https://www.toolnation.it',
    searchPattern: '{sku} site:toolnation.it',
    accessorySelector: '.accessories-list',
  },
  amazon: {
    name: 'Amazon',
    url: 'https://www.amazon.it',
    searchPattern: '{sku} site:amazon.it',
    accessorySelector: '#aplus_feature_div, .a-carousel',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get brand configuration from product name or vendor
 */
export function getBrandConfig(brandName: string): BrandConfig | null {
  const normalizedBrand = brandName.toLowerCase().trim();
  
  // Direct match
  if (BRAND_CONFIGS[normalizedBrand]) {
    return BRAND_CONFIGS[normalizedBrand];
  }
  
  // Check alternative names
  for (const [key, config] of Object.entries(BRAND_CONFIGS)) {
    if (config.alternativeNames.some(alt => 
      alt.toLowerCase() === normalizedBrand
    )) {
      return config;
    }
  }
  
  return null;
}

/**
 * Get official product URL for a brand
 */
export function getOfficialProductUrl(brand: string, model: string): string | null {
  const config = getBrandConfig(brand);
  if (!config) return null;
  
  // Construct search URL for official site
  const searchQuery = encodeURIComponent(model);
  return `${config.officialSite}search/?q=${searchQuery}`;
}

/**
 * Get manual search query for a product
 */
export function getManualSearchQuery(brand: string, model: string): string | null {
  const config = getBrandConfig(brand);
  if (!config) return null;
  
  return config.manualSearchPattern.replace('{model}', model);
}

/**
 * Resolve data conflicts using priority hierarchy
 */
export function resolveDataConflict(conflict: DataConflict): DataConflict {
  if (conflict.values.length === 0) {
    return { ...conflict, resolved: false, requiresManualCheck: true };
  }
  
  if (conflict.values.length === 1) {
    return {
      ...conflict,
      resolved: true,
      resolvedValue: conflict.values[0].value,
      requiresManualCheck: false,
    };
  }
  
  // Sort by priority (highest first)
  const sorted = [...conflict.values].sort((a, b) => b.priority - a.priority);
  
  // Check if top priority source has significantly higher priority
  const topPriority = sorted[0].priority;
  const secondPriority = sorted[1]?.priority || 0;
  
  if (topPriority - secondPriority >= 2) {
    // Clear winner - use highest priority source
    return {
      ...conflict,
      resolved: true,
      resolvedValue: sorted[0].value,
      requiresManualCheck: false,
      notes: `Resolved using ${sorted[0].source} (priority ${topPriority})`,
    };
  }
  
  // Close priorities - flag for manual check
  return {
    ...conflict,
    resolved: false,
    requiresManualCheck: true,
    notes: `Conflicting data from ${sorted.map(s => s.source).join(', ')}. Values: ${sorted.map(s => `${s.source}=${s.value}`).join(', ')}`,
  };
}

/**
 * Check if a spec value is within reasonable range
 */
export function validateSpecValue(
  field: string,
  value: string | number,
  productType: string
): { valid: boolean; warning?: string } {
  // Define reasonable ranges for common specs
  const ranges: Record<string, Record<string, { min: number; max: number }>> = {
    'avvitatore': {
      'coppia': { min: 10, max: 2000 }, // Nm
      'velocità': { min: 100, max: 5000 }, // RPM
      'peso': { min: 0.5, max: 5 }, // kg
      'voltaggio': { min: 10.8, max: 54 }, // V
    },
    'trapano': {
      'coppia': { min: 20, max: 150 }, // Nm
      'velocità': { min: 100, max: 3000 }, // RPM
      'peso': { min: 1, max: 8 }, // kg
    },
    'smerigliatrice': {
      'potenza': { min: 500, max: 2500 }, // W
      'velocità': { min: 2000, max: 12000 }, // RPM
      'disco': { min: 100, max: 230 }, // mm
    },
  };
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return { valid: true }; // Non-numeric values pass through
  }
  
  const productRanges = ranges[productType.toLowerCase()];
  if (!productRanges) {
    return { valid: true }; // Unknown product type
  }
  
  const fieldRange = productRanges[field.toLowerCase()];
  if (!fieldRange) {
    return { valid: true }; // Unknown field
  }
  
  if (numValue < fieldRange.min || numValue > fieldRange.max) {
    return {
      valid: false,
      warning: `Value ${numValue} for ${field} is outside expected range (${fieldRange.min}-${fieldRange.max})`,
    };
  }
  
  return { valid: true };
}

/**
 * Generate search queries for balanced reviews
 */
export function getBalancedReviewQueries(productName: string, brand: string): string[] {
  return [
    // Amazon balanced reviews
    `"${productName}" site:amazon.it`,
    `"${productName}" recensione site:amazon.it`,
    
    // Reddit problems
    `${productName} problem site:reddit.com/r/Tools`,
    `${productName} issue site:reddit.com/r/Tools`,
    `${brand} ${productName.split(' ').slice(-1)[0]} disappointed site:reddit.com`,
    
    // Italian forums
    `${productName} problema site:plcforum.it`,
    `${productName} difetto site:forum-macchine.it`,
  ];
}

/**
 * Generate search queries for accessory recommendations
 */
export function getAccessoryQueries(sku: string, productName: string): string[] {
  return [
    `${sku} accessori site:fixami.it`,
    `${sku} site:rotopino.it`,
    `${productName} accessori compatibili`,
    `${productName} kit completo`,
  ];
}
