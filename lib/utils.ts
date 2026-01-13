import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a string to Title Case
 * Example: "MILWAUKEE M18 FUEL" -> "Milwaukee M18 Fuel"
 */
export function toTitleCase(str: string): string {
  // Keep certain words/acronyms uppercase
  const keepUppercase = ['M18', 'M12', 'SDS', 'LED', 'USB', 'DC', 'AC', 'HD', 'XL', 'XXL', 'PRO', 'MAX', 'FUEL'];
  
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      const upperWord = word.toUpperCase();
      if (keepUppercase.includes(upperWord)) {
        return upperWord;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Extract the brand name from a vendor string
 * Maps legal company names to their brand names
 * Example: "TECHTRONIC INDUSTRIES ITALIA SRL" -> "Milwaukee"
 */
export function getBrandName(vendor: string): string {
  const vendorLower = vendor.toLowerCase();
  
  // Map of vendor patterns to brand names
  const brandMappings: { pattern: string; brand: string }[] = [
    { pattern: 'techtronic', brand: 'Milwaukee' },
    { pattern: 'milwaukee', brand: 'Milwaukee' },
    { pattern: 'makita', brand: 'Makita' },
    { pattern: 'bosch', brand: 'Bosch' },
    { pattern: 'dewalt', brand: 'DeWalt' },
    { pattern: 'stanley black', brand: 'DeWalt' },
    { pattern: 'hilti', brand: 'Hilti' },
    { pattern: 'metabo', brand: 'Metabo' },
    { pattern: 'festool', brand: 'Festool' },
    { pattern: 'hikoki', brand: 'HiKOKI' },
    { pattern: 'hitachi', brand: 'HiKOKI' },
    { pattern: 'einhell', brand: 'Einhell' },
    { pattern: 'ryobi', brand: 'Ryobi' },
    { pattern: 'black+decker', brand: 'Black+Decker' },
    { pattern: 'black & decker', brand: 'Black+Decker' },
    { pattern: 'worx', brand: 'Worx' },
    { pattern: 'flex', brand: 'Flex' },
    { pattern: 'fein', brand: 'Fein' },
    { pattern: 'stihl', brand: 'Stihl' },
    { pattern: 'husqvarna', brand: 'Husqvarna' },
  ];
  
  for (const mapping of brandMappings) {
    if (vendorLower.includes(mapping.pattern)) {
      return mapping.brand;
    }
  }
  
  // If no mapping found, return the original vendor in title case
  return toTitleCase(vendor);
}
