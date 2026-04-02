---
name: product-enrichment
description: Full product enrichment pipeline for Autonord e-commerce. Orchestrates RAG research, TwoPhaseQA fact extraction, AI content generation, TAYA validation, image search, and Shopify update. Use when a product needs AI-generated content.
---

# Product Enrichment Skill

The core skill of the Autonord platform. Transforms a bare product listing into a rich, TAYA-compliant product page.

## Pipeline Steps

1. **UniversalRAG** — Search verified info from whitelisted sources (manufacturer sites, trusted retailers)
2. **RagAdapter** — Transform RAG output into TwoPhaseQA input format
3. **TwoPhaseQA** — Extract atomic facts (Simple QA) and generate reasoning (Complex QA)
4. **AI Enrichment V3** — Generate full product content (description, pros, cons, FAQs, accessories)
5. **TAYA Police** — Validate content against philosophy rules, fix violations
6. **ImageAgent V4** — Find high-quality product image from trusted sources
7. **Shopify Update** — Save HTML + Metafields + Image with ALT text

## Payload Format

```typescript
{
  productId: string;
  title: string;
  vendor: string;
  productType: string;
  sku: string | null;
  barcode: string | null;
  tags: string[];
  price?: string;
}
```

## Output Metrics

- RAG sources queried and success rate
- QA verified facts count
- V3 confidence score
- Image found (source and method)
- TAYA violations fixed
- Pros/cons/FAQs counts

## Triggers

- **webhook**: Shopify product create/update
- **cron**: Batch processing of unenriched products
- **manual**: Single product enrichment from Admin Dashboard
