/**
 * Danea CSV Parser
 * 
 * Parses CSV exports from Danea gestionale software.
 * Handles both comma and semicolon delimiters.
 */

import { loggers } from '@/lib/logger';
import { DaneaProduct, ParsedProduct } from './types';

const log = loggers.sync;

// Mapping of Danea column names to our internal keys
const DANEA_COLUMN_MAP: Record<string, keyof DaneaProduct> = {
  "Cod.": "code",
  "Codice": "code",
  "Code": "code",
  "Descrizione": "description",
  "Description": "description",
  "Categoria": "category",
  "Category": "category",
  "Listino 1": "price1",
  "Prezzo": "price1",
  "Price": "price1",
  "Listino 2": "price2",
  "Listino 3": "price3",
  "Listino 4": "price4",
  "Produttore": "manufacturer",
  "Manufacturer": "manufacturer",
  "Brand": "manufacturer",
  "Q.tà in giacenza": "quantity",
  "Quantità": "quantity",
  "Quantity": "quantity",
  "Stock": "quantity",
  "Cod. a barre": "barcode",
  "Barcode": "barcode",
  "EAN": "barcode",
  "E-commerce": "ecommerce",
  "Ecommerce": "ecommerce",
  "Web": "ecommerce",
  "Note": "notes",
  "Notes": "notes",
  "U.m.": "unit",
  "Unità": "unit",
  "Unit": "unit",
  "Iva": "vat",
  "VAT": "vat",
  "Stato magazz.": "stockStatus",
  "Prezzo forn.": "supplierPrice",
  "Costo": "supplierPrice",
  "Cost": "supplierPrice",
  "Fornitore": "supplier",
  "Supplier": "supplier",
  // Codice del produttore/fornitore — es. "4933451900" per Milwaukee
  // Questo è il vero SKU di catalogo, usato dalla pipeline AI per le ricerche web
  "Cod per il F.": "supplierCode",
  "Cod. per il F.": "supplierCode",
  "Codice fornitore": "supplierCode",
  "Supplier Code": "supplierCode",
};

/**
 * Parse price string to number
 * Handles Italian format (1.234,56) and international (1,234.56)
 */
function parsePrice(priceStr: string): number | null {
  if (!priceStr || priceStr.trim() === '') return null;
  
  // Remove currency symbols and spaces
  let cleaned = priceStr
    .replace(/[€$£\s]/g, "")
    .trim();
  
  // Detect format: if comma is after dot, it's Italian format
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // Italian format: 1.234,56 → 1234.56
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // International format: 1,234.56 → 1234.56
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Only comma present, assume decimal separator
    cleaned = cleaned.replace(",", ".");
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse quantity string to integer
 */
function parseQuantity(qtyStr: string): number {
  if (!qtyStr || qtyStr.trim() === '') return 0;
  const num = parseInt(qtyStr.replace(/[^\d-]/g, ""), 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Check if e-commerce flag is enabled
 */
function isEcommerceEnabled(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return ['sì', 'si', 'yes', '1', 'true', 'x', '✓', '✔'].includes(normalized);
}

/**
 * Simple CSV parser that handles both comma and semicolon delimiters
 */
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Detect delimiter from header line
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  
  // Parse header
  const headers = parseCSVLine(headerLine, delimiter);
  
  // Parse data rows
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    if (values.length === 0) continue;
    
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header.trim()] = values[index]?.trim() || '';
    });
    records.push(record);
  }
  
  return records;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  
  return values;
}

/**
 * Normalize a single row (already keyed by column name) into a ParsedProduct.
 * Used by both the CSV and XLSX parsers.
 */
export function normalizeDaneaRecord(record: Record<string, string>): ParsedProduct | null {
  const danea: Partial<DaneaProduct> = {};

  for (const [col, key] of Object.entries(DANEA_COLUMN_MAP)) {
    if (record[col] !== undefined) {
      danea[key] = record[col];
    }
  }

  if (!danea.code || danea.code.trim() === '') return null;

  return {
    daneaCode: danea.code.trim(),
    supplierCode: danea.supplierCode?.trim() || null,
    title: danea.description?.trim() || danea.code.trim(),
    description: danea.notes?.trim() || null,
    category: danea.category?.trim() || null,
    manufacturer: danea.manufacturer?.trim() || null,
    price: parsePrice(danea.price1 || ''),
    compareAtPrice: parsePrice(danea.price2 || ''),
    costPrice: parsePrice(danea.supplierPrice || ''),
    quantity: parseQuantity(danea.quantity || ''),
    unit: danea.unit?.trim() || 'PZ',
    barcode: danea.barcode?.trim() || null,
    ecommerce: isEcommerceEnabled(danea.ecommerce || ''),
    notes: danea.notes?.trim() || null,
  };
}

/**
 * Decode a file buffer, trying UTF-8 first and falling back to Windows-1252.
 * Danea exports are frequently Windows-1252 on Italian Windows systems.
 */
export function decodeFileBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // UTF-8 failed — decode as Windows-1252 (common for Italian Danea exports)
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Parse Danea CSV content into normalized products.
 * Deduplicates by daneaCode — last record wins (with a warning log).
 */
const MAX_CSV_RECORDS = 10_000;

export function parseDaneaCSV(csvContent: string): ParsedProduct[] {
  const records = parseCSV(csvContent);
  const products: ParsedProduct[] = [];
  const seenCodes = new Map<string, number>(); // daneaCode → index in products[]

  if (records.length > MAX_CSV_RECORDS) {
    log.warn(`[DaneaCSV] Payload exceeds MAX_CSV_RECORDS (${records.length} > ${MAX_CSV_RECORDS}) — truncating`);
  }

  for (const record of records.slice(0, MAX_CSV_RECORDS)) {
    const product = normalizeDaneaRecord(record);
    if (!product) continue;

    const existingIndex = seenCodes.get(product.daneaCode);
    if (existingIndex !== undefined) {
      log.warn(`[DaneaCSV] Duplicate daneaCode "${product.daneaCode}" — overwriting previous entry with latest row`);
      products[existingIndex] = product;
    } else {
      seenCodes.set(product.daneaCode, products.length);
      products.push(product);
    }
  }
  return products;
}

/**
 * Export orders to CSV format for Danea import
 */
export function exportOrdersToCSV(orders: Array<{
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalPrice: string;
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}>): string {
  const headers = [
    "Numero Ordine",
    "Cliente",
    "Email",
    "Totale",
    "Codice Prodotto",
    "Descrizione",
    "Quantità",
    "Prezzo Unitario",
  ];

  const rows: string[][] = [headers];

  for (const order of orders) {
    for (const item of order.items) {
      rows.push([
        order.orderNumber,
        order.customerName,
        order.customerEmail,
        order.totalPrice,
        item.sku,
        item.title,
        item.quantity.toString(),
        item.price,
      ]);
    }
  }

  // Use semicolon delimiter for Italian Excel compatibility
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
}
