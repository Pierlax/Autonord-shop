/**
 * Benchmark Loader Module (Next.js Compatible)
 * 
 * Loads and provides access to competitor benchmarks as the "Ancora di Verità"
 * for TAYA-compliant content generation.
 * 
 * NOTE: This module uses static import instead of fs.readFileSync
 * to be compatible with Next.js client-side bundling.
 */

// Static import of benchmark data (Next.js compatible)
import benchmarkData from '../../data/competitor-benchmarks.json';

// =============================================================================
// TYPES
// =============================================================================

export interface ReferenceProduct {
  brand: string;
  model: string;
  sku: string;
  price_street: string;
  price_amazon: string;
  price_leroy_merlin: string;
  weight_kg: number;
  torque_nm?: number;
  rpm_max?: number;
  bpm_max?: number;
  ipm_max?: number;
  joule?: number;
  disc_diameter_mm?: number;
  battery_platform: string;
  brushless: boolean;
  known_strengths: string[];
  known_weaknesses: string[];
  target_users: string[];
  not_for: string[];
  last_verified: string;
  sources: string[];
}

export interface CategoryBenchmarks {
  entry_level_price: string;
  professional_price: string;
  weight_range_kg: string;
  torque_range_nm?: string;
  rpm_range?: string;
  bpm_range?: string;
  ipm_range?: string;
  joule_range?: string;
  disc_diameter_mm?: string;
}

export interface CategoryData {
  categoryName: string;
  categorySlug: string;
  benchmarks: CategoryBenchmarks;
  reference_products: ReferenceProduct[];
  comparison_matrix: Record<string, string>;
}

export interface BrandProfile {
  country: string;
  parent_company: string;
  positioning: string;
  tagline: string;
  price_tier: string;
  strengths: string[];
  weaknesses: string[];
  target_market: string;
  battery_platforms: string[];
  warranty_years: number;
  service_network_italy: string;
  forum_sentiment: string;
  taya_notes: string;
}

export interface PriceSource {
  name: string;
  url_pattern: string;
  reliability: string;
  update_frequency: string;
}

export interface BenchmarkData {
  version: string;
  lastUpdated: string;
  description: string;
  categories: Record<string, CategoryData>;
  brand_profiles: Record<string, BrandProfile>;
  price_comparison_sources: Record<string, PriceSource>;
}

// =============================================================================
// LOADER (Static Import - Next.js Compatible)
// =============================================================================

/**
 * Load benchmark data (static import, always available)
 */
export function loadBenchmarks(): BenchmarkData {
  return benchmarkData as BenchmarkData;
}

/**
 * Get benchmark context for a specific product/brand/category
 */
export function getBenchmarkContext(
  vendor: string,
  productType: string
): {
  brandProfile: BrandProfile | null;
  categoryData: CategoryData | null;
  competitors: ReferenceProduct[];
  comparisonMatrix: Record<string, string> | null;
} {
  const benchmarks = loadBenchmarks();
  
  // Find brand profile
  const brandProfile = benchmarks.brand_profiles[vendor] || null;
  
  // Find category data (try to match by slug or name)
  let categoryData: CategoryData | null = null;
  const normalizedType = normalizeCategory(productType);
  
  for (const [key, data] of Object.entries(benchmarks.categories)) {
    if (key === normalizedType || 
        data.categorySlug === normalizedType ||
        data.categoryName.toLowerCase().includes(normalizedType)) {
      categoryData = data;
      break;
    }
  }
  
  // Get competitors (excluding the current vendor if present)
  const competitors = categoryData?.reference_products.filter(
    p => p.brand.toLowerCase() !== vendor.toLowerCase()
  ) || [];
  
  return {
    brandProfile,
    categoryData,
    competitors,
    comparisonMatrix: categoryData?.comparison_matrix || null,
  };
}

/**
 * Get the main competitor for a brand
 */
export function getMainCompetitor(vendor: string): string {
  const competitorMap: Record<string, string> = {
    'Milwaukee': 'Makita',
    'Makita': 'Milwaukee',
    'DeWalt': 'Milwaukee',
    'Bosch': 'Makita',
    'Hilti': 'Milwaukee',
    'Metabo': 'Makita',
    'Festool': 'Makita',
    'HiKOKI': 'Makita',
  };
  
  return competitorMap[vendor] || 'Milwaukee';
}

