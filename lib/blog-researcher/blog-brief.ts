/**
 * Blog Brief Generator
 *
 * Trasforma il corpus scoperto dal RAG Bridge in un brief editoriale strutturato.
 * Il brief è la fase di scoperta separata dalla fase di scrittura:
 * prima si capisce COSA scrivere (brief), poi si scrive (drafting-v2).
 *
 * Output: ArticleBrief — oggetto che l'evaluator-optimizer del product RAG
 * userebbe come "evidence graph" ma applicato a temi editoriali.
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';
import { TopicAnalysis } from './analysis';
import { BlogDiscoveryResult, BlogDiscoveredSource } from './rag-bridge';

const log = loggers.blog;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArticleOutlineSection {
  sectionTitle: string;
  angle: string;
  keyPoints: string[];
  sources: string[];
}

export interface ArticleBrief {
  topic: string;
  painPoint: string;
  searchIntent: string;
  articleAngle: string;
  recommendedTitle: string;
  recommendedTitleIT: string;
  targetAudience: string;
  tayaCategory: string;
  outline: ArticleOutlineSection[];
  supportingSources: Array<{
    name: string;
    url: string;
    type: string;
    keyData: string;
  }>;
  forumQuotes: string[];
  counterpoints: string[];
  ctaContext: string;
  seoKeywords: string[];
  confidence: number; // 0-100
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildBriefPrompt(topic: TopicAnalysis, discovery: BlogDiscoveryResult): string {
  const snippetsBlock = discovery.topSnippets
    ? discovery.topSnippets
    : '(nessuna fonte trovata — usa le tue conoscenze sul settore)';

  // Evidence graph context (conflicts, node types)
  const graphContext = discovery.evidenceGraph.buildContext();
  const conflicts = discovery.evidenceGraph.detectConflicts();
  const conflictBlock = conflicts.length > 0
    ? `\n⚠️ CONFLITTI RILEVATI (${conflicts.length}):\n${conflicts.slice(0, 3).map(c => `- "${c.claim}": ${c.values.join(' vs ')}`).join('\n')}`
    : '';

  // Layer 5 routing stats
  const routed = discovery.routed;
  const sourceStats = [
    `Forum voices: ${routed.forum_voices?.length ?? 0}`,
    `Expert validation: ${routed.expert_validation?.length ?? 0}`,
    `Editorial angle: ${routed.editorial_angle?.length ?? 0}`,
    `Official claims: ${routed.official_claim?.length ?? 0}`,
    `Quality score: ${(discovery.evaluation.qualityScore * 100).toFixed(0)}%`,
    `Second pass: ${discovery.secondPassRan ? 'sì' : 'no'}`,
  ].join(' | ');

  return `Sei un content strategist senior specializzato in content marketing B2B per il settore edilizia e elettroutensili professionali.
Usi il metodo "They Ask, You Answer" e hai accesso a fonti reali raccolte tramite Universal RAG v2 (pipeline a 7 layer: discovery, navigator, corpus, router, rerank, evidence graph, evaluator-optimizer).

## COMPITO

Analizza il corpus RAG e l'evidence graph per creare un BRIEF EDITORIALE STRUTTURATO per un articolo sul tema:

**Topic selezionato**: ${topic.topic}
**Pain point**: ${topic.painPoint}
**Categoria TAYA**: ${topic.tayaCategory}
**Audience target**: ${topic.targetAudience}
**Search intent**: ${topic.searchIntent}
**Angolo proposto**: ${topic.articleAngle}

## CORPUS RAG (${sourceStats})

${snippetsBlock}

## EVIDENCE GRAPH (grafo topic/claim/source)

${graphContext}${conflictBlock}

## ISTRUZIONI

Dal materiale raccolto, estrai:
1. Le **citazioni reali** dai forum (frasi autentiche di professionisti, non parafrasate)
2. I **dati tecnici** verificabili dai review/blog autorevoli
3. I **controargomenti** (obiezioni, punti deboli, pareri contrari al mainstream)
4. Un **outline dettagliato** che risponda davvero al pain point con sezioni concrete
5. Un **titolo ottimizzato** per SEO italiano e click-through rate

Il brief deve essere orientato al professionista italiano (elettricista, carpentiere, operatore cantiere).
Evita generalità e punta a dati concreti, numeri reali, esperienze verificate.

## OUTPUT JSON

Rispondi SOLO con JSON valido:
{
  "topic": "titolo descrittivo del tema",
  "painPoint": "il problema specifico in una frase",
  "searchIntent": "cosa cerca su Google chi ha questo problema (3-6 parole chiave)",
  "articleAngle": "l'angolo specifico e differenziante dell'articolo",
  "recommendedTitle": "Titolo SEO ottimizzato (50-60 caratteri)",
  "recommendedTitleIT": "Titolo in italiano naturale per il lettore",
  "targetAudience": "profilo del lettore target",
  "tayaCategory": "${topic.tayaCategory}",
  "outline": [
    {
      "sectionTitle": "Titolo sezione",
      "angle": "Angolo specifico della sezione",
      "keyPoints": ["punto 1", "punto 2", "punto 3"],
      "sources": ["dominio o nome fonte usata"]
    }
  ],
  "supportingSources": [
    {
      "name": "nome fonte",
      "url": "url se disponibile",
      "type": "forum_thread | review | editorial | official",
      "keyData": "dato chiave estratto da questa fonte"
    }
  ],
  "forumQuotes": [
    "citazione autentica dal forum 1",
    "citazione autentica dal forum 2",
    "citazione autentica dal forum 3"
  ],
  "counterpoints": [
    "obiezione o punto debole 1",
    "punto di vista contrario 2"
  ],
  "ctaContext": "come collegare l'articolo ai prodotti Autonord (categoria o brand specifico)",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "confidence": 75
}`;
}

// ---------------------------------------------------------------------------
// Fallback brief
// ---------------------------------------------------------------------------

function buildFallbackBrief(topic: TopicAnalysis): ArticleBrief {
  return {
    topic: topic.topic,
    painPoint: topic.painPoint,
    searchIntent: topic.searchIntent,
    articleAngle: topic.articleAngle,
    recommendedTitle: topic.topic,
    recommendedTitleIT: topic.topic,
    targetAudience: topic.targetAudience,
    tayaCategory: topic.tayaCategory,
    outline: [
      {
        sectionTitle: 'Introduzione',
        angle: topic.emotionalHook,
        keyPoints: ['Presenta il problema', 'Aggancia il lettore', 'Anticipa la soluzione'],
        sources: [],
      },
      {
        sectionTitle: 'Analisi del problema',
        angle: topic.painPoint,
        keyPoints: ['Dati concreti', 'Esperienze dei professionisti', 'Quando si manifesta'],
        sources: [],
      },
      {
        sectionTitle: 'Cosa dicono i professionisti',
        angle: 'Opinioni reali dal campo',
        keyPoints: ['Cita il forum', 'Pros e cons', 'Casi d\'uso reali'],
        sources: [],
      },
      {
        sectionTitle: 'Il verdetto di Autonord',
        angle: 'Raccomandazione concreta',
        keyPoints: ['A chi serve', 'A chi non serve', 'CTA al prodotto'],
        sources: [],
      },
    ],
    supportingSources: [],
    forumQuotes: topic.samplePosts,
    counterpoints: [],
    ctaContext: `Prodotti correlati al tema "${topic.topic}" nel catalogo Autonord`,
    seoKeywords: [topic.searchIntent],
    confidence: 40,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Genera un brief editoriale strutturato combinando il topic selezionato
 * con il corpus scoperto dal RAG Bridge.
 *
 * Il brief è il "contratto" tra ricerca e scrittura:
 * definisce esattamente cosa scrivere prima che il drafting inizi.
 */
