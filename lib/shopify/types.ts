export type Money = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number;
  sku: string;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
  compareAtPrice?: Money;
  image?: Image;
};

/**
 * Metafield type for Shopify Storefront API
 */
export type Metafield = {
  key: string;
  namespace: string;
  value: string;
  type: string;
} | null;

/**
 * FAQ item structure (stored as JSON in metafield)
 */
export type FAQ = {
  question: string;
  answer: string;
};

/**
 * Enriched product data from AI agent
 * Stored in Shopify metafields under 'custom' namespace
 */
export type EnrichedData = {
  pros: string[] | null;
  cons: string[] | null;
  faqs: FAQ[] | null;
  aiDescription: string | null;
  isEnriched: boolean;
};

export type Product = {
  id: string;
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  totalInventory: number;
  options: {
    id: string;
    name: string;
    values: string[];
  }[];
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  variants: {
    edges: {
      node: ProductVariant;
    }[];
  };
  featuredImage: Image;
  images: {
    edges: {
      node: Image;
    }[];
  };
  seo: {
    title: string;
    description: string;
  };
  tags: string[];
  updatedAt: string;
  // AI-Enriched metafields (optional, may not exist for all products)
  metafields?: {
    pros: Metafield;
    cons: Metafield;
    faqs: Metafield;
    aiDescription: Metafield;
  };
};

export type Collection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  path: string;
  updatedAt: string;
};

export type Cart = {
  id: string;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  lines: {
    edges: {
      node: {
        id: string;
        quantity: number;
        merchandise: {
          id: string;
          title: string;
          product: {
            title: string;
            handle: string;
          };
        };
      };
    }[];
  };
  totalQuantity: number;
};
