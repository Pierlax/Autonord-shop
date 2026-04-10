/**
 * Tests — W-V3-3 JSON repair robustness
 *
 * Verifies that repairUnescapedQuotes():
 * 1. Leaves valid JSON completely unchanged
 * 2. Fixes a bare " inside a string value (e.g. inch specs: 1/2")
 * 3. Preserves properly escaped \" sequences
 * 4. Produces parseable output for nested multi-key objects
 * 5. Handles the empty string
 * 6. Handles strings with no quotes at all
 * 7. Does not corrupt JSON with correctly structured arrays
 * 8. Handles real-world Gemini output patterns (Italian specs with " marks)
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

import { repairUnescapedQuotes } from '@/lib/shopify/ai-enrichment-v3';

// ---------------------------------------------------------------------------
// No-op cases — valid JSON must be returned unchanged
// ---------------------------------------------------------------------------

describe('repairUnescapedQuotes() — valid JSON passthrough', () => {
  it('leaves a simple valid JSON string unchanged', () => {
    const valid = '{"key": "value", "num": 42}';
    expect(repairUnescapedQuotes(valid)).toBe(valid);
  });

  it('leaves a nested valid JSON object unchanged', () => {
    const valid = '{"title": "Il trapano Milwaukee", "specs": {"coppia": "135 Nm"}}';
    expect(repairUnescapedQuotes(valid)).toBe(valid);
  });

  it('leaves a valid JSON array unchanged', () => {
    const valid = '["primo", "secondo", "terzo"]';
    expect(repairUnescapedQuotes(valid)).toBe(valid);
  });

  it('returns empty string for empty input', () => {
    expect(repairUnescapedQuotes('')).toBe('');
  });

  it('handles a string with no quotes (plain text)', () => {
    const noQuotes = 'just some text without quotes';
    expect(repairUnescapedQuotes(noQuotes)).toBe(noQuotes);
  });
});

// ---------------------------------------------------------------------------
// Repair cases
// ---------------------------------------------------------------------------

describe('repairUnescapedQuotes() — repairs unescaped inline quotes', () => {
  it('repairs inch spec: attacco 1/2" per bussole', () => {
    const broken = '{"spec": "Attacco 1/2" per bussole standard"}';
    const repaired = repairUnescapedQuotes(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired).spec).toContain('1/2');
  });

  it('repairs 5/8" hex shank specification', () => {
    const broken = '{"note": "Adatto per mandrini 5/8" hex"}';
    const repaired = repairUnescapedQuotes(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it('repairs multiple inline quotes in the same string value', () => {
    const broken = '{"desc": "Attacco 1/4" e 3/8" compatibili"}';
    const repaired = repairUnescapedQuotes(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired).desc).toContain('1/4');
  });

  it('repairs inline quote followed by text (not structural token)', () => {
    // " followed by space then letter → inline quote
    const broken = '{"title": "Trapano da 1/2" pollice Milwaukee M18"}';
    const repaired = repairUnescapedQuotes(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired).title).toContain('Milwaukee');
  });
});

// ---------------------------------------------------------------------------
// Escaped quotes must be preserved
// ---------------------------------------------------------------------------

describe('repairUnescapedQuotes() — preserves escaped sequences', () => {
  it('preserves properly escaped double quotes', () => {
    const valid = '{"key": "value with \\"quoted\\" word"}';
    const repaired = repairUnescapedQuotes(valid);
    // Should still be parseable and contain the word "quoted"
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired).key).toContain('quoted');
  });

  it('preserves escaped backslash before escaped quote', () => {
    const valid = '{"path": "C:\\\\Users\\\\test"}';
    const repaired = repairUnescapedQuotes(valid);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Real-world Gemini patterns
// ---------------------------------------------------------------------------

describe('repairUnescapedQuotes() — real-world Gemini output patterns', () => {
  it('handles Italian product description with measurement quotes', () => {
    const geminiOutput = JSON.stringify({
      description: 'Trapano con attacco 1/2" esagonale. Coppia: 135 Nm.',
      pros: ['Attacco 1/2" universale', 'Coppia 135 Nm'],
      cons: ['Batteria separata'],
    }).replace('1/2\\"', '1/2"').replace('1/2\\"', '1/2"'); // simulate unescaped

    // If parsing already works (e.g. JSON.stringify escaped them), skip
    try {
      JSON.parse(geminiOutput);
      // Valid — repairUnescapedQuotes is a no-op
      const repaired = repairUnescapedQuotes(geminiOutput);
      expect(() => JSON.parse(repaired)).not.toThrow();
    } catch {
      // Broken — repair should fix it
      const repaired = repairUnescapedQuotes(geminiOutput);
      expect(() => JSON.parse(repaired)).not.toThrow();
    }
  });

  it('handles multi-field object with one broken string value', () => {
    const broken = '{"title": "Milwaukee M18 Drill 1/2" Chuck", "price": 299, "inStock": true}';
    const repaired = repairUnescapedQuotes(broken);
    const parsed = JSON.parse(repaired);
    expect(parsed.price).toBe(299);
    expect(parsed.inStock).toBe(true);
    expect(parsed.title).toContain('Milwaukee');
  });
});
