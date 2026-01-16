# Philosophy-Frontend Sync Guide

## GAP 13: Synchronization between `pragmatic-truth.ts` and Frontend Components

This document maps the philosophical principles defined in `lib/core-philosophy/pragmatic-truth.ts` to their frontend implementations.

---

## 1. TAYA (They Ask You Answer) - Marcus Sheridan

### Big 5 Topics Implementation

| Topic | Backend Template | Frontend Component | Status |
|-------|-----------------|-------------------|--------|
| **Prezzi e costi** | `PRODUCT_ENRICHMENT_TEMPLATE.pricing` | `QuickSummary.tsx` (competitor prices) | ✅ Implemented |
| **Problemi e difetti** | `PRODUCT_ENRICHMENT_TEMPLATE.cons` | `ExpertReview.tsx` (cons section) | ✅ Implemented |
| **Confronti** | `BLOG_ARTICLE_TEMPLATE.comparison` | `best-of-posts.ts`, blog articles | ✅ Implemented |
| **Recensioni e best-of** | `BLOG_ARTICLE_TEMPLATE.bestOf` | `best-of-posts.ts` | ✅ Implemented |
| **Come funziona** | `PRODUCT_ENRICHMENT_TEMPLATE.howItWorks` | Blog articles, FAQs | ✅ Implemented |

### Banned Words Check

The following words are banned in `pragmatic-truth.ts` and should be avoided in all frontend copy:

```
- "leader di settore"
- "soluzione a 360 gradi"
- "eccellenza"
- "qualità superiore"
- "il migliore" (without data)
- "straordinario"
- "eccezionale"
- "all'avanguardia"
```

**Implementation:** Add ESLint rule or content validation in CI.

---

## 2. KRUG (Don't Make Me Think) - Steve Krug

### 3 Laws Implementation

| Law | Backend Guidance | Frontend Component | Status |
|-----|-----------------|-------------------|--------|
| **Self-evident** | `KRUG_RULES.selfEvident` | All UI components | ✅ Ongoing |
| **Omit needless words** | `KRUG_RULES.brevity` | `QuickSummary.tsx` (10-second read) | ✅ Implemented |
| **Conventions** | `KRUG_RULES.conventions` | Standard UI patterns | ✅ Implemented |

### Billboard Test Checklist

- [x] Key message visible in 2 seconds → `QuickSummary.tsx`
- [x] Important info above fold → Product page layout
- [x] Clickable things look clickable → Button/link styling
- [x] Mobile-first design → Responsive components

### Scanning Design Elements

| Element | Component | Implementation |
|---------|-----------|----------------|
| TL;DR boxes | `TLDRBox.tsx` | ✅ Blog articles |
| Bullet points | All components | ✅ Lists over paragraphs |
| Bold keywords | All text content | ✅ `<strong>` tags |
| Comparison tables | Blog articles | ✅ Markdown tables |
| Collapsible sections | Product page | ✅ `<details>` elements |

---

## 3. JTBD (Jobs To Be Done) - Clayton Christensen

### 5 Essential Questions Implementation

| Question | Backend Template | Frontend Component | Status |
|----------|-----------------|-------------------|--------|
| What progress? | `JTBD_TEMPLATE.progress` | `JTBDDimensions.tsx` | ✅ Implemented |
| Circumstances? | `JTBD_TEMPLATE.circumstances` | `JobStory.tsx` (situation) | ✅ Implemented |
| Obstacles? | `JTBD_TEMPLATE.obstacles` | `FourForces.tsx` (anxiety) | ✅ Implemented |
| Current solution? | `JTBD_TEMPLATE.currentSolution` | `CurrentSolution.tsx` | ✅ Implemented |
| Sacrifice? | `JTBD_TEMPLATE.sacrifice` | Pricing comparison | ✅ Implemented |

### 3 Dimensions Implementation

| Dimension | Backend Field | Frontend Component | Status |
|-----------|--------------|-------------------|--------|
| **Funzionale** | `jtbd.functional` | `JTBDDimensions.tsx` | ✅ Implemented |
| **Emotivo** | `jtbd.emotional` | `JTBDDimensions.tsx` | ✅ Implemented |
| **Sociale** | `jtbd.social` | `JTBDDimensions.tsx` | ✅ Implemented |

### 4 Forces Implementation

| Force | Backend Field | Frontend Component | Status |
|-------|--------------|-------------------|--------|
| **Push** (frustration) | `forces.push` | `FourForces.tsx` | ✅ Implemented |
| **Pull** (attraction) | `forces.pull` | `FourForces.tsx` | ✅ Implemented |
| **Anxiety** (fear) | `forces.anxiety` | `FourForces.tsx` | ✅ Implemented |
| **Habit** (comfort) | `forces.habit` | `FourForces.tsx` | ✅ Implemented |

---

## Component-to-Philosophy Mapping

| Component | TAYA | Krug | JTBD |
|-----------|------|------|------|
| `QuickSummary.tsx` | ✅ Prices | ✅ 10-sec read | ✅ Target user |
| `ExpertReview.tsx` | ✅ Pro/Contro | ✅ Scannable | - |
| `JTBDDimensions.tsx` | - | ✅ Visual | ✅ 3 Dimensions |
| `FourForces.tsx` | - | ✅ Grid layout | ✅ 4 Forces |
| `JobStory.tsx` | - | ✅ Format | ✅ Job Stories |
| `CurrentSolution.tsx` | ✅ Honesty | ✅ Interactive | ✅ Current solution |
| `CustomerQuestion.tsx` | ✅ Voice of Customer | ✅ Simple form | - |
| `TLDRBox.tsx` | - | ✅ Summary | - |
| `FAQAccordion.tsx` | ✅ Answers | ✅ Mobile UX | - |

---

## AI Enrichment Template Sync

The AI enrichment prompts in `lib/shopify/ai-enrichment.ts` should generate content that maps to these frontend components:

```typescript
// Expected AI output structure
interface EnrichedProduct {
  // TAYA
  pros: string[];           // → ExpertReview
  cons: string[];           // → ExpertReview
  competitorPrices: {...}   // → QuickSummary
  
  // JTBD
  targetProfession: string; // → QuickSummary
  jobToBeDone: string;      // → QuickSummary
  jtbdDimensions: {
    functional: string;     // → JTBDDimensions
    emotional: string;      // → JTBDDimensions
    social: string;         // → JTBDDimensions
  };
  fourForces: {
    push: string;           // → FourForces
    pull: string;           // → FourForces
    anxiety: string;        // → FourForces
    habit: string;          // → FourForces
  };
  
  // Krug
  quickSummary: string;     // → QuickSummary verdict
  faqs: FAQ[];              // → FAQAccordion
}
```

---

## Maintenance Checklist

When updating `pragmatic-truth.ts`:

1. [ ] Check if new principles need frontend components
2. [ ] Update this sync document
3. [ ] Update AI enrichment templates
4. [ ] Test component rendering with new data
5. [ ] Verify mobile responsiveness

When adding new frontend components:

1. [ ] Map to philosophy principles
2. [ ] Update this sync document
3. [ ] Add to AI enrichment output schema
4. [ ] Test with mock data

---

*Last updated: January 2026*
