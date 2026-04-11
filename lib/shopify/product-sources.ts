/**
 * Product Enrichment - Brand Configuration
 *
 * Provides brand metadata (official site, manual search patterns, alternative names)
 * used by ai-enrichment-v3.ts for brand-aware content generation.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BrandConfig {
  name: string;
  officialSite: string;
  supportSite?: string;
  manualSearchPattern: string;
  alternativeNames: string[];
}

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
  for (const [, config] of Object.entries(BRAND_CONFIGS)) {
    if (config.alternativeNames.some(alt =>
      alt.toLowerCase() === normalizedBrand
    )) {
      return config;
    }
  }

  return null;
}
