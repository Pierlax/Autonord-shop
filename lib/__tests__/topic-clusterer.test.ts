/**
 * Tests — W-BR-4 semantic synonym normalization + W-BR-5 editorial frequency cap
 *
 * W-BR-4: Verifies that semantically identical topics with different wording
 *   ("avvitatore a batteria" vs "trapano cordless") are grouped into the same
 *   cluster after synonym normalization, not split into separate articles.
 *
 * W-BR-5: Verifies that applyFrequencyCap() correctly filters clusters that
 *   would exceed the per-brand rolling window cap.
 */

import { describe, it, expect, vi } from 'vitest';
import { clusterTopics, clusterTopicsAsync, cosineSimilarity, applyFrequencyCap } from '@/lib/blog-researcher/topic-clusterer';
import type { TopicCluster, RecentPublication } from '@/lib/blog-researcher/topic-clusterer';
import { embedTexts } from '@/lib/shopify/ai-client';

vi.mock('@/lib/shopify/ai-client', () => ({
  embedTexts: vi.fn(),
  generateTextSafe: vi.fn(),
  generateObjectSafe: vi.fn(),
}));

const embedTextsMock = vi.mocked(embedTexts);
import type { TopicAnalysis } from '@/lib/blog-researcher/analysis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(
  topic: string,
  painPoint = '',
  searchIntent = '',
): TopicAnalysis {
  return {
    topic,
    painPoint,
    searchIntent,
    frequency: 10,
    avgEngagement: 50,
    samplePosts: [],
    articleAngle: '',
    targetAudience: 'elettricista',
    tayaCategory: 'problems',
    emotionalHook: '',
  };
}

function makeCluster(label: string, brands: string[]): TopicCluster {
  return {
    id: label.replace(/\s+/g, '-').toLowerCase(),
    representativeTopic: makeTopic(label),
    relatedTopics: [],
    clusterLabel: label,
    editorialScore: 80,
    tayaCategory: 'problems',
    topBrands: brands,
    topKeywords: ['avvitatore'],
    estimatedSearchVolume: 'medium',
    hasForum: true,
  };
}

// ---------------------------------------------------------------------------
// W-BR-4: Synonym normalization clustering
// ---------------------------------------------------------------------------

describe('W-BR-4: Synonym normalization → clustering', () => {
  it('clusters "avvitatore a batteria Milwaukee" with "trapano cordless Milwaukee"', () => {
    const topics = [
      makeTopic(
        'Avvitatore a batteria Milwaukee M18',
        'batteria si scarica dopo 30 minuti',
        'avvitatore Milwaukee a batteria',
      ),
      makeTopic(
        'Trapano cordless Milwaukee quale scegliere',
        'quale cordless Milwaukee scegliere',
        'trapano cordless Milwaukee',
      ),
    ];
    const clusters = clusterTopics(topics);
    expect(clusters).toHaveLength(1);
  });

  it('keeps topically unrelated topics in separate clusters', () => {
    const topics = [
      makeTopic('Milwaukee M18 avvitatore batteria scarica', 'batteria scarica veloce'),
      makeTopic('Yanmar miniescavatore revisione', 'motore si surriscalda'),
    ];
    const clusters = clusterTopics(topics);
    expect(clusters).toHaveLength(2);
  });

  it('treats "senza fili" and "cordless" as equivalent for clustering', () => {
    const topics = [
      makeTopic('Smerigliatrice senza fili Makita problemi', 'si surriscalda', 'smerigliatrice senza fili Makita'),
      makeTopic('Grinder cordless Makita issue', 'overheating problem', 'cordless grinder Makita'),
    ];
    const clusters = clusterTopics(topics);
    expect(clusters).toHaveLength(1);
  });

  it('treats "come scegliere" and "quale scegliere" as equivalent', () => {
    const topics = [
      makeTopic('Come scegliere trapano Bosch', '', 'come scegliere trapano Bosch'),
      makeTopic('Quale trapano Bosch scegliere', '', 'quale scegliere trapano Bosch'),
    ];
    const clusters = clusterTopics(topics);
    expect(clusters).toHaveLength(1);
  });

  it('handles empty input without crashing', () => {
    expect(clusterTopics([])).toHaveLength(0);
  });

  it('returns a single cluster for a single topic', () => {
    const clusters = clusterTopics([makeTopic('Milwaukee M18 avvitatore')]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].representativeTopic.topic).toBe('Milwaukee M18 avvitatore');
  });
});

