import { Product, Collection, EnrichedData, FAQ } from './types';
import { loggers } from '@/lib/logger';

const log = loggers.shopify;

const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const storefrontAccessToken = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN;

async function ShopifyData(query: string, variables?: object) {
  if (!domain || !storefrontAccessToken) {
    log.warn("Missing Shopify API keys");
    return null;
  }

  const url = `https://${domain}/api/2024-01/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store', // Ensure fresh data for B2B stock
    });

    if (!response.ok) {
      log.error(`Shopify API HTTP Error: ${response.status}`);
      return null;
    }

    const json = await response.json();

    if (json.errors) {
      log.error('Shopify API Errors:', json.errors);
      return null;
    }

    return json.data;
  } catch (error) {
    log.error('Shopify Fetch Error:', error);
    return null;
  }
}

// Fragments - Updated to include metafields for AI-enriched content
const productFragment = `
  fragment ProductFragment on Product {
    id
    handle
    availableForSale
    title
    description
    descriptionHtml
    vendor
    productType
    totalInventory
    options {
      id
      name
      values
    }
    priceRange {
      maxVariantPrice {
        amount
        currencyCode
      }
      minVariantPrice {
        amount
        currencyCode
      }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          availableForSale
          quantityAvailable
          sku
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          image {
            url
            altText
            width
            height
          }
        }
      }
    }
    featuredImage {
      url
      altText
      width
      height
    }
    images(first: 10) {
      edges {
        node {
          url
          altText
          width
          height
        }
      }
    }
    seo {
      title
      description
    }
    tags
    updatedAt
    # AI-Enriched Metafields (custom namespace)
    pros: metafield(namespace: "custom", key: "pros") {
      key
      namespace
      value
      type
    }
    cons: metafield(namespace: "custom", key: "cons") {
      key
      namespace
      value
      type
    }
    faqs: metafield(namespace: "custom", key: "faqs") {
      key
      namespace
      value
      type
    }
    aiDescription: metafield(namespace: "custom", key: "ai_description") {
      key
      namespace
      value
      type
    }
  }
`;

/**
 * Parse metafields from Shopify response into structured EnrichedData
 */
export function parseEnrichedData(product: any): EnrichedData {
  const result: EnrichedData = {
    pros: null,
    cons: null,
    faqs: null,
    aiDescription: null,
    isEnriched: false,
  };

  try {
    // Parse pros (JSON array of strings)
    if (product.pros?.value) {
      const parsed = JSON.parse(product.pros.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        result.pros = parsed;
        result.isEnriched = true;
      }
    }

    // Parse cons (JSON array of strings)
    if (product.cons?.value) {
      const parsed = JSON.parse(product.cons.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        result.cons = parsed;
        result.isEnriched = true;
      }
    }

    // Parse FAQs (JSON array of {question, answer} objects)
    if (product.faqs?.value) {
      const parsed = JSON.parse(product.faqs.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        result.faqs = parsed as FAQ[];
        result.isEnriched = true;
      }
    }

    // Parse AI description (plain text)
    if (product.aiDescription?.value) {
      result.aiDescription = product.aiDescription.value;
      result.isEnriched = true;
    }
  } catch (error) {
    log.error('Error parsing enriched data:', error);
  }

  return result;
}

export async function getProducts(sortKey = 'RELEVANCE', reverse = false, query?: string): Promise<Product[]> {
  const res = await ShopifyData(`
    query getProducts($sortKey: ProductSortKeys, $reverse: Boolean, $query: String) {
      products(first: 100, sortKey: $sortKey, reverse: $reverse, query: $query) {
        edges {
          node {
            ...ProductFragment
          }
        }
      }
    }
    ${productFragment}
  `, { sortKey, reverse, query });

  return res?.products?.edges?.map((edge: any) => edge.node) || [];
}

export async function getProductByHandle(handle: string): Promise<Product | undefined> {
  const res = await ShopifyData(`
    query getProductByHandle($handle: String!) {
      product(handle: $handle) {
        ...ProductFragment
      }
    }
    ${productFragment}
  `, { handle });

  return res?.product;
}

export async function createCheckout(variantId: string, quantity: number): Promise<string | null> {
  const query = `
    mutation checkoutCreate($input: CheckoutCreateInput!) {
      checkoutCreate(input: $input) {
        checkout {
          webUrl
        }
        checkoutUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      lineItems: [{ variantId, quantity }]
    }
  };

  const res = await ShopifyData(query, variables);
  
  if (!res) return null;

  if (res.checkoutCreate.checkoutUserErrors.length > 0) {
    log.error("Checkout Errors:", res.checkoutCreate.checkoutUserErrors);
    return null;
  }

  return res.checkoutCreate.checkout.webUrl;
}

// Re-export parseEnrichedData for use in components
export { parseEnrichedData as getEnrichedData };

// ============================================================================
// RAG Enterprise Paper Implementations
// ============================================================================

// Provenance Tracking (Hallucination Control)
export {
  ProvenanceGraphBuilder,
  FactProvenanceTracker,
  generateContentProvenance,
  formatProvenanceDisplay,
  generateProvenanceReport,
  type FactProvenance,
  type ContentProvenance,
  type SourceAttribution,
} from './provenance-tracking';

// Knowledge Graph (Hybrid RAG)
export {
  PowerToolKnowledgeGraph,
  getKnowledgeGraph,
  type KGNode,
  type KGEdge,
  type QueryResult,
} from './knowledge-graph';

// Business Impact Metrics
export {
  getMetricsStore,
  createGenerationMetrics,
  formatBusinessImpactReport,
  type ContentGenerationMetrics,
  type ErrorMetrics,
  type UserFeedbackMetrics,
  type BusinessImpactReport,
} from './business-metrics';

// ============================================================================
// UniversalRAG Paper Implementations
// ============================================================================

// Source Type Router (Modality-Aware Routing)
export {
  ruleBasedRoute,
  llmBasedRoute,
  ensembleRoute,
  routeProductQuery,
  getOptimizedQueries,
  ROUTER_DEFAULT_CONFIG,
  type SourceType,
  type QueryIntent,
  type RoutingDecision,
  type RouterConfig,
} from './source-router';

// Granularity-Aware Retrieval
export {
  detectGranularityRules,
  detectGranularityLLM,
  adaptGranularity,
  chunkByGranularity,
  scoreChunks,
  selectChunksWithinBudget,
  determineGranularity,
  GRANULARITY_DEFAULT_CONFIG,
  type GranularityLevel,
  type QueryComplexity,
  type GranularityDecision,
  type GranularityConfig,
} from './granularity-retrieval';

// No-Retrieval Detection
export {
  detectRetrievalNeedRules,
  detectRetrievalNeedLLM,
  generateParametricResponse,
  decideRetrievalStrategy,
  canUseCachedKnowledge,
  estimateCostSavings,
  type RetrievalNeed,
  type KnowledgeType,
  type RetrievalDecision,
} from './no-retrieval-detector';

// Proactive Cross-Source Fusion
export {
  createFusionPlan,
  executeFusionPlan,
  optimizeFusionPlan,
  generateFusionReport,
  type EvidenceType,
  type FusionStrategy,
  type FusionPlan,
  type SourceGroup,
  type FusionResult,
  type CombinedEvidence,
  type Conflict,
} from './proactive-fusion';

// UniversalRAG Integrated Pipeline
export {
  UniversalRAGPipeline,
  enrichWithUniversalRAG,
  getPipelineStats,
  UNIVERSAL_RAG_DEFAULT_CONFIG,
  type UniversalRAGConfig,
  type UniversalRAGResult,
} from './universal-rag';
