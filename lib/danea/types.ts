/**
 * Danea Product Types
 */

// Raw columns from Danea CSV export
export interface DaneaProduct {
  code: string;
  description: string;
  category: string;
  price1: string;
  price2: string;
  price3: string;
  price4: string;
  manufacturer: string;
  quantity: string;
  barcode: string;
  ecommerce: string;
  notes: string;
  unit: string;
  vat: string;
  stockStatus: string;
  supplierPrice: string;
  supplier: string;
}

// Parsed and normalized product ready for Shopify
export interface ParsedProduct {
  daneaCode: string;
  title: string;
  description: string | null;
  category: string | null;
  manufacturer: string | null;
  price: number | null;
  compareAtPrice: number | null;
  costPrice: number | null;
  quantity: number;
  unit: string;
  barcode: string | null;
  ecommerce: boolean;
  notes: string | null;
}

// Shopify product structure for Admin API
export interface ShopifyProductInput {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  status?: 'active' | 'draft' | 'archived';
  tags?: string;
  variants?: Array<{
    price?: string;
    compare_at_price?: string;
    sku?: string;
    barcode?: string;
    inventory_quantity?: number;
    inventory_management?: string;
  }>;
  images?: Array<{
    src: string;
  }>;
}

// Sync result for a single product
export interface ProductSyncResult {
  daneaCode: string;
  success: boolean;
  shopifyId?: string;
  action: 'created' | 'updated' | 'skipped';
  error?: string;
}

// Overall sync result
export interface SyncResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  results: ProductSyncResult[];
  errors: string[];
}
