/**
 * Tests — W-TP banned phrase detection recall
 *
 * Verifies that:
 * 1. BANNED_PHRASES list is comprehensive (≥30 entries, includes all critical TAYA violations)
 * 2. containsBannedPhrases() detects static phrases (case-insensitive)
 * 3. Clean professional copy does not trigger false positives
 * 4. Multiple violations in the same text are all detected
 */

import { describe, it, expect } from 'vitest';
import { BANNED_PHRASES, containsBannedPhrases } from '@/lib/core-philosophy';

// ---------------------------------------------------------------------------
// List coverage
// ---------------------------------------------------------------------------

describe('BANNED_PHRASES list', () => {
  it('contains at least 30 entries', () => {
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(30);
  });

  it('includes the core TAYA Big-5 violations', () => {
    const critical = [
      'leader di settore',
      'soluzione a 360 gradi',
      'eccellenza',
      'qualità superiore',
      'il migliore',
    ];
    for (const phrase of critical) {
      expect(BANNED_PHRASES).toContain(phrase);
    }
  });

  it('includes common marketing superlatives', () => {
    const superlatives = ['straordinario', 'eccezionale'];
    for (const phrase of superlatives) {
      expect(BANNED_PHRASES).toContain(phrase);
    }
  });

  it('does not contain empty strings', () => {
    for (const phrase of BANNED_PHRASES) {
      expect(phrase.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// containsBannedPhrases — detection
// ---------------------------------------------------------------------------

describe('containsBannedPhrases()', () => {
  it('detects an exact phrase match', () => {
    const found = containsBannedPhrases('Questo prodotto è il leader di settore del mercato');
    expect(found).toContain('leader di settore');
  });

  it('is case-insensitive', () => {
    const found = containsBannedPhrases('LEADER DI SETTORE assoluto');
    expect(found.length).toBeGreaterThan(0);
  });

  it('detects phrase embedded in a sentence', () => {
    const found = containsBannedPhrases(
      'Con la sua tecnologia di ultima generazione garantisce un\'eccellenza senza pari.',
    );
    expect(found).toContain('eccellenza');
  });

  it('returns empty array for clean, factual professional copy', () => {
    const cleanCopy = [
      'Il trapano ha una coppia massima di 135 Nm. Pesa 2,1 kg.',
      'Motore brushless con 50% di autonomia in più rispetto al modello precedente.',
      'Non adatto per lavori su cemento armato: per quelli serve un tassellatore SDS-Plus.',
      'Rispetto al Makita DHP481, il Milwaukee M18 offre 15 Nm in più di coppia.',
    ].join(' ');

    const found = containsBannedPhrases(cleanCopy);
    expect(found).toHaveLength(0);
  });

  it('detects multiple violations in the same text', () => {
    const dirty =
      'Eccellenza e qualità superiore incarnate: il leader di settore che garantisce il massimo.';
    const found = containsBannedPhrases(dirty);
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('detects "a 360°" variant', () => {
    const found = containsBannedPhrases('Una soluzione a 360° per il tuo cantiere.');
    expect(found.length).toBeGreaterThan(0);
  });

  it('does not flag a number with degree sign in a technical context', () => {
    // "180°" rotation arc should not match "a 360°"
    const technical = 'La sega può ruotare di 45° per tagli in bevel.';
    const found = containsBannedPhrases(technical);
    expect(found).toHaveLength(0);
  });
});
