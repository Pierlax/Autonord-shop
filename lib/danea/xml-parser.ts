/**
 * Danea EasyFatt XML Parser
 *
 * Parses XML exports from Danea EasyFatt software.
 * Supports both full and incremental sync modes.
 *
 * Uses fast-xml-parser (v4) instead of custom regex — eliminates ReDoS risk
 * and handles CDATA, attributes and nested tags correctly.
 *
 * Reference: https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/
 */

import { XMLParser } from 'fast-xml-parser';
import { ParsedProduct } from './types';

/** Maximum number of products accepted in a single payload (OOM guard) */
const MAX_PRODUCTS = 10_000;

// Danea XML Product structure (internal)
interface DaneaXMLProduct {
  InternalID?: string;
  Code?: string;
  Description?: string;
  DescriptionHTML?: string;
  Category?: string;
  Subcategory?: string;
  ProducerName?: string;
  Barcode?: string;
  Um?: string;
  NetPrice1?: string | number;
  NetPrice2?: string | number;
  GrossPrice1?: string | number;
  GrossPrice2?: string | number;
  AvailableQty?: string | number;
  OrderedQty?: string | number;
  MinStock?: string | number;
  Notes?: string;
  ImageFileName?: string;
  SupplierCode?: string;
  SupplierName?: string;
  SupplierNetPrice?: string | number;
  CustomField1?: string;
  CustomField2?: string;
  CustomField3?: string;
  CustomField4?: string;
}

// Sync mode from Danea
export type DaneaSyncMode = 'full' | 'incremental';

// Parsed result from XML
export interface DaneaXMLParseResult {
  mode: DaneaSyncMode;
  warehouse?: string;
  products: ParsedProduct[];
  updatedProducts: ParsedProduct[];
  deletedProductCodes: string[];
}

/** Shared fast-xml-parser instance (stateless, safe to reuse) */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  isArray: (_name, jpath) => jpath.endsWith('.Product'), // always array even for single product
  parseTagValue: false,   // keep all values as strings — we parse numbers ourselves
  trimValues: true,
});

/**
 * Safely coerce a value from the parsed tree to a string.
 * fast-xml-parser may return a string, a number, or an object with __cdata.
 */
function toString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val !== null && '__cdata' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).__cdata ?? '');
  }
  return String(val);
}

/**
 * Parse price string from Danea XML (dot as decimal separator).
 */
function parsePrice(priceVal: unknown): number | null {
  const str = toString(priceVal).trim();
  if (!str) return null;
  const num = parseFloat(str.replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Parse quantity from Danea XML.
 */
function parseQuantity(qtyVal: unknown): number {
  const str = toString(qtyVal).trim();
  if (!str) return 0;
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Convert a raw parsed product node to our internal ParsedProduct format.
 */
function convertToProduct(raw: DaneaXMLProduct): ParsedProduct | null {
  const code = toString(raw.Code).trim();
  if (!code) return null;

  const description = toString(raw.DescriptionHTML) || toString(raw.Notes) || null;
  const price = parsePrice(raw.GrossPrice1) ?? parsePrice(raw.NetPrice1);
  const compareAtPrice = parsePrice(raw.GrossPrice2) ?? parsePrice(raw.NetPrice2);

  return {
    daneaCode: code,
    supplierCode: toString(raw.SupplierCode).trim() || null,
    title: toString(raw.Description).trim() || code,
    description: description || null,
    category: toString(raw.Category).trim() || null,
    manufacturer: toString(raw.ProducerName).trim() || null,
    price,
    compareAtPrice,
    costPrice: parsePrice(raw.SupplierNetPrice),
    quantity: parseQuantity(raw.AvailableQty),
    unit: toString(raw.Um).trim() || 'PZ',
    barcode: toString(raw.Barcode).trim() || null,
    ecommerce: true,
    notes: toString(raw.Notes).trim() || null,
  };
}

/**
 * Normalise a section of the parsed tree to an array of product nodes.
 * fast-xml-parser returns an array when isArray matches, but falls back
 * to a plain object when only one element exists (and no override is set).
 */
function toProductArray(section: unknown): DaneaXMLProduct[] {
  if (!section) return [];
  const raw = (section as Record<string, unknown>).Product;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as DaneaXMLProduct[];
  return [raw as DaneaXMLProduct];
}

/**
 * Parse Danea EasyFatt XML content.
 *
 * @throws {Error} if the document exceeds MAX_PRODUCTS items (OOM guard).
 */
export function parseDaneaXML(xmlContent: string): DaneaXMLParseResult {
  const doc = parser.parse(xmlContent) as Record<string, unknown>;
  const root = (doc.EasyfattProducts ?? {}) as Record<string, unknown>;

  const mode: DaneaSyncMode =
    toString(root['@_Mode']).toLowerCase() === 'incremental' ? 'incremental' : 'full';

  const warehouse = toString(root['@_Warehouse']) || undefined;

  const result: DaneaXMLParseResult = {
    mode,
    warehouse,
    products: [],
    updatedProducts: [],
    deletedProductCodes: [],
  };

  if (mode === 'full') {
    const rawProducts = toProductArray(root.Products);
    if (rawProducts.length > MAX_PRODUCTS) {
      throw new Error(
        `[DaneaXML] Payload too large: ${rawProducts.length} products exceed the limit of ${MAX_PRODUCTS}. ` +
        'Split the export into smaller batches.'
      );
    }
    for (const raw of rawProducts) {
      const p = convertToProduct(raw);
      if (p) result.products.push(p);
    }
  } else {
    const rawUpdated = toProductArray(root.UpdatedProducts);
    const rawDeleted = toProductArray(root.DeletedProducts);

    const totalItems = rawUpdated.length + rawDeleted.length;
    if (totalItems > MAX_PRODUCTS) {
      throw new Error(
        `[DaneaXML] Payload too large: ${totalItems} items exceed the limit of ${MAX_PRODUCTS}.`
      );
    }

    for (const raw of rawUpdated) {
      const p = convertToProduct(raw);
      if (p) result.updatedProducts.push(p);
    }
    for (const raw of rawDeleted) {
      const code = toString(raw.Code).trim();
      if (code) result.deletedProductCodes.push(code);
    }
  }

  return result;
}

/**
 * Check if content is Danea XML format.
 * Requires the root element to be <EasyfattProducts> — not just any XML with a <Product> tag.
 */
export function isDaneaXML(content: string): boolean {
  return content.includes('<EasyfattProducts');
}
