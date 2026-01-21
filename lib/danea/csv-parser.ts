/**
 * Danea CSV Parser
 * 
 * Parses CSV exports from Danea gestionale software.
 * Handles both comma and semicolon delimiters.
 */

import { DaneaProduct, ParsedProduct } from './types';

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
 * Parse Danea CSV content into normalized products
 */
export function parseDaneaCSV(csvContent: string): ParsedProduct[] {
  const records = parseCSV(csvContent);
  const products: ParsedProduct[] = [];

  for (const record of records) {
    // Map Danea columns to our structure
    const danea: Partial<DaneaProduct> = {};
    
    for (const [csvCol, ourKey] of Object.entries(DANEA_COLUMN_MAP)) {
      if (record[csvCol] !== undefined) {
        danea[ourKey] = record[csvCol];
      }
    }

    // Skip if no code
    if (!danea.code || danea.code.trim() === '') continue;

    const product: ParsedProduct = {
      daneaCode: danea.code.trim(),
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

    products.push(product);
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