// ---------------------------------------------------------------------------
// W-BR-5: Frequency cap
// ---------------------------------------------------------------------------

describe('W-BR-5: applyFrequencyCap()', () => {
  it('removes a cluster when brand already hit the cap this week', () => {
    const cluster = makeCluster('Milwaukee M18 avvitatore', ['milwaukee']);

    const recentPubs: RecentPublication[] = [
      {
        title: 'Milwaukee M18 batteria scarica — guida',
        publishedAt: new Date(), // today
        brands: ['milwaukee'],
      },
    ];

    const filtered = applyFrequencyCap([cluster], recentPubs, {
      maxPerBrandPerWindow: 1,
      windowDays: 7,
    });
    expect(filtered).toHaveLength(0);
  });

  it('keeps a cluster when brand has not been published this week', () => {
    const cluster = makeCluster('Makita DHP481 guida acquisto', ['makita']);

    const recentPubs: RecentPublication[] = [
      {
        title: 'Milwaukee M18 batteria scarica',
        publishedAt: new Date(),
        brands: ['milwaukee'],
      },
    ];

    const filtered = applyFrequencyCap([cluster], recentPubs, {
      maxPerBrandPerWindow: 1,
      windowDays: 7,
    });
    expect(filtered).toHaveLength(1);
  });

  it('allows a second publication when cap > 1', () => {
    const cluster = makeCluster('Milwaukee M18 confronto Makita', ['milwaukee']);

    const recentPubs: RecentPublication[] = [
      {
        title: 'Milwaukee M18 batteria',
        publishedAt: new Date(),
        brands: ['milwaukee'],
      },
    ];

    const filtered = applyFrequencyCap([cluster], recentPubs, {
      maxPerBrandPerWindow: 2, // cap is 2, only 1 published → still allowed
      windowDays: 7,
    });
    expect(filtered).toHaveLength(1);
  });

  it('ignores publications outside the rolling window', () => {
    const cluster = makeCluster('Milwaukee M18 smerigliatrice', ['milwaukee']);

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const recentPubs: RecentPublication[] = [
      {
        title: 'Milwaukee M18 articolo vecchio',
        publishedAt: tenDaysAgo, // outside default 7-day window
        brands: ['milwaukee'],
      },
    ];

    const filtered = applyFrequencyCap([cluster], recentPubs, {
      maxPerBrandPerWindow: 1,
      windowDays: 7,
    });
    expect(filtered).toHaveLength(1); // old pub doesn't count
  });

  it('returns all clusters unchanged when recentPublications is empty', () => {
    const clusters = [
      makeCluster('Milwaukee M18', ['milwaukee']),
      makeCluster('Makita DHP481', ['makita']),
    ];
    const filtered = applyFrequencyCap(clusters, []);
    expect(filtered).toHaveLength(2);
  });

  it('falls back to brand extraction from title when brands field is omitted', () => {
    const cluster = makeCluster('Milwaukee M18 avvitatore', ['milwaukee']);

    const recentPubs: RecentPublication[] = [
      {
        title: 'Milwaukee M18 batteria 2025',
        publishedAt: new Date(),
        // no brands field — should extract 'milwaukee' from title
      },
    ];

    const filtered = applyFrequencyCap([cluster], recentPubs, {
      maxPerBrandPerWindow: 1,
      windowDays: 7,
    });
    expect(filtered).toHaveLength(0); // brand extracted from title, cap applied
  });
});

// ---------------------------------------------------------------------------
// Cosine similarity unit tests
// ---------------------------------------------------------------------------

