/**
 * Danea Sync Module
 * 
 * Handles synchronization between Danea gestionale and Shopify.
 * Flow: Danea CSV → Parse → Shopify Admin API → Create/Update Products
 */

export { parseDaneaCSV, exportOrdersToCSV } from './csv-parser';
export { syncProductsToShopify, syncSingleProduct, type SyncResult } from './shopify-sync';
export { type DaneaProduct, type ParsedProduct } from './types';