export async function generateArticleBrief(
  topic: TopicAnalysis,
  discovery: BlogDiscoveryResult
): Promise<ArticleBrief> {
  log.info(`[BlogBrief] Generating brief for: "${topic.topic}" | Sources available: ${discovery.sources.length}`);

  if (discovery.sources.length === 0) {
    log.warn('[BlogBrief] No sources from RAG bridge — using fallback brief');
    return buildFallbackBrief(topic);
  }

  const prompt = buildBriefPrompt(topic, discovery);

  try {
    const result = await generateTextSafe({
      system: 'Sei un content strategist esperto in content marketing B2B per il settore edilizia e utensili professionali. Rispondi SOLO in JSON valido, senza markdown wrapper.',
      prompt,
      maxTokens: 3000,
      temperature: 0.3,
    });

    const raw = result.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const brief = JSON.parse(raw) as ArticleBrief;

    log.info(`[BlogBrief] Brief generated | confidence: ${brief.confidence} | outline sections: ${brief.outline?.length ?? 0} | quotes: ${brief.forumQuotes?.length ?? 0}`);

    return brief;
  } catch (error) {
    log.error('[BlogBrief] Failed to generate brief:', error);
    return buildFallbackBrief(topic);
  }
}

// ---------------------------------------------------------------------------
// Article generator from brief
// ---------------------------------------------------------------------------