/**
 * Generate comparison context string for RAG prompts
 */
export function generateComparisonContext(
  vendor: string,
  productType: string
): string {
  const { brandProfile, categoryData, competitors, comparisonMatrix } = getBenchmarkContext(vendor, productType);
  
  if (!brandProfile && !categoryData) {
    return '';
  }
  
  let context = '\n\n=== CONTESTO COMPARATIVO (Ancora di Verità) ===\n';
  
  // Brand profile
  if (brandProfile) {
    context += `\n## Profilo Brand: ${vendor}\n`;
    context += `- Posizionamento: ${brandProfile.positioning}\n`;
    context += `- Fascia prezzo: ${brandProfile.price_tier}\n`;
    context += `- Punti di forza: ${brandProfile.strengths.join(', ')}\n`;
    context += `- Punti deboli: ${brandProfile.weaknesses.join(', ')}\n`;
    context += `- Note TAYA: ${brandProfile.taya_notes}\n`;
  }
  
  // Category benchmarks
  if (categoryData) {
    context += `\n## Benchmark Categoria: ${categoryData.categoryName}\n`;
    context += `- Prezzo entry-level: ${categoryData.benchmarks.entry_level_price}\n`;
    context += `- Prezzo professionale: ${categoryData.benchmarks.professional_price}\n`;
    if (categoryData.benchmarks.torque_range_nm) {
      context += `- Range coppia: ${categoryData.benchmarks.torque_range_nm}\n`;
    }
    if (categoryData.benchmarks.weight_range_kg) {
      context += `- Range peso: ${categoryData.benchmarks.weight_range_kg} kg\n`;
    }
  }
  
  // Competitors
  if (competitors.length > 0) {
    context += `\n## Competitor Diretti:\n`;
    for (const comp of competitors.slice(0, 3)) {
      context += `\n### ${comp.brand} ${comp.model}\n`;
      context += `- Prezzo: ${comp.price_street} (Amazon: ${comp.price_amazon})\n`;
      context += `- Punti di forza: ${comp.known_strengths.slice(0, 3).join(', ')}\n`;
      context += `- Punti deboli: ${comp.known_weaknesses.slice(0, 3).join(', ')}\n`;
      context += `- Target: ${comp.target_users.join(', ')}\n`;
    }
  }
  
  // Comparison matrix
  if (comparisonMatrix) {
    context += `\n## Matrice Confronto:\n`;
    for (const [criterion, winner] of Object.entries(comparisonMatrix)) {
      context += `- ${criterion}: ${winner}\n`;
    }
  }
  
  context += '\n=== FINE CONTESTO COMPARATIVO ===\n';
  
  return context;
}

/**
 * Get price comparison data for a product
 */
export function getPriceComparison(
  vendor: string,
  productType: string,
  model?: string
): {
  ourProduct: ReferenceProduct | null;
  competitors: Array<{
    brand: string;
    model: string;
    price_street: string;
    price_amazon: string;
    price_leroy_merlin: string;
  }>;
} {
  const { categoryData } = getBenchmarkContext(vendor, productType);
  
  if (!categoryData) {
    return { ourProduct: null, competitors: [] };
  }
  
  // Find our product
  const ourProduct = categoryData.reference_products.find(
    p => p.brand.toLowerCase() === vendor.toLowerCase() &&
         (!model || p.model.toLowerCase().includes(model.toLowerCase()))
  ) || null;
  
  // Get competitor prices
  const competitors = categoryData.reference_products
    .filter(p => p.brand.toLowerCase() !== vendor.toLowerCase())
    .map(p => ({
      brand: p.brand,
      model: p.model,
      price_street: p.price_street,
      price_amazon: p.price_amazon,
      price_leroy_merlin: p.price_leroy_merlin,
    }));
  
  return { ourProduct, competitors };
}

/**
 * Normalize category name for matching
 */
function normalizeCategory(category: string): string {
  return category
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Check if benchmarks are available
 */
export function isBenchmarkDataAvailable(): boolean {
  return benchmarkData !== null && benchmarkData !== undefined;
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): string[] {
  const benchmarks = loadBenchmarks();
  return Object.keys(benchmarks.categories);
}

/**
 * Get all available brands
 */
export function getAvailableBrands(): string[] {
  const benchmarks = loadBenchmarks();
  return Object.keys(benchmarks.brand_profiles);
}
