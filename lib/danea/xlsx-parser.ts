/**
 * Danea XLSX Parser
 *
 * Legge il file Excel esportato da Danea gestionale e lo converte
 * in un array di ParsedProduct usando la stessa normalizzazione del CSV parser.
 *
 * Colonne chiave lette dal file:
 *   - Cod.            → daneaCode (codice interno)
 *   - Descrizione     → title
 *   - Produttore      → manufacturer / vendor Shopify
 *   - Cod. a barre    → barcode (EAN)
 *   - Cod per il F.   → supplierCode (codice catalogo produttore → SKU Shopify)
 *   - E-commerce      → ecommerce (filtro pubblicazione)
 *   - Listino 1       → price
 *   - Q.tà in giacenza → quantity
 */

import * as XLSX from 'xlsx';
import { ParsedProduct } from './types';
import { normalizeDaneaRecord } from './csv-parser';

/**
 * Parse a Danea XLSX file from a raw buffer.
 *
 * @param buffer - ArrayBuffer or Buffer from file upload
 * @returns Array of normalized products
 */
export function parseDaneaXLSX(buffer: ArrayBuffer | Buffer): ParsedProduct[] {
  // Normalize to Node.js Buffer (SheetJS requires this for type:'buffer')
  const nodeBuffer = buffer instanceof Buffer
    ? buffer
    : Buffer.from(new Uint8Array(buffer));
  const wb = XLSX.read(nodeBuffer, { type: 'buffer' });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];

  // sheet_to_json with defval:'' returns one object per row,
  // keyed by the header row values (row 1 of the sheet).
  const records = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
    raw: false, // all values as strings (no numeric conversion)
  });

  const products: ParsedProduct[] = [];
  for (const record of records) {
    const product = normalizeDaneaRecord(record);
    if (product) products.push(product);
  }
  return products;
}

/**
 * Detect if a file buffer is an XLSX file by checking the ZIP magic bytes.
 * XLSX files start with PK\x03\x04 (ZIP format).
 */
export function isXLSXBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
