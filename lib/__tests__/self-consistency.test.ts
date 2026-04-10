/**
 * Unit tests for selfConsistencyCheck()
 *
 * Tests three classes of behaviour:
 *   A — Cross-section conflicts (same unit, different values across sections)
 *   B — QA-fact conflicts (verified fact contradicts generated content)
 *   C — Clean / edge cases (no conflicts expected)
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

import { selfConsistencyCheck } from '@/lib/shopify/self-consistency';
import type { EnrichedProductData } from '@/lib/shopify/webhook-types';
import type { AtomicFact } from '@/lib/shopify/two-phase-qa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function content(
  description = '',
  pros: string[] = [],
  cons: string[] = [],
  faqs: { question: string; answer: string }[] = [],
): EnrichedProductData {
  return { description, pros, cons, faqs };
}

function fact(
  question: string,
  answer: string,
  verified = true,
): AtomicFact {
  return { question, answer, source: 'test', confidence: 'high', verified };
}

// ---------------------------------------------------------------------------
// A: Cross-section conflicts
// ---------------------------------------------------------------------------

describe('selfConsistencyCheck() — cross-section conflicts (A)', () => {
  it('A01: description vs pros — different Nm value → conflict', () => {
    const c = content(
      'Coppia massima 135 Nm in modalità drill.',
      ['Eroga fino a 200 Nm di coppia'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(false);
    expect(r.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(r.conflicts[0].unit).toBe('nm');
  });

  it('A02: description vs cons — different kg value → conflict', () => {
    const c = content(
      'Peso netto 2.1 kg con batteria.',
      [],
      ['Abbastanza pesante: 3.5 kg con batteria'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(r.conflicts[0].unit).toBe('kg');
  });

  it('A03: pros vs faqs — different V value → conflict', () => {
    const c = content(
      '',
      ['Alimentato a 18 V, compatibile M18'],
      [],
      [{ question: 'Qual è la tensione?', answer: 'La tensione è 14.4 V.' }],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(false);
    expect(r.conflicts.some(c => c.unit === 'v')).toBe(true);
  });

  it('A04: cons vs faqs — different W value → conflict', () => {
    const c = content(
      '',
      [],
      ['Potenza limitata a 800 W rispetto alla concorrenza'],
      [{ question: 'Potenza?', answer: 'Il motore eroga 1200 W.' }],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.conflicts.some(c => c.unit === 'w')).toBe(true);
  });

  it('A05: three sections with three distinct Nm values → conflict detected', () => {
    const c = content(
      '135 Nm di coppia.',
      ['Coppia fino a 150 Nm'],
      ['Solo 100 Nm in modalità bassa'],
    );
    const r = selfConsistencyCheck(c, []);
    // 135↔150, 135↔100, 150↔100 → at least one conflict per deduplicated value pair
    expect(r.conflicts.length).toBeGreaterThanOrEqual(2);
  });

  it('A06: same value in description and pros → no conflict', () => {
    const c = content(
      'Coppia massima 135 Nm.',
      ['135 Nm di coppia certificata'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.conflicts.filter(x => x.unit === 'nm')).toHaveLength(0);
  });

  it('A07: values within 2% tolerance → no conflict (rounding OK)', () => {
    // 135 vs 135.0 — same value
    const c = content(
      'Peso 2,0 kg.',
      ['Pesa 2.0 kg'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(true);
  });

  it('A08: different units for same number → no cross-unit conflict', () => {
    // 2 kg vs 2 Ah — different units, no conflict
    const c = content(
      'Peso 2 kg, batteria 2 Ah.',
      ['Batteria da 2 Ah inclusa'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B: QA-fact conflicts
// ---------------------------------------------------------------------------

describe('selfConsistencyCheck() — QA-fact conflicts (B)', () => {
  it('B01: verified fact 135 Nm vs description 200 Nm → qa conflict', () => {
    const c = content('Coppia massima 200 Nm.');
    const r = selfConsistencyCheck(c, [fact('Coppia massima?', '135 Nm')]);
    expect(r.qaConflicts.length).toBeGreaterThanOrEqual(1);
    expect(r.qaConflicts[0].qaFact.question).toBe('Coppia massima?');
    expect(r.qaConflicts[0].mention.section).toBe('description');
  });

  it('B02: verified fact matches content → no qa conflict', () => {
    const c = content('Coppia massima 135 Nm certificata.');
    const r = selfConsistencyCheck(c, [fact('Coppia massima?', '135 Nm')]);
    expect(r.qaConflicts.filter(c => c.qaFact.question === 'Coppia massima?')).toHaveLength(0);
  });

  it('B03: unverified fact → ignored even if contradicted', () => {
    const c = content('Potenza 1200 W.');
    const r = selfConsistencyCheck(c, [fact('Potenza?', '800 W', false)]);
    expect(r.qaConflicts).toHaveLength(0);
  });

  it('B04: NON TROVATO fact → ignored (no numeric match possible)', () => {
    const c = content('Peso 2.1 kg.');
    const r = selfConsistencyCheck(c, [fact('Garanzia?', 'NON TROVATO')]);
    expect(r.qaConflicts).toHaveLength(0);
  });

  it('B05: fact conflict in pros section', () => {
    const c = content('', ['Batteria da 5 Ah per lunga autonomia']);
    const r = selfConsistencyCheck(c, [fact('Capacità batteria?', '2 Ah')]);
    expect(r.qaConflicts.length).toBeGreaterThanOrEqual(1);
    expect(r.qaConflicts[0].mention.section).toBe('pros');
  });

  it('B06: fact conflict in FAQ answer', () => {
    const c = content(
      '',
      [],
      [],
      [{ question: 'Qual è il peso?', answer: 'Il prodotto pesa 3.5 kg.' }],
    );
    const r = selfConsistencyCheck(c, [fact('Peso?', '2.1 kg')]);
    expect(r.qaConflicts.some(c => c.mention.section === 'faqs')).toBe(true);
  });

  it('B07: multiple facts, only one conflicts → one qaConflict', () => {
    const c = content('Coppia 135 Nm, tensione 14 V.');
    const facts = [
      fact('Coppia massima?', '135 Nm'),  // matches → no conflict
      fact('Tensione?', '18 V'),          // 14 vs 18 → conflict
    ];
    const r = selfConsistencyCheck(c, facts);
    expect(r.qaConflicts).toHaveLength(1);
    expect(r.qaConflicts[0].qaFact.question).toBe('Tensione?');
  });
});

// ---------------------------------------------------------------------------
// C: Clean / edge cases
// ---------------------------------------------------------------------------

describe('selfConsistencyCheck() — clean / edge cases (C)', () => {
  it('C01: no numbers at all → clean, 0 numbers found', () => {
    const c = content('Ottimo prodotto per uso professionale.', ['Robusto', 'Affidabile']);
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(true);
    expect(r.totalNumbersFound).toBe(0);
  });

  it('C02: empty content → clean', () => {
    const r = selfConsistencyCheck(content(), []);
    expect(r.isClean).toBe(true);
    expect(r.totalNumbersFound).toBe(0);
  });

  it('C03: numbers in multiple sections all consistent → clean', () => {
    const c = content(
      'Coppia 135 Nm, peso 2.1 kg, tensione 18 V.',
      ['135 Nm di coppia massima', '18 V piattaforma M18'],
      ['2.1 kg con batteria'],
      [{ question: 'Peso?', answer: '2.1 kg' }],
    );
    const r = selfConsistencyCheck(c, [
      fact('Coppia?', '135 Nm'),
      fact('Tensione?', '18 V'),
    ]);
    expect(r.isClean).toBe(true);
  });

  it('C04: comma-decimal "2,1 kg" equals dot-decimal "2.1 kg" → no conflict', () => {
    const c = content('Peso 2,1 kg con batteria.', ['Pesa 2.1 kg']);
    const r = selfConsistencyCheck(c, []);
    expect(r.isClean).toBe(true);
  });

  it('C05: totalNumbersFound is accurate', () => {
    // description: 2 numbers (135 Nm, 18 V)
    // pros: 1 number (2.1 kg)
    const c = content('135 Nm coppia. 18 V tensione.', ['Peso 2.1 kg']);
    const r = selfConsistencyCheck(c, []);
    expect(r.totalNumbersFound).toBe(3);
  });

  it('C06: dB(A) unit recognized', () => {
    const c = content(
      'Livello sonoro 72 dB(A).',
      ['Rumorosità di 95 dB(A)'],
    );
    const r = selfConsistencyCheck(c, []);
    expect(r.conflicts.some(x => x.unit === 'db')).toBe(true);
  });
});
