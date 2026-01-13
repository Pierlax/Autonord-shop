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
