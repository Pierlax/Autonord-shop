# Autonord UI/UX Guidelines - The Pragmatic Truth

## Core Philosophy

This document codifies the **Pragmatic Truth** design philosophy for all Autonord frontend development. It combines:

- **TAYA (Marcus Sheridan)** - Radical honesty in content presentation
- **Krug (Don't Make Me Think)** - Clarity and scannability
- **JTBD (Christensen)** - Focus on the job to be done

---

## Information Hierarchy (Krug)

### Product Pages - Above the Fold

```
┌─────────────────────────────────────────────────────────────────┐
│  [Brand Logo]  PRODUCT NAME                                      │
│  ★★★★☆ (47 recensioni)                                          │
│                                                                  │
│  €XXX,XX  [Disponibile ✓]                                       │
│                                                                  │
│  **Ideale per:** Elettricisti, cartongessisti                   │
│  **Non per:** Hobbisti occasionali                              │
│                                                                  │
│  [AGGIUNGI AL CARRELLO]  [Confronta]                            │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** Price, availability, and "ideal for" MUST be visible without scrolling.

### Product Pages - Below the Fold

```
┌─────────────────────────────────────────────────────────────────┐
│  PRO                          │  CONTRO                         │
│  • Spec + beneficio           │  • Problema reale               │
│  • Spec + beneficio           │  • Problema reale               │
│  • Spec + beneficio           │                                 │
├─────────────────────────────────────────────────────────────────┤
│  [▼ Specifiche Tecniche]  (Accordion - collapsed by default)    │
│  [▼ FAQ]                                                        │
│  [▼ Accessori Consigliati]                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** Pro/Contro scannable in 3 seconds. Technical specs in accordion.

---

## Typography & Readability

### Font Sizes
- **H1 (Product Name):** 24-32px
- **H2 (Section Headers):** 20-24px
- **Body:** 16px minimum
- **Captions/Labels:** 14px

### Line Length
- **Maximum:** 75 characters per line
- **Optimal:** 50-65 characters

### Whitespace
- **Section spacing:** 32-48px
- **Paragraph spacing:** 16-24px
- **Line height:** 1.5-1.6

---

## Content Formatting (Krug Principles)

### ✅ DO

```html
<!-- Scannable format -->
<div class="spec">
  <strong>Potenza:</strong> 18V Brushless 
  <span class="benefit">(Non si ferma nel cemento armato)</span>
</div>

<!-- Clear hierarchy -->
<h2>Pro</h2>
<ul>
  <li><strong>Leggero (1.5kg)</strong> - ideale per lavori a soffitto</li>
  <li><strong>Batteria 5Ah</strong> - mezza giornata senza ricaricare</li>
</ul>
```

### ❌ DON'T

```html
<!-- Wall of text -->
<p>
  Questo trapano è dotato di un motore brushless da 18V che offre 
  prestazioni eccezionali grazie alla sua tecnologia avanzata. 
  L'impugnatura ergonomica garantisce comfort durante l'utilizzo 
  prolungato e la batteria da 5Ah assicura un'autonomia adeguata 
  per le esigenze professionali.
</p>
```

---

## CTA (Call to Action) Design

### Primary CTA
- **Color:** High contrast (brand primary)
- **Size:** Minimum 48px height (touch target)
- **Text:** Action-oriented ("Aggiungi al Carrello", not "Acquista")
- **Position:** Always visible or sticky on mobile

### Secondary CTA
- **Color:** Outline or ghost button
- **Examples:** "Confronta", "Salva", "Condividi"

### CTA Hierarchy
```
[AGGIUNGI AL CARRELLO]  ← Primary, filled
[Confronta]             ← Secondary, outline
[Salva per dopo]        ← Tertiary, text link
```

---

## Mobile-First Design

### Critical Info Without Scroll
1. Product name
2. Price
3. Availability
4. "Ideale per" badge
5. Primary CTA

### Touch Targets
- **Minimum size:** 44x44px
- **Spacing between targets:** 8px minimum

### Accordion for Details
- Specs, FAQ, Reviews → collapsed by default
- Clear expand/collapse indicators

---

## Honesty in UI (TAYA)

### Price Display
```html
<!-- ✅ Honest -->
<div class="price">
  <span class="current">€459,00</span>
  <span class="comparison">vs €489 su Amazon</span>
</div>

<!-- ❌ Deceptive -->
<div class="price">
  <span class="fake-original">€599,00</span>
  <span class="current">€459,00</span>
  <span class="discount">-23%!</span>
</div>
```

### Availability
```html
<!-- ✅ Honest -->
<span class="stock in-stock">✓ Disponibile (3 in magazzino)</span>
<span class="stock low-stock">⚠ Ultime 2 unità</span>
<span class="stock out-of-stock">✗ Non disponibile - arrivo stimato: 5-7 giorni</span>

<!-- ❌ Deceptive -->
<span class="urgency">🔥 SOLO 2 RIMASTI! ORDINA ORA!</span>
```

### Reviews
```html
<!-- ✅ Honest -->
<div class="rating">
  ★★★★☆ 4.2/5 (47 recensioni verificate)
  <a href="#reviews">Leggi le 8 recensioni negative</a>
</div>

<!-- ❌ Cherry-picked -->
<div class="rating">
  ★★★★★ "Prodotto fantastico!" - Mario
</div>
```

---

## JTBD in UI

### Product Badges
```html
<!-- Job-focused badges -->
<span class="badge job">Per elettricisti</span>
<span class="badge job">Lavori in quota</span>
<span class="badge job">Uso intensivo</span>

<!-- NOT feature-focused -->
<span class="badge feature">Brushless</span>
<span class="badge feature">18V</span>
```

### Spec-to-Benefit Mapping
Always show the benefit next to the spec:

| Spec | Display |
|------|---------|
| 5Ah | **5Ah** (mezza giornata senza ricaricare) |
| 1.5kg | **1.5kg** (ideale per lavori sopra la testa) |
| 80Nm | **80Nm** (fora anche il cemento armato) |
| Brushless | **Brushless** (meno manutenzione, vita più lunga) |

---

## Banned UI Patterns

### ❌ Dark Patterns (VIETATI)
- Fake urgency ("Solo 2 rimasti!" when false)
- Fake discounts (inflated original prices)
- Hidden costs (reveal only at checkout)
- Confirm-shaming ("No, I don't want to save money")
- Misdirection (making unsubscribe hard to find)

### ❌ Friction Patterns (VIETATI)
- Required account creation before checkout
- Newsletter popup on first visit
- Auto-play videos
- Infinite scroll without pagination option
- Hidden contact information

---

## Component Checklist

Before deploying any UI component, verify:

### Krug Checklist
- [ ] Can user understand it in 3 seconds?
- [ ] Is the most important info visible first?
- [ ] Are clickable elements obviously clickable?
- [ ] Is text scannable (bullets, bold, whitespace)?

### TAYA Checklist
- [ ] Is pricing transparent and honest?
- [ ] Are limitations/cons visible?
- [ ] Is availability accurate?
- [ ] Are reviews balanced (not cherry-picked)?

### JTBD Checklist
- [ ] Is "ideal for" clearly stated?
- [ ] Are specs linked to job benefits?
- [ ] Is the job context clear?

---

## Implementation Notes

### CSS Variables for Consistency
```css
:root {
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* Typography */
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  
  /* Touch targets */
  --touch-target-min: 44px;
  --button-height: 48px;
}
```

### Accessibility
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Focus indicators: visible and obvious
- Alt text: descriptive, not "product image"
- Keyboard navigation: all interactive elements reachable

---

*Last updated: January 2026*
*Philosophy: The Pragmatic Truth (TAYA + Krug + JTBD)*
