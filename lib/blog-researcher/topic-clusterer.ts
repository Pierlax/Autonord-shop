/**
 * Topic Clusterer — raggruppa TopicAnalysis simili per evitare articoli duplicati.
 *
 * Problema che risolve: analysis.ts restituisce una lista piatta di topic.
 * Senza clustering, il cron job può scrivere 3 articoli diversi che parlano
 * tutti della stessa lamentela ("batterie Milwaukee scariche") con angoli
 * leggermente diversi, sprecando quota settimanale e penalizzando SEO per
 * keyword cannibalization.
 *
 * Algoritmo (rule-based, senza AI call):
 *   1. Estrai keyword significative da ogni topic (brand + sostantivi prodotto)
 *   2. Raggruppa topic con Jaccard similarity > CLUSTER_THRESHOLD sui keyword
 *   3. Dentro ogni cluster, eleggi il rappresentante con il punteggio più alto
 *   4. Calcola lo score aggregato del cluster (somma engagement + bonus copertura)
 *   5. Restituisci cluster ordinati per editorial score
 */

import { TopicAnalysis, scoreTopic } from './analysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopicCluster {
  /** Slug univoco del cluster, derivato dal topic rappresentativo */
  id: string;
  /** Topic con il punteggio più alto nel cluster — candidato all'articolo */
  representativeTopic: TopicAnalysis;
  /** Altri topic nel cluster (già coperti dal rappresentativo) */
  relatedTopics: TopicAnalysis[];
  /** Etichetta leggibile: "{brand} {keyword principale}" */
  clusterLabel: string;
  /** Score aggregato: engagement sommato + bonus copertura + bonus TAYA */
  editorialScore: number;
  /** Categoria TAYA del cluster (dal rappresentativo) */
  tayaCategory: TopicAnalysis['tayaCategory'];
  /** Brand rilevati nel cluster */
  topBrands: string[];
  /** Keyword principali condivise dai topic del cluster */
  topKeywords: string[];
  /** Stima volume di ricerca basata su engagement e frequenza */
  estimatedSearchVolume: 'high' | 'medium' | 'low';
  /** Il cluster ha almeno un topic con voci forum (samplePosts > 0) */
  hasForum: boolean;
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

const TOOL_NOUNS = new Set([
  // Utensili
  'trapano', 'avvitatore', 'smerigliatrice', 'sega', 'levigatrice',
  'martello', 'fresatrice', 'pialla', 'tornio', 'compressore',
  'seghetto', 'tassellatore', 'decespugliatore', 'soffiatore',
  // Componenti
  'batteria', 'caricatore', 'motore', 'spazzola', 'disco', 'lama',
  'mandrino', 'chuck', 'blade', 'battery', 'charger',
  // Macchine cantiere
  'escavatore', 'miniescavatore', 'pala', 'bulldozer', 'gru', 'carrello',
  // Generatori
  'generatore', 'gruppo', 'elettrogeno', 'inverter', 'alternatore',
  // EN equivalents
  'drill', 'grinder', 'saw', 'sander', 'hammer', 'router', 'planer',
  'jigsaw', 'circular', 'reciprocating', 'oscillating', 'multitool',
  // Sistema / ecosistema
  'sistema', 'piattaforma', 'ecosistema', 'system', 'platform',
]);

const KNOWN_BRANDS = new Set([
  'milwaukee', 'makita', 'dewalt', 'bosch', 'hikoki', 'metabo',
  'festool', 'hilti', 'flex', 'ryobi', 'stanley', 'fein', 'wurth',
  'yanmar', 'komatsu', 'kubota', 'doosan', 'honda', 'sdmo',
  'stihl', 'husqvarna', 'ego', 'greenworks',
]);

const STOP_WORDS = new Set([
  // IT
  'il', 'la', 'le', 'gli', 'del', 'della', 'dei', 'degli', 'per',
  'con', 'che', 'sono', 'come', 'anche', 'però', 'quindi', 'questo',
  'questa', 'tra', 'fra', 'dopo', 'prima', 'quando', 'dove', 'chi',
  'vale', 'pena', 'quale', 'quale', 'scegliere', 'meglio', 'migliore',
  'top', 'best', 'guida', 'confronto', 'vs', 'versus', 'una', 'uno',
  'anno', 'mese', 'settimana', 'volta', 'ore', 'ore', 'minuti',
  // EN
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been',
  'they', 'their', 'which', 'would', 'what', 'when', 'where', 'who',
  'how', 'why', 'best', 'top', 'guide', 'review', 'vs', 'versus',
]);

