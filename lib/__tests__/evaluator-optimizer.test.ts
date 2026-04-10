/**
 * Unit tests for generateGapQueries() — contextual spec gap targeting.
 *
 * Tests three behaviors:
 *   A — Corpus-aware mode: queries target specifically what is MISSING
 *   B — Fallback mode: no corpus → template-based queries (original behavior)
 *   C — Product-type inference: expected specs differ by product category
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'test',
    CRON_SECRET: 'test',
    GOOGLE_GENERATIVE_AI_API_KEY: 'test',
  },
  optionalEnv: {},
  toShopifyGid: (id: string) => `gid://shopify/Product/${id}`,
}));
vi.mock('@/lib/pipeline-trace', () => ({
  recordAiCallToCurrentStep: vi.fn(),
  recordCacheHitToCurrentStep: vi.fn(),
}));

import { generateGapQueries } from '@/lib/shopify/evaluator-optimizer';
import type { CorpusCollection, CorpusItem } from '@/lib/shopify/corpus-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(content: string, type: CorpusItem['type'] = 'paragraph'): CorpusItem {
  return {
    id: Math.random().toString(36).slice(2),
    type,
    modality: 'text',
    content,
    url: 'https://example.com',
    title: 'Test item',
    domain: 'example.com',
    confidence: 0.8,
    tokenEstimate: Math.ceil(content.length / 4),
    metadata: {},
  };
}

function makeCorpus(items: CorpusItem[]): CorpusCollection {
  const totalTokens = items.reduce((s, i) => s + i.tokenEstimate, 0);
  return {
    items,
    byType: {},
    totalItems: items.length,
    totalTokens,
    hasPdf: items.some(i => i.type === 'pdf'),
    hasTable: items.some(i => i.type === 'table'),
    hasImage: items.some(i => i.type === 'image'),
    coverageScore: 0.5,
  };
}

const DRILLS = ['scheda tecnica strutturata mancante', 'corpus insufficiente'];

// ---------------------------------------------------------------------------
// A: Corpus-aware query generation
// ---------------------------------------------------------------------------

describe('generateGapQueries() — corpus-aware mode (A)', () => {
  it('A01: targets only the missing spec when corpus already has power', () => {
    const corpus = makeCorpus([
      makeItem('Il motore eroga 800 W di potenza massima.'),
      makeItem('Milwaukee M18 BLPD2 avvitatore professionale serie M18.'),
    ]);

    const queries = generateGapQueries(DRILLS, 'Milwaukee M18 BLPD2 avvitatore', 'Milwaukee', null, corpus);

    // 'potenza' is present → no potenza query
    expect(queries.some(q => q.includes('watt') || q.includes('potenza W'))).toBe(false);
    // 'peso' is missing → peso query expected
    expect(queries.some(q => q.includes('peso') && q.includes('kg'))).toBe(true);
  });

  it('A02: generates Nm query when torque is absent from corpus', () => {
    const corpus = makeCorpus([
      makeItem('Peso netto 2.1 kg. Tensione 18 V. Capacità 2 Ah.'),
    ]);

    const queries = generateGapQueries(DRILLS, 'Milwaukee M18 avvitatore', 'Milwaukee', null, corpus);

    expect(queries.some(q => q.includes('Nm') || q.includes('coppia'))).toBe(true);
  });

  it('A03: does NOT generate queries for specs already present', () => {
    // Corpus contains weight AND torque AND voltage AND Ah AND rpm
    const corpus = makeCorpus([
      makeItem('Peso 2.1 kg. Coppia 135 Nm. Tensione 18 V. Batteria 2 Ah. 0–1800 rpm.'),
    ]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Milwaukee M18 BLPD2 trapano',
      'Milwaukee',
      null,
      corpus,
    );

    // All expected specs for a drill are present → no spec-level queries
    expect(queries.filter(q =>
      q.includes('peso') || q.includes('Nm') || q.includes('volt') || q.includes('Ah') || q.includes('rpm')
    )).toHaveLength(0);
  });

  it('A04: includes both Italian and English variants for each missing spec', () => {
    const corpus = makeCorpus([makeItem('Prodotto Milwaukee senza specifiche numeriche.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Milwaukee M18 trapano',
      'Milwaukee',
      null,
      corpus,
    );

    // For any given missing spec, expect both an Italian and English query
    const hasPesoIt = queries.some(q => q.toLowerCase().includes('peso') && q.toLowerCase().includes('kg'));
    const hasPesoEn = queries.some(q => q.toLowerCase().includes('weight') && q.toLowerCase().includes('kg'));
    expect(hasPesoIt).toBe(true);
    expect(hasPesoEn).toBe(true);
  });

  it('A05: includes SKU in corpus-aware queries when provided', () => {
    const corpus = makeCorpus([makeItem('Prodotto senza peso specificato.')]);

    const queries = generateGapQueries(
      DRILLS,
      'M18 BLPD2 avvitatore',
      'Milwaukee',
      'BLPD2-0',
      corpus,
    );

    expect(queries.some(q => q.includes('BLPD2-0'))).toBe(true);
  });

  it('A06: suppresses generic "scheda tecnica" template when corpus is provided', () => {
    const corpus = makeCorpus([makeItem('Prodotto senza info.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Milwaukee M18 trapano',
      'Milwaukee',
      null,
      corpus,
    );

    // The generic "scheda tecnica specifiche datasheet" template should NOT appear
    // when corpus is provided (corpus-aware spec queries replace it)
    expect(queries.some(q => q === 'Milwaukee Milwaukee M18 trapano scheda tecnica specifiche datasheet')).toBe(false);
  });

  it('A07: still emits manual/review template queries alongside spec queries', () => {
    const corpus = makeCorpus([makeItem('800 W potenza.')]);

    const queries = generateGapQueries(
      ['manuale PDF mancante', 'recensioni e opinioni mancanti'],
      'Milwaukee M18 smerigliatrice',
      'Milwaukee',
      null,
      corpus,
    );

    expect(queries.some(q => q.includes('manuale') || q.includes('manual'))).toBe(true);
    expect(queries.some(q => q.includes('recensione') || q.includes('review'))).toBe(true);
  });

  it('A08: result is capped at 8 unique queries', () => {
    const corpus = makeCorpus([makeItem('Prodotto senza nessuna specifica.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante', 'manuale PDF mancante',
       'recensioni e opinioni mancanti', 'informazioni batteria/compatibilità mancanti'],
      'Milwaukee M18 trapano avvitatore',
      'Milwaukee',
      null,
      corpus,
    );

    expect(queries.length).toBeLessThanOrEqual(8);
    expect(queries.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// B: Fallback mode (no corpus)
// ---------------------------------------------------------------------------

describe('generateGapQueries() — no-corpus fallback mode (B)', () => {
  it('B01: returns generic scheda-tecnica queries when corpus is absent', () => {
    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Milwaukee M18 BLPD2',
      'Milwaukee',
    );

    expect(queries.some(q => q.includes('scheda tecnica'))).toBe(true);
    expect(queries.some(q => q.includes('technical specifications'))).toBe(true);
  });

  it('B02: returns manual queries for manuale PDF gap', () => {
    const queries = generateGapQueries(['manuale PDF mancante'], 'Makita DHP481', 'Makita');

    expect(queries.some(q => q.includes('manuale istruzioni PDF'))).toBe(true);
    expect(queries.some(q => q.includes('instruction manual PDF'))).toBe(true);
  });

  it('B03: returns empty array for gaps with no matching template', () => {
    const queries = generateGapQueries(['gap sconosciuto'], 'Bosch GSB18', 'Bosch');
    expect(queries).toHaveLength(0);
  });

  it('B04: deduplicates queries and caps at 8', () => {
    const gaps = [
      'manuale PDF mancante', 'scheda tecnica strutturata mancante',
      'informazioni batteria/compatibilità mancanti', 'recensioni e opinioni mancanti',
    ];
    const queries = generateGapQueries(gaps, 'DeWalt DCD996', 'DeWalt');
    const unique = new Set(queries);
    expect(unique.size).toBe(queries.length); // no duplicates
    expect(queries.length).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// C: Product-type inference via query content
// ---------------------------------------------------------------------------

describe('generateGapQueries() — product-type inference (C)', () => {
  it('C01: compressor → generates pressure and flow rate queries', () => {
    const corpus = makeCorpus([makeItem('Compressore professionale.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Fini Nuair compressore 50 L',
      'Fini',
      null,
      corpus,
    );

    expect(queries.some(q => q.includes('pressione') || q.includes('bar'))).toBe(true);
    expect(queries.some(q => q.includes('portata') || q.includes('flow rate'))).toBe(true);
  });

  it('C02: generator → generates power (kW) query but NOT torque (Nm)', () => {
    const corpus = makeCorpus([makeItem('Generatore professionale.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'SDMO HX3000 generatore',
      'SDMO',
      null,
      corpus,
    );

    expect(queries.some(q => q.includes('potenza') || q.includes('power'))).toBe(true);
    // Generators don't produce torque (Nm) spec queries
    expect(queries.some(q => q.includes('Nm') || q.includes('coppia'))).toBe(false);
  });

  it('C03: grinder → power and rpm, NOT battery Ah (no battery in grinder)', () => {
    const corpus = makeCorpus([makeItem('Smerigliatrice angolare con disco 125 mm.')]);

    const queries = generateGapQueries(
      ['scheda tecnica strutturata mancante'],
      'Makita GA5030 smerigliatrice',
      'Makita',
      null,
      corpus,
    );

    expect(queries.some(q => q.includes('potenza') || q.includes('power'))).toBe(true);
    // Battery Ah is not expected for a wired grinder
    expect(queries.some(q => q.includes('Ah') && q.includes('batteria'))).toBe(false);
  });
});
