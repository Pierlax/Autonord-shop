/**
 * Danea Sync Module
 * 
 * Handles synchronization between Danea gestionale and Shopify.
 * Flow: Danea CSV → Parse → Shopify Admin API → Create/Update Products
 */

export { parseDaneaCSV, exportOrdersToCSV } from './csv-parser';
export { parseDaneaXML, isDaneaXML, type DaneaXMLParseResult, type DaneaSyncMode } from './xml-parser';
export { syncProductsToShopify, syncSingleProduct } from './shopify-sync';
export { type DaneaProduct, type ParsedProduct, type SyncResult } from './types';
