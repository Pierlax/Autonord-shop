/**
 * Blog Researcher - Analysis Module
 * Uses Claude Opus to identify recurring pain points with human-level insight
 * 
 * Quality principles:
 * - Deep understanding of professional context
 * - Pattern recognition across multiple sources
 * - Strategic topic selection for maximum impact
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { loggers } from '@/lib/logger';

const log = loggers.blog;
import { SearchResult } from './search';


export interface TopicAnalysis {
  topic: string;
  painPoint: string;
  frequency: number;
  avgEngagement: number;
  samplePosts: string[];
  articleAngle: string;
  targetAudience: string;
  tayaCategory: 'pricing' | 'problems' | 'comparisons' | 'reviews' | 'best';
  emotionalHook: string;
  searchIntent: string;
}

export interface AnalysisResult {
  selectedTopic: TopicAnalysis;
  allTopics: TopicAnalysis[];
  reasoning: string;
}

const ANALYSIS_PROMPT = `Sei un content strategist senior specializzato in content marketing B2B per il settore edilizia/elettroutensili. Hai 15 anni di esperienza con il metodo "They Ask, You Answer" di Marcus Sheridan.

## IL TUO COMPITO

Analizza questi post da Reddit e forum di professionisti. Devi:
1. Identificare i "DOLORI RICORRENTI" - frustrazioni, dubbi, problemi che si ripetono
2. Capire l'INTENTO DI RICERCA dietro ogni discussione
3. Selezionare IL MIGLIOR ARGOMENTO per un articolo che:
   - Risponda a una domanda che la gente cerca su Google
   - Permetta di essere onesti e trasparenti (non promozionali)
   - Abbia potenziale di posizionamento SEO
   - Sia rilevante per il mercato italiano

## CATEGORIE TAYA (Big 5)

1. **PRICING** - "Quanto costa...?", "Vale la pena...?", "Meglio spendere di più per...?"
   → Altissimo valore SEO, la gente cerca prezzi
   
2. **PROBLEMS** - "Problemi con...", "Si è rotto dopo...", "Difetti comuni di..."
   → Costruisce fiducia, mostra onestà
   
3. **COMPARISONS** - "X vs Y", "Meglio X o Y?", "Differenze tra..."
   → Ottimo per chi deve decidere
   
4. **REVIEWS** - "Opinioni su...", "Dopo 2 anni con...", "Recensione onesta di..."
   → Richiede esperienza diretta
   
5. **BEST** - "Miglior X per...", "Top 5...", "Quale X per Y?"
   → Alto volume di ricerca

## CRITERI DI SELEZIONE

- **Frequenza**: Quante persone ne parlano? (peso: 25%)
- **Engagement**: Upvote + commenti indicano interesse reale (peso: 25%)
- **Potenziale SEO**: La gente cerca questo su Google Italia? (peso: 30%)
- **Angolo unico**: Possiamo dire qualcosa che altri non dicono? (peso: 20%)

## COSA CERCARE NEI POST

- Frustrazioni ripetute ("sono stufo di...", "non ne posso più di...")
- Domande senza risposta chiara (molti commenti contrastanti)
- Confronti accesi (discussioni Milwaukee vs Makita, ecc.)
- Problemi tecnici specifici (batterie, surriscaldamento, durata)
- Dubbi sull'acquisto ("vale la pena?", "è troppo per le mie esigenze?")

## OUTPUT

Analizza i post e restituisci JSON con:
- Il topic selezionato con tutti i dettagli
- Gli altri topic identificati (per future referenze)
- Il reasoning dettagliato della scelta

---

POST DA ANALIZZARE:

{posts}

---

Rispondi SOLO con JSON valido:
{
  "selectedTopic": {
    "topic": "Titolo chiaro e specifico",
    "painPoint": "Il dolore specifico in una frase",
    "frequency": 8,
    "avgEngagement": 45,
    "samplePosts": ["Citazione 1 dal forum", "Citazione 2"],
    "articleAngle": "L'angolo specifico che prenderemo",
    "targetAudience": "Chi leggerà questo articolo",
    "tayaCategory": "problems",
    "emotionalHook": "L'emozione da toccare nell'intro",
    "searchIntent": "Cosa cerca su Google chi ha questo problema"
  },
  "allTopics": [],
  "reasoning": "Spiegazione dettagliata del perché questo topic"
}`;

/**
 * Analyze search results to identify the best topic for an article
 */
