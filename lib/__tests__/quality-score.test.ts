/**
 * Tests — D16 content quality score calibration
 *
 * Verifies that scoreContentQuality():
 * 1. Gives high score (>0.6 overall) to complete, specific, honest content
 * 2. Penalizes banned marketing phrases (honestyScore < 1)
 * 3. Gives low specificityScore when pros/cons lack numbers
 * 4. Gives 0 completeness when required sections are empty
 * 5. Factual density tracks verified spec coverage in description
 * 6. JTBD coverage responds to benefit language patterns
 * 7. Weighted overall stays within 0-1
 */

import { describe, it, expect, vi } from 'vitest';

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
  toShopifyGid: (id: string) => `gid://shopify/Product/${id}`,
}));

import { scoreContentQuality } from '@/lib/shopify/ai-enrichment-v3';
import type { QAFacts } from '@/lib/shopify/ai-enrichment-v3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const goodContent = {
  description:
    'Il Milwaukee M18 BLPD2 eroga 135 Nm di coppia → permette avvitare bulloni M12 strutturali. ' +
    'Motore brushless per 50% più autonomia rispetto al modello spazzolato. ' +
    'Pesa 2,1 kg: ideale per lavori in quota senza affaticamento. ' +
    'Consente di completare un telaio in legno senza ricaricare.',
  pros: [
    '135 Nm di coppia: sufficiente per viti strutturali M12',
    'Peso 2,1 kg: usabile in quota senza affaticare il polso',
    '50% più autonomia grazie al motore brushless',
  ],
  cons: ['Batteria non inclusa nella confezione base'],
  faqs: [
    { question: 'Compatibile con tutte le batterie M18?', answer: 'Sì, 2 Ah, 5 Ah e 9 Ah.' },
    { question: 'Coppia massima?', answer: '135 Nm in modalità drill, 27 Nm in drive.' },
  ],
  specs: { coppia: '135 Nm', peso: '2,1 kg', motore: 'brushless', tensione: '18 V' },
};

const goodFacts: QAFacts = {
  verifiedSpecs: [
    { question: 'Coppia massima?', answer: '135 Nm', source: 'manual' },
    { question: 'Peso?', answer: '2,1 kg', source: 'manual' },
  ],
  unverifiedSpecs: [],
  strengths: [],
  weaknesses: [],
  idealFor: [],
  notIdealFor: [],
  verdict: 'Prodotto solido con buon rapporto qualità/prezzo.',
  verdictConfidence: 'high',
  caveats: [],
};

// ---------------------------------------------------------------------------
// Positive calibration
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — positive calibration', () => {
  it('gives overall > 0.6 for good content with verified specs', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    expect(score.overall).toBeGreaterThan(0.6);
  });

  it('gives completeness = 1 when all sections are non-empty with sufficient content', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    expect(score.completeness).toBe(1);
  });

  it('gives honestyScore = 1 for content with no banned phrases', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    expect(score.honestyScore).toBe(1);
  });

  it('gives specificityScore > 0 when pros/cons contain numbers', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    expect(score.specificityScore).toBeGreaterThan(0);
  });

  it('all dimensions are in [0, 1]', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    for (const dim of ['overall', 'factualDensity', 'specificityScore', 'jtbdCoverage', 'completeness', 'honestyScore'] as const) {
      expect(score[dim]).toBeGreaterThanOrEqual(0);
      expect(score[dim]).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Honesty score — banned phrase penalization
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — honestyScore penalization', () => {
  it('reduces honestyScore when description contains banned phrases', () => {
    const dirtyContent = {
      ...goodContent,
      description: 'Il leader di settore per eccellenza. Qualità superiore garantita.',
    };
    const score = scoreContentQuality(dirtyContent, null);
    expect(score.honestyScore).toBeLessThan(1);
  });

  it('honestyScore approaches 0 for heavily marketing-laden text', () => {
    const veryDirty = {
      ...goodContent,
      description: 'Il leader di settore per eccellenza, qualità superiore, il migliore, straordinario prodotto.',
    };
    const score = scoreContentQuality(veryDirty, null);
    expect(score.honestyScore).toBeLessThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// Specificity score
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — specificityScore', () => {
  it('gives specificityScore = 0 when pros/cons have no numbers', () => {
    const vagueContent = {
      ...goodContent,
      pros: ['Molto potente', 'Leggero e maneggevole', 'Affidabile in cantiere'],
      cons: ['Un po\' costoso'],
    };
    const score = scoreContentQuality(vagueContent, null);
    expect(score.specificityScore).toBe(0);
  });

  it('gives specificityScore = 1 when all pros/cons contain numbers', () => {
    const numericalContent = {
      ...goodContent,
      pros: ['135 Nm coppia', '2,1 kg peso', '50% più autonomia'],
      cons: ['199€ batteria separata'],
    };
    const score = scoreContentQuality(numericalContent, null);
    expect(score.specificityScore).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — completeness', () => {
  it('gives completeness = 0 when all sections are empty', () => {
    const empty = { description: '', pros: [], cons: [], faqs: [], specs: {} };
    const score = scoreContentQuality(empty, null);
    expect(score.completeness).toBe(0);
  });

  it('gives partial completeness when only some sections are present', () => {
    const partial = {
      description: 'Un trapano a batteria professionale con 135 Nm di coppia per lavori strutturali.',
      pros: ['135 Nm di coppia'],
      cons: [],        // missing
      faqs: [],        // missing
      specs: {},       // missing
    };
    const score = scoreContentQuality(partial, null);
    expect(score.completeness).toBeGreaterThan(0);
    expect(score.completeness).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Factual density
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — factualDensity', () => {
  it('gives high factualDensity when spec numbers appear in description', () => {
    const score = scoreContentQuality(goodContent, goodFacts);
    // Both "135" and "2" (from 2,1 kg) are in the description
    expect(score.factualDensity).toBeGreaterThan(0.5);
  });

  it('gives neutral factualDensity (0.5) when no qaFacts provided', () => {
    const score = scoreContentQuality(goodContent, null);
    expect(score.factualDensity).toBe(0.5);
  });

  it('gives 0 factualDensity when no spec numbers appear in description', () => {
    const noNumbers = {
      ...goodContent,
      description: 'Trapano professionale robusto adatto per carpentieri esperti.',
    };
    const score = scoreContentQuality(noNumbers, goodFacts);
    expect(score.factualDensity).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JTBD coverage
// ---------------------------------------------------------------------------

describe('scoreContentQuality() — jtbdCoverage', () => {
  it('gives full jtbdCoverage (1) when description has 3+ benefit patterns', () => {
    const score = scoreContentQuality(goodContent, null);
    // goodContent.description has "→", "per", "consente di" → 3+ matches
    expect(score.jtbdCoverage).toBe(1);
  });

  it('gives low jtbdCoverage for pure spec listing without benefit language', () => {
    const specOnly = {
      ...goodContent,
      description: 'Coppia: 135 Nm. Peso: 2,1 kg. Tensione: 18 V. Motore: brushless.',
    };
    const score = scoreContentQuality(specOnly, null);
    expect(score.jtbdCoverage).toBeLessThan(1);
  });
});