/**
 * Estrae keyword significative da un topic: brand + sostantivi prodotto.
 * Normalizza in lowercase e rimuove stop words.
 */
function extractKeywords(topic: TopicAnalysis): Set<string> {
  const text = `${topic.topic ?? ''} ${topic.painPoint ?? ''} ${topic.searchIntent ?? ''}`.toLowerCase();
  const tokens = text.split(/[\s,.:;!?()/\\'"]+/).filter(t => t.length >= 3);

  const keywords = new Set<string>();
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    if (KNOWN_BRANDS.has(token) || TOOL_NOUNS.has(token)) {
      keywords.add(token);
    } else if (token.length >= 5 && !STOP_WORDS.has(token)) {
      // Includi anche token sufficientemente lunghi come keyword aggiuntive
      keywords.add(token);
    }
  }

  return keywords;
}

function extractBrandsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  return Array.from(KNOWN_BRANDS).filter(b => lower.includes(b));
}

// ---------------------------------------------------------------------------
// Jaccard similarity
// ---------------------------------------------------------------------------

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach(k => { if (b.has(k)) intersection++; });
  const union = a.size + b.size - intersection;
  return intersection / union;
}

// ---------------------------------------------------------------------------
// Clustering — greedy, O(n²) ma n < 30 per i topic analizzati
// ---------------------------------------------------------------------------

const CLUSTER_THRESHOLD = 0.18; // Jaccard: >18% overlap → stesso cluster

/**
 * Raggruppa i topic in cluster per similarità keyword.
 * Greedy: ogni topic viene assegnato al cluster esistente più simile
 * se la similarità supera la soglia; altrimenti crea un nuovo cluster.
 */
export function clusterTopics(topics: TopicAnalysis[]): TopicCluster[] {
  if (topics.length === 0) return [];

  // Pre-calcola keyword per ogni topic
  const topicKeywords = topics.map(t => extractKeywords(t));

  // Struttura: ogni cluster è un array di indici in `topics`
  const groups: number[][] = [];

  for (let i = 0; i < topics.length; i++) {
    let bestGroupIdx = -1;
    let bestSimilarity = CLUSTER_THRESHOLD;

    for (let g = 0; g < groups.length; g++) {
      // Confronta con il rappresentante del gruppo (primo elemento)
      const repIdx = groups[g][0];
      const sim = jaccardSimilarity(topicKeywords[i], topicKeywords[repIdx]);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestGroupIdx = g;
      }
    }

    if (bestGroupIdx >= 0) {
      groups[bestGroupIdx].push(i);
    } else {
      groups.push([i]);
    }
  }

  return groups.map(group => buildCluster(group, topics, topicKeywords));
}

// ---------------------------------------------------------------------------
// Cluster builder
// ---------------------------------------------------------------------------