export async function analyzeTopics(results: SearchResult[]): Promise<AnalysisResult> {
  log.info(`[Analysis] Analyzing ${results.length} search results with Claude...`);
  
  // Prepare posts summary for Claude - include more context
  const postsSummary = results.slice(0, 60).map((r, i) => {
    const engagement = r.score + (r.comments * 2); // Comments are more valuable
    return `[${i + 1}] r/${r.subreddit || 'web'} | Engagement: ${engagement} (${r.score}↑ ${r.comments}💬)
"${r.title}"
${r.content ? `> ${r.content.slice(0, 400)}${r.content.length > 400 ? '...' : ''}` : '(no body text)'}
---`;
  }).join('\n\n');

  const prompt = ANALYSIS_PROMPT.replace('{posts}', postsSummary);

  try {
    const result = await generateTextSafe({
      system: 'Sei un content strategist senior specializzato in content marketing B2B per il settore edilizia/elettroutensili. Rispondi sempre in formato JSON valido.',
      prompt,
      maxTokens: 2500,
      temperature: 0.3,
    });
    const content = result.text;
    
    if (!content) {
      throw new Error('Empty response from Claude');
    }

    // Clean and parse JSON
    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const analysis = JSON.parse(cleanedContent) as AnalysisResult;
    
    log.info(`[Analysis] Selected topic: ${analysis.selectedTopic.topic}`);
    log.info(`[Analysis] TAYA category: ${analysis.selectedTopic.tayaCategory}`);
    log.info(`[Analysis] Target audience: ${analysis.selectedTopic.targetAudience}`);
    log.info(`[Analysis] Search intent: ${analysis.selectedTopic.searchIntent}`);
    
    return analysis;
  } catch (error) {
    log.error('[Analysis] Error analyzing topics:', error);
    
    // Return fallback analysis with more detail
    return {
      selectedTopic: {
        topic: 'Milwaukee vs Makita: Quale Sistema Batteria Scegliere nel 2026',
        painPoint: 'I professionisti sono indecisi su quale ecosistema di batterie investire',
        frequency: 15,
        avgEngagement: 60,
        samplePosts: [
          'Sto per investire 3000€ in utensili, meglio Milwaukee o Makita?',
          'Ho sempre usato Makita ma tutti parlano bene di Milwaukee, vale la pena cambiare?'
        ],
        articleAngle: 'Confronto onesto basato su casi d\'uso specifici: elettricista, idraulico, carpentiere',
        targetAudience: 'Professionisti che devono scegliere o cambiare ecosistema di utensili',
        tayaCategory: 'comparisons',
        emotionalHook: 'L\'ansia di fare l\'investimento sbagliato',
        searchIntent: 'milwaukee vs makita quale scegliere',
      },
      allTopics: [],
      reasoning: 'Fallback topic - il confronto tra brand è sempre rilevante e ha alto volume di ricerca',
    };
  }
}

/**
 * Score a topic based on TAYA criteria
 */
export function scoreTopic(topic: TopicAnalysis): number {
  let score = 0;
  
  // Frequency weight (0-25 points)
  score += Math.min(topic.frequency * 2.5, 25);
  
  // Engagement weight (0-25 points)
  score += Math.min(topic.avgEngagement / 2.5, 25);
  
  // TAYA category bonus (0-30 points) - pricing has highest SEO value
  const categoryBonus: Record<string, number> = {
    'pricing': 30,      // Highest value - people search for prices
    'problems': 25,     // High value - honest problem discussion
    'comparisons': 22,  // Good value - comparison content
    'best': 18,         // Moderate value - competitive
    'reviews': 15,      // Lower value - many competitors
  };
  score += categoryBonus[topic.tayaCategory] || 15;
  
  // Sample posts quality (0-20 points)
  const avgPostLength = topic.samplePosts.reduce((sum, p) => sum + p.length, 0) / topic.samplePosts.length;
  score += Math.min(avgPostLength / 10, 20);
  
  return Math.round(score);
}