describe('cosineSimilarity()', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.9, 0.3, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it('returns 0 for an all-zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns ~0.97 for nearly identical vectors', () => {
    const a = [1.0, 0.0, 0.5];
    const b = [0.9, 0.1, 0.5]; // very close
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.95);
  });

  it('returns a low score for very different vectors', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 0, 0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// Hybrid clustering — clusterTopics() with explicit mock embeddings
// ---------------------------------------------------------------------------

describe('clusterTopics() with embeddings (hybrid mode)', () => {
  it('clusters two semantically similar topics even with zero keyword overlap', () => {
    const topics = [
      makeTopic('Durata batterie Milwaukee M18', 'batteria finisce presto'),
      makeTopic('Autonomia accumulatore Milwaukee', 'si scarica in fretta'),
    ];

    // Embeddings: high cosine similarity (0.95) — same semantic concept, different words
    // hybrid = 0.70 × 0.95 + 0.30 × jaccard ≈ 0.665 + small → > HYBRID_THRESHOLD 0.55
    const embedA = [1.0, 0.3, 0.0, 0.0];
    const embedB = [0.95, 0.31, 0.01, 0.0]; // nearly identical direction

    const clusters = clusterTopics(topics, [embedA, embedB]);
    expect(clusters).toHaveLength(1);
  });

  it('keeps semantically unrelated topics in separate clusters', () => {
    const topics = [
      makeTopic('Milwaukee M18 batteria scarica', 'autonomia ridotta'),
      makeTopic('Bosch compressore rumoroso', 'troppo rumore cantiere'),
    ];

    // Embeddings: low cosine similarity — different domains
    const embedA = [1.0, 0.0, 0.0, 0.0];
    const embedB = [0.0, 0.0, 1.0, 0.0]; // orthogonal

    const clusters = clusterTopics(topics, [embedA, embedB]);
    expect(clusters).toHaveLength(2);
  });

  it('falls back to Jaccard when embeddings array length mismatches topics', () => {
    const topics = [
      makeTopic('Avvitatore a batteria Milwaukee M18', 'batteria si scarica'),
      makeTopic('Trapano cordless Milwaukee quale scegliere', 'quale cordless Milwaukee'),
    ];

    // Wrong length — should fall back to Jaccard, which clusters these two (synonym overlap)
    const clusters = clusterTopics(topics, [[1, 0]]); // only 1 embedding for 2 topics
    expect(clusters).toHaveLength(1); // Jaccard finds them similar via synonyms
  });
});

// ---------------------------------------------------------------------------
// clusterTopicsAsync() — uses mocked embedTexts
// ---------------------------------------------------------------------------

describe('clusterTopicsAsync()', () => {
  it('uses embeddings when embedTexts succeeds', async () => {
    const topics = [
      makeTopic('Batteria Milwaukee M18 autonomia', 'si scarica presto'),
      makeTopic('Durata accumulatore Milwaukee', 'finisce in 20 minuti'),
    ];

    // High-cosine embeddings → should cluster
    const emb0 = [1.0, 0.2, 0.0];
    const emb1 = [0.98, 0.21, 0.0];
    embedTextsMock.mockResolvedValueOnce([emb0, emb1]);

    const clusters = await clusterTopicsAsync(topics);
    expect(clusters).toHaveLength(1);
    expect(embedTextsMock).toHaveBeenCalledOnce();
  });

  it('falls back to Jaccard when embedTexts returns null', async () => {
    embedTextsMock.mockResolvedValueOnce(null);

    const topics = [
      makeTopic('Avvitatore a batteria Milwaukee M18', 'batteria scarica'),
      makeTopic('Trapano cordless Milwaukee quale scegliere', 'quale scegliere cordless'),
    ];

    // Jaccard finds these similar via synonym normalization
    const clusters = await clusterTopicsAsync(topics);
    expect(clusters).toHaveLength(1);
  });

  it('falls back to Jaccard when embedTexts throws', async () => {
    embedTextsMock.mockRejectedValueOnce(new Error('API quota exceeded'));

    const topics = [
      makeTopic('Avvitatore a batteria Milwaukee M18', 'batteria scarica'),
      makeTopic('Trapano cordless Milwaukee quale scegliere', 'quale scegliere cordless'),
    ];

    const clusters = await clusterTopicsAsync(topics);
    expect(clusters).toHaveLength(1); // Jaccard still groups them
  });

  it('returns [] for empty input without calling embedTexts', async () => {
    embedTextsMock.mockClear();
    const clusters = await clusterTopicsAsync([]);
    expect(clusters).toHaveLength(0);
    expect(embedTextsMock).not.toHaveBeenCalled();
  });
});
