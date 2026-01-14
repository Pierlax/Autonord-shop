# Image Search Research for Product Enrichment

## Strategy Options

### 1. SerpAPI Google Images (Recommended)
- **URL**: https://serpapi.com/google-images-api
- **Pricing**: $50/month for 5,000 searches
- **Pros**: 
  - High-quality results from Google Images
  - JSON response with image URLs
  - Easy Node.js integration
- **Cons**: 
  - Paid service
  - Rate limits

### 2. Google Custom Search API
- **URL**: https://developers.google.com/custom-search
- **Pricing**: Free tier (100 queries/day), then $5 per 1000 queries
- **Pros**: Official Google API
- **Cons**: Requires setup of Custom Search Engine

### 3. Manufacturer Websites (Best for Quality)
- Milwaukee: milwaukeetool.com (high-res product images)
- Makita: makitatools.com/service/catalogs
- Bosch: boschtools.com
- DeWalt: dewalt.com

### 4. Distributor Websites
- ToolUp.com - Has brand images
- Pro Tool Reviews - Has product photos

## Recommended Approach

For Autonord, the best strategy is:

1. **Primary**: Search by SKU/EAN on manufacturer websites
2. **Fallback**: Use SerpAPI to search Google Images with query: "{brand} {model} {sku}"
3. **Last Resort**: Use a placeholder image

## Implementation Plan

```typescript
async function findProductImage(product: {
  title: string;
  vendor: string;
  sku: string;
  barcode?: string;
}): Promise<string | null> {
  // 1. Try manufacturer website based on vendor
  const manufacturerImage = await searchManufacturerSite(product);
  if (manufacturerImage) return manufacturerImage;
  
  // 2. Try SerpAPI Google Images
  const googleImage = await searchGoogleImages(product);
  if (googleImage) return googleImage;
  
  // 3. Return null (use placeholder)
  return null;
}
```

## Environment Variables Needed

```env
SERPAPI_API_KEY=your_serpapi_key
```
