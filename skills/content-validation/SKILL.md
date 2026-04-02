---
name: content-validation
description: Validates AI-generated product content against TAYA philosophy rules. Scans for banned marketing phrases and triggers AI correction when violations are found. Use when content needs quality assurance before publishing to Shopify.
---

# Content Validation Skill

Validate AI-generated content against the TAYA philosophy (They Ask, You Answer) rules.

## What It Does

1. Scan content for banned marketing phrases (superlatives, corporate speak, generic filler)
2. Check for robotic AI patterns
3. If violations are found, call Gemini to rewrite the offending sections
4. Return cleaned content ready for Shopify

## Payload Format

```typescript
{
  description: string;    // Product description text
  pros: string[];         // List of pros
  cons: string[];         // List of cons
  faqs: Array<{ question: string; answer: string }>;
  expertOpinion?: string; // Optional expert review
}
```

## Output

- `wasFixed`: boolean — whether corrections were applied
- `violationCount`: number — how many violations were found
- `violations`: array — details of each violation
- `cleanedContent`: object — the corrected content

## Triggers

- **pipeline**: Called automatically by the `product-enrichment` skill
- **manual**: Can be triggered from the Admin Dashboard