/**
 * Genera l'articolo HTML completo a partire dal brief editoriale.
 * Sostituisce il workflow classico topic → drafting con:
 *   topic → brief → articolo strutturato
 *
 * Compatibile con l'output di generateEnhancedArticle() (drafting-v2).
 */
export async function generateBriefedArticle(brief: ArticleBrief): Promise<{
  title: string;
  titleIT: string;
  slug: string;
  metaDescription: string;
  htmlContent: string;
  excerpt: string;
  tags: string[];
  category: string;
  estimatedReadTime: number;
  sources: Array<{ name: string; url: string; dataUsed: string }>;
}> {
  log.info(`[BlogBrief] Drafting article from brief: "${brief.recommendedTitle}"`);

  const outlineBlock = brief.outline
    .map((s, i) => `${i + 1}. **${s.sectionTitle}** — ${s.angle}\n   Punti: ${s.keyPoints.join('; ')}`)
    .join('\n');

  const quotesBlock = brief.forumQuotes.length > 0
    ? brief.forumQuotes.map(q => `- "${q}"`).join('\n')
    : '(nessuna citazione forum disponibile)';

  const counterBlock = brief.counterpoints.length > 0
    ? brief.counterpoints.map(c => `- ${c}`).join('\n')
    : '(nessun contro-argomento identificato)';

  const sourcesBlock = brief.supportingSources.length > 0
    ? brief.supportingSources.map(s => `- ${s.name}: ${s.keyData}`).join('\n')
    : '(usa le tue conoscenze del settore)';

  const prompt = `Sei un content writer esperto in content marketing B2B per il settore edilizia e utensili professionali.
Scrivi un articolo completo per il blog di Autonord.it seguendo ESATTAMENTE il brief editoriale fornito.

## BRIEF

**Titolo**: ${brief.recommendedTitleIT}
**Angolo**: ${brief.articleAngle}
**Audience**: ${brief.targetAudience}
**Categoria TAYA**: ${brief.tayaCategory}
**CTA contesto**: ${brief.ctaContext}
**SEO keywords**: ${brief.seoKeywords.join(', ')}

## OUTLINE

${outlineBlock}

## CITAZIONI DAI FORUM (usa queste nel testo in modo naturale)

${quotesBlock}

## DATI E FONTI

${sourcesBlock}

## CONTROARGOMENTI DA INCLUDERE

${counterBlock}

## REGOLE

1. Scrivi in italiano professionale, diretto, senza paroloni.
2. Ogni sezione deve avere TITOLO H2 o H3 con tag HTML.
3. Includi le citazioni forum tra virgolette con attribuzione "(da forum professionisti)".
4. Almeno una tabella comparativa se rilevante.
5. CTA finale che rimanda ai prodotti Autonord pertinenti.
6. Lunghezza minima: 900 parole.
7. Formato: HTML pulito (h2, h3, p, ul, li, strong, table, tr, td, th).
8. NON usare frasi generiche tipo "è importante" o "bisogna tenere a mente".
9. Rispondi solo con l'HTML dell'articolo, nessun testo fuori.

Scrivi ora l'articolo:`;

  try {
    const result = await generateTextSafe({
      system: 'Sei un content writer B2B specializzato in utensili e attrezzatura edile professionale. Scrivi in italiano. Output: solo HTML.',
      prompt,
      maxTokens: 4000,
      temperature: 0.5,
    });

    const htmlContent = result.text.trim();
    const wordCount = htmlContent.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const estimatedReadTime = Math.max(1, Math.round(wordCount / 200));

    // Generate slug from title
    const slug = brief.recommendedTitle
      .toLowerCase()
      .replace(/[àáâã]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõ]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

    const metaDescription = `${brief.painPoint}. ${brief.articleAngle}`.slice(0, 160);
    const excerpt = `${brief.articleAngle}. Scopri i consigli di Autonord.`.slice(0, 300);

    // Map brief sources → Shopify article format
    const sources = brief.supportingSources.map(s => ({
      name: s.name,
      url: s.url,
      dataUsed: s.keyData,
    }));

    log.info(`[BlogBrief] Article drafted | words: ~${wordCount} | read time: ${estimatedReadTime}min`);

    return {
      title: brief.recommendedTitle,
      titleIT: brief.recommendedTitleIT,
      slug,
      metaDescription,
      htmlContent,
      excerpt,
      tags: brief.seoKeywords.slice(0, 6),
      category: brief.tayaCategory,
      estimatedReadTime,
      sources,
    };
  } catch (error) {
    log.error('[BlogBrief] Article drafting failed:', error);
    throw error;
  }
}