function buildCluster(
  indices: number[],
  topics: TopicAnalysis[],
  topicKeywords: Set<string>[]
): TopicCluster {
  const clusterTopics = indices.map(i => topics[i]);

  // Rappresentante = topic con score più alto
  // scoreTopic() può crashare se samplePosts è undefined/null (LLM non lo include sempre)
  const scored = clusterTopics.map(t => {
    try { return { t, score: scoreTopic(t) }; }
    catch { return { t, score: 0 }; }
  });
  scored.sort((a, b) => b.score - a.score);
  const representative = scored[0].t;
  const related = scored.slice(1).map(s => s.t);

  // Keywords condivise (unione di tutti i keyword del cluster)
  const allKeywords = new Set<string>();
  indices.forEach(i => topicKeywords[i].forEach(k => allKeywords.add(k)));

  // Brand rilevati
  const allText = clusterTopics.map(t => `${t.topic} ${t.painPoint}`).join(' ');
  const topBrands = extractBrandsFromText(allText);

  // Keyword principali (esclusi brand, max 5)
  const topKeywords = Array.from(allKeywords)
    .filter(k => !KNOWN_BRANDS.has(k))
    .slice(0, 5);

  // Score aggregato del cluster
  const editorialScore = computeClusterScore(clusterTopics, scored[0].score);

  // Etichetta
  const clusterLabel = buildClusterLabel(representative, topBrands, topKeywords);

  // Stima search volume
  const estimatedSearchVolume = estimateSearchVolume(representative, clusterTopics.length);

  // Ha voci forum?
  const hasForum = clusterTopics.some(t => t.samplePosts.length > 0);

  // ID: slug dal topic rappresentativo
  const id = representative.topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

  return {
    id,
    representativeTopic: representative,
    relatedTopics: related,
    clusterLabel,
    editorialScore,
    tayaCategory: representative.tayaCategory,
    topBrands,
    topKeywords,
    estimatedSearchVolume,
    hasForum,
  };
}

function computeClusterScore(topics: TopicAnalysis[], repScore: number): number {
  // Base: score del rappresentativo
  let score = repScore;

  // Bonus per cluster con più topic (più segnali = più ricercato)
  if (topics.length >= 3) score += 12;
  else if (topics.length >= 2) score += 6;

  // Bonus engagement aggregato
  const totalEngagement = topics.reduce((sum, t) => sum + t.avgEngagement, 0);
  score += Math.min(totalEngagement / 10, 15);

  return Math.round(score);
}

function buildClusterLabel(
  rep: TopicAnalysis,
  brands: string[],
  keywords: string[]
): string {
  const brand = brands[0]
    ? brands[0].charAt(0).toUpperCase() + brands[0].slice(1)
    : '';
  const kw = keywords[0] ?? rep.tayaCategory;
  return brand ? `${brand} — ${kw}` : kw;
}

function estimateSearchVolume(
  rep: TopicAnalysis,
  clusterSize: number
): 'high' | 'medium' | 'low' {
  const engagementScore = rep.avgEngagement + rep.frequency * 5;
  if (engagementScore > 120 || clusterSize >= 3) return 'high';
  if (engagementScore > 50 || clusterSize >= 2) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ordina i cluster per editorial score (discendente).
 * Usa come input i cluster restituiti da clusterTopics().
 */
export function rankClusters(clusters: TopicCluster[]): TopicCluster[] {
  return [...clusters].sort((a, b) => b.editorialScore - a.editorialScore);
}

/**
 * Seleziona il cluster migliore considerando:
 * - Score editoriale
 * - Preferenza per cluster con voci forum (hasForum)
 * - Preferenza per high search volume
 */
export function pickBestCluster(clusters: TopicCluster[]): TopicCluster | null {
  if (clusters.length === 0) return null;

  const ranked = rankClusters(clusters);

  // Se il top cluster ha voci forum o alto volume, prendilo direttamente
  const top = ranked[0];
  if (top.hasForum || top.estimatedSearchVolume === 'high') return top;

  // Altrimenti cerca il primo con forum nella top-3
  const withForum = ranked.slice(0, 3).find(c => c.hasForum);
  return withForum ?? top;
}

/**
 * Rimuove i cluster troppo simili a titoli già pubblicati di recente.
 * Confronto semplice su keyword overlap — evita cannibalization SEO.
 *
 * @param clusters   Cluster da filtrare
 * @param recentTitles  Titoli degli ultimi N articoli pubblicati
 */
export function deduplicateAgainstHistory(
  clusters: TopicCluster[],
  recentTitles: string[]
): TopicCluster[] {
  if (recentTitles.length === 0) return clusters;

  const historyKeywords = recentTitles.map(t => extractKeywords({ topic: t } as TopicAnalysis));

  return clusters.filter(cluster => {
    const clusterKws = extractKeywords(cluster.representativeTopic);
    for (const histKws of historyKeywords) {
      if (jaccardSimilarity(clusterKws, histKws) > 0.35) {
        return false; // Troppo simile a un articolo recente
      }
    }
    return true;
  });
}
