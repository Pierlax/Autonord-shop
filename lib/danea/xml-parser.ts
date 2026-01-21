/**
 * Danea EasyFatt XML Parser
 * 
 * Parses XML exports from Danea EasyFatt software.
 * Supports both full and incremental sync modes.
 * 
 * Reference: https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/
 */

import { ParsedProduct } from './types';

// Danea XML Product structure
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
  NetPrice1?: string;
  NetPrice2?: string;
  GrossPrice1?: string;
  GrossPrice2?: string;
  AvailableQty?: string;
  OrderedQty?: string;
  MinStock?: string;
  Notes?: string;
  ImageFileName?: string;
  SupplierCode?: string;
  SupplierName?: string;
  SupplierNetPrice?: string;
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

/**
 * Simple XML parser - extracts text content between tags
 */
function getTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Get attribute value from a tag
 */
function getAttributeValue(xml: string, tagName: string, attrName: string): string | null {
  const tagRegex = new RegExp(`<${tagName}[^>]*>`, 'i');
  const tagMatch = xml.match(tagRegex);
  if (!tagMatch) return null;
  
  const attrRegex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const attrMatch = tagMatch[0].match(attrRegex);
  return attrMatch ? attrMatch[1] : null;
}

/**
 * Extract all Product elements from XML section
 */
function extractProducts(xml: string, sectionTag: string): string[] {
  const sectionRegex = new RegExp(`<${sectionTag}[^>]*>([\\s\\S]*?)</${sectionTag}>`, 'i');
  const sectionMatch = xml.match(sectionRegex);
  if (!sectionMatch) return [];
  
  const sectionContent = sectionMatch[1];
  const productRegex = /<Product[^>]*>([\s\S]*?)<\/Product>/gi;
  const products: string[] = [];
  let match;
  
  while ((match = productRegex.exec(sectionContent)) !== null) {
    products.push(match[0]);
  }
  
  return products;
}

/**
 * Parse a single Product XML element
 */
function parseProductXML(productXml: string): DaneaXMLProduct {
  const product: DaneaXMLProduct = {};
  
  const fields = [
    'InternalID', 'Code', 'Description', 'DescriptionHTML', 
    'Category', 'Subcategory', 'ProducerName', 'Barcode', 'Um',
    'NetPrice1', 'NetPrice2', 'GrossPrice1', 'GrossPrice2',
    'AvailableQty', 'OrderedQty', 'MinStock', 'Notes', 'ImageFileName',
    'SupplierCode', 'SupplierName', 'SupplierNetPrice',
    'CustomField1', 'CustomField2', 'CustomField3', 'CustomField4'
  ];
  
  for (const field of fields) {
    const value = getTagContent(productXml, field);
    if (value !== null) {
      (product as Record<string, string>)[field] = value;
    }
  }
  
  return product;
}

/**
 * Parse price string from Danea XML
 */
function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr || priceStr.trim() === '') return null;
  
  // Danea uses dot as decimal separator in XML
  const num = parseFloat(priceStr.replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Parse quantity from Danea XML
 */
function parseQuantity(qtyStr: string | undefined): number {
  if (!qtyStr || qtyStr.trim() === '') return 0;
  const num = parseInt(qtyStr, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Convert Danea XML product to our ParsedProduct format
 */
function convertToProduct(xmlProduct: DaneaXMLProduct): ParsedProduct | null {
  // Code is required
  if (!xmlProduct.Code || xmlProduct.Code.trim() === '') {
    return null;
  }
  
  // Use HTML description if available, fallback to plain text
  const description = xmlProduct.DescriptionHTML || xmlProduct.Notes || null;
  
  // Use GrossPrice (IVA inclusa) if available, otherwise NetPrice
  const price = parsePrice(xmlProduct.GrossPrice1) || parsePrice(xmlProduct.NetPrice1);
  const compareAtPrice = parsePrice(xmlProduct.GrossPrice2) || parsePrice(xmlProduct.NetPrice2);
  
  return {
    daneaCode: xmlProduct.Code.trim(),
    title: xmlProduct.Description?.trim() || xmlProduct.Code.trim(),
    description,
    category: xmlProduct.Category?.trim() || null,
    manufacturer: xmlProduct.ProducerName?.trim() || null,
    price,
    compareAtPrice,
    costPrice: parsePrice(xmlProduct.SupplierNetPrice),
    quantity: parseQuantity(xmlProduct.AvailableQty),
    unit: xmlProduct.Um?.trim() || 'PZ',
    barcode: xmlProduct.Barcode?.trim() || null,
    ecommerce: true, // If sent via XML, assume it's for e-commerce
    notes: xmlProduct.Notes?.trim() || null,
  };
}

/**
 * Parse Danea EasyFatt XML content
 */
export function parseDaneaXML(xmlContent: string): DaneaXMLParseResult {
  const result: DaneaXMLParseResult = {
    mode: 'full',
    products: [],
    updatedProducts: [],
    deletedProductCodes: [],
  };
  
  // Get sync mode
  const mode = getAttributeValue(xmlContent, 'EasyfattProducts', 'Mode');
  if (mode === 'incremental') {
    result.mode = 'incremental';
  }
  
  // Get warehouse if present
  const warehouse = getAttributeValue(xmlContent, 'EasyfattProducts', 'Warehouse');
  if (warehouse) {
    result.warehouse = warehouse;
  }
  
  if (result.mode === 'full') {
    // Full sync: all products in <Products> section
    const productXmls = extractProducts(xmlContent, 'Products');
    
    for (const productXml of productXmls) {
      const xmlProduct = parseProductXML(productXml);
      const product = convertToProduct(xmlProduct);
      if (product) {
        result.products.push(product);
      }
    }
  } else {
    // Incremental sync: updated and deleted products
    const updatedXmls = extractProducts(xmlContent, 'UpdatedProducts');
    const deletedXmls = extractProducts(xmlContent, 'DeletedProducts');
    
    for (const productXml of updatedXmls) {
      const xmlProduct = parseProductXML(productXml);
      const product = convertToProduct(xmlProduct);
      if (product) {
        result.updatedProducts.push(product);
      }
    }
    
    for (const productXml of deletedXmls) {
      const xmlProduct = parseProductXML(productXml);
      if (xmlProduct.Code) {
        result.deletedProductCodes.push(xmlProduct.Code.trim());
      }
    }
  }
  
  return result;
}

/**
 * Check if content is Danea XML format
 */
export function isDaneaXML(content: string): boolean {
  return content.includes('<EasyfattProducts') || content.includes('<Product>');
}
