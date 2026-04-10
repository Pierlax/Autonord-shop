/**
 * Tests — W-QA grounding check accuracy
 *
 * Verifies that groundingCheck():
 * 1. Leaves facts that ARE present in evidence text unchanged
 * 2. Downgrades facts with numbers NOT found in evidence
 * 3. Handles comma/period notation variants (2.1 vs 2,1)
 * 4. Passes through "NON TROVATO" facts unchanged
 * 5. Resolves Italian word-numbers (centotrentacinque → 135) via W-QA-2
 * 6. Downgrades textual claims (brushless) not supported by evidence (D10)
 * 7. Does not crash on empty/short evidence text
 */

import { describe, it, expect, vi } from 'vitest';

// Mock modules with external dependencies before importing the tested module
vi.mock('@/lib/shopify/ai-client', () => ({
  generateTextSafe: vi.fn().mockResolvedValue({ text: '{}' }),
}));
vi.mock('@/lib/env', () => ({
  env: {
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'test-token',
    CRON_SECRET: 'test-secret',
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
  },
  optionalEnv: {},
  toShopifyGid: (id: string, _type: string) => `gid://shopify/Product/${id}`,
}));

import { groundingCheck } from '@/lib/shopify/two-phase-qa';
import type { AtomicFact } from '@/lib/shopify/two-phase-qa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fact(
  question: string,
  answer: string,
  confidence: 'high' | 'medium' | 'low' = 'high',
): AtomicFact {
  return { question, answer, source: 'test', confidence, verified: true };
}

// ---------------------------------------------------------------------------
// Numeric grounding
// ---------------------------------------------------------------------------

describe('groundingCheck() — numeric grounding (W10)', () => {
  const evidence =
    'Il Milwaukee M18 BLPD2 ha una coppia massima di 135 Nm. Pesa 2,1 kg. Tensione: 18 V. Chuck: 13 mm.';

  it('leaves facts whose number appears in evidence unchanged', () => {
    const facts = [fact('Coppia massima?', '135 Nm')];
    const result = groundingCheck(facts, evidence);
    expect(result[0].confidence).toBe('high');
    expect(result[0].verified).toBe(true);
  });

  it('downgrades confidence when number is NOT in evidence', () => {
    const facts = [fact('Coppia massima?', '200 Nm')]; // hallucinated value
    const result = groundingCheck(facts, evidence);
    expect(result[0].confidence).not.toBe('high');
  });

  it('marks a hallucinated fact as unverified', () => {
    const facts = [fact('Peso?', '3.5 kg')]; // not in evidence
    const result = groundingCheck(facts, evidence);
    expect(result[0].verified).toBe(false);
  });

  it('handles comma-period notation variants (2,1 vs 2.1)', () => {
    // Evidence contains "2,1 kg" — answer uses dot notation "2.1 kg"
    const facts = [fact('Peso?', '2.1 kg')];
    const result = groundingCheck(facts, evidence);
    expect(result[0].confidence).toBe('high');
  });

  it('passes through "NON TROVATO" facts unchanged', () => {
    const facts = [fact('Colore?', 'NON TROVATO', 'low')];
    const result = groundingCheck(facts, evidence);
    expect(result[0].answer).toBe('NON TROVATO');
    expect(result[0].confidence).toBe('low');
  });

  it('passes through non-numeric facts (no grounding check applied)', () => {
    const facts = [fact('Disponibile in Italia?', 'Sì')];
    const result = groundingCheck(facts, evidence);
    // No numbers to check — should remain unchanged
    expect(result[0].confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// W-QA-2: Italian number word normalization
// ---------------------------------------------------------------------------

describe('groundingCheck() — Italian word-number normalization (W-QA-2)', () => {
  it('resolves "centotrentacinque" to 135 — matches answer "135 Nm"', () => {
    const evidenceWords = 'La coppia massima è centotrentacinque Newton metro, classe pro.';
    const facts = [fact('Coppia massima?', '135 Nm')];
    const result = groundingCheck(facts, evidenceWords);
    expect(result[0].confidence).toBe('high');
  });

  it('resolves "diciotto" to 18 — matches answer "18 V"', () => {
    const evidenceWords = 'Tensione di diciotto volt, piattaforma M18.';
    const facts = [fact('Tensione?', '18 V')];
    const result = groundingCheck(facts, evidenceWords);
    expect(result[0].confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// D10: Textual claim grounding
// ---------------------------------------------------------------------------

describe('groundingCheck() — textual claim grounding (D10)', () => {
  it('passes "brushless" claim when evidence contains "brushless"', () => {
    const evidenceBrushless = 'Trapano con motore brushless senza carboni. Peso 1.8 kg.';
    const facts = [fact('Tipo motore?', 'brushless')];
    const result = groundingCheck(facts, evidenceBrushless);
    expect(result[0].confidence).toBe('high');
  });

  it('downgrades "brushless" claim when evidence only mentions carbon-brush motor', () => {
    // Evidence must be > 50 chars to pass the early-return guard in groundingCheck()
    const evidenceBrushed = 'Trapano con motore a carboni, con spazzole di ricambio incluse. Peso netto 1.8 kg.';
    const facts = [fact('Tipo motore?', 'brushless')];
    const result = groundingCheck(facts, evidenceBrushed);
    expect(result[0].confidence).toBe('low');
    expect(result[0].verified).toBe(false);
  });

  it('accepts "senza carboni" as synonym for brushless', () => {
    const evidenceSynonym = 'Motore senza carboni ad alta efficienza.';
    const facts = [fact('Tipo motore?', 'brushless')];
    const result = groundingCheck(facts, evidenceSynonym);
    expect(result[0].confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('groundingCheck() — edge cases', () => {
  it('returns all facts unchanged when evidence is shorter than 50 chars', () => {
    const facts = [fact('Coppia?', '135 Nm')];
    const result = groundingCheck(facts, 'short');
    expect(result).toEqual(facts);
  });

  it('handles empty facts array', () => {
    expect(groundingCheck([], 'some long evidence text here that is more than 50 chars long')).toHaveLength(0);
  });
});
