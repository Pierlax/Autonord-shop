---
name: image-search
description: Finds product images from trusted retailers and manufacturer websites. Prioritizes high-quality images with proper ALT text for SEO. Use when a product needs a hero image.
---

# Image Search Skill

Find high-quality product images from trusted sources.

## What It Does

1. Search trusted retailer websites (Amazon, manufacturer sites) for the product
2. Validate image quality and relevance
3. Generate SEO-friendly ALT text
4. Return the best image URL with metadata

## Payload Format

```typescript
{
  title: string;      // Product title
  vendor: string;     // Brand/manufacturer name
  sku: string | null;  // Product SKU
  barcode: string | null; // EAN/UPC barcode
}
```

## Output

- `imageUrl`: string — URL of the found image
- `imageAlt`: string — SEO-optimized ALT text
- `source`: string — Where the image was found
- `method`: string — Search method used
- `searchAttempts`: number — How many sources were tried

## Triggers

- **pipeline**: Called automatically by the `product-enrichment` skill
- **manual**: Can be triggered from the Admin Dashboard
