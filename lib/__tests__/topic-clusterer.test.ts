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

import { describe, it, expect } from 'vitest';
import { clusterTopics, applyFrequencyCap } from '@/lib/blog-researcher/topic-clusterer';
import type { TopicCluster, RecentPublication } from '@/lib/blog-researcher/topic-clusterer';
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
