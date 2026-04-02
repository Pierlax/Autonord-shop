/**
 * Danea Product Types
 */

import { z } from 'zod';

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
  /** Codice del produttore/fornitore (es. "4933451900" per Milwaukee) — usato come SKU in Shopify */
  supplierCode: string;
}

// Zod schema for runtime validation of parsed products
export const ParsedProductSchema = z.object({
  daneaCode:      z.string().min(1, 'daneaCode is required'),
  supplierCode:   z.string().nullable(),
  title:          z.string().min(1, 'title is required'),
  description:    z.string().nullable(),
  category:       z.string().nullable(),
  manufacturer:   z.string().nullable(),
  price:          z.number().min(0).nullable(),
  compareAtPrice: z.number().min(0).nullable(),
  costPrice:      z.number().min(0).nullable(),
  quantity:       z.number().int().min(0),
  unit:           z.string(),
  // EAN-8, EAN-13, or any barcode up to 14 digits
  barcode:        z.string().regex(/^\d{1,14}$/).nullable(),
  ecommerce:      z.boolean(),
  notes:          z.string().nullable(),
});

// Parsed and normalized product ready for Shopify
export type ParsedProduct = z.infer<typeof ParsedProductSchema>;

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
  total: number;           // Products processed in this batch
  totalEligible?: number;  // Total eligible products in the full file
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  hasMore?: boolean;       // Whether more batches remain
  nextOffset?: number | null;
  results: ProductSyncResult[];
  errors: string[];
}
