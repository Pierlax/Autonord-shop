/**
 * Blog Researcher - Analysis Module
 * Uses Claude to identify recurring pain points and select best topic
 */

import Anthropic from '@anthropic-ai/sdk';
import { SearchResult } from './search';

// Lazy initialization of Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export interface TopicAnalysis {
  topic: string;
  painPoint: string;
  frequency: number;
  avgEngagement: number;
  samplePosts: string[];
  articleAngle: string;
  targetAudience: string;
  tayaCategory: 'pricing' | 'problems' | 'comparisons' | 'reviews' | 'best';
}

export interface AnalysisResult {
  selectedTopic: TopicAnalysis;
  allTopics: TopicAnalysis[];
  reasoning: string;
}

const ANALYSIS_PROMPT = `Sei un esperto di content marketing specializzato nel metodo "They Ask, You Answer" di Marcus Sheridan.

Analizza questi post da Reddit e forum di professionisti dell'edilizia. Il tuo compito è:

1. Identificare i "DOLORI RICORRENTI" - problemi, dubbi o frustrazioni che si ripetono
2. Raggrupparli per tema
3. Selezionare IL MIGLIOR ARGOMENTO per un articolo blog

CRITERI DI SELEZIONE:
- Frequenza: quante persone ne parlano?
- Engagement: quanti upvote e commenti?
- Potenziale SEO: la gente cerca questo su Google?
- Valore TAYA: possiamo dare una risposta onesta e utile?

CATEGORIE TAYA (Big 5):
1. PRICING - Domande su costi, valore, confronti di prezzo
2. PROBLEMS - Problemi, difetti, guasti comuni
3. COMPARISONS - Confronti tra brand o modelli
4. REVIEWS - Recensioni oneste, pro e contro
5. BEST - "Qual è il migliore per..."

POST DA ANALIZZARE:
{posts}

Rispondi in JSON con questa struttura:
{
  "selectedTopic": {
    "topic": "Titolo del tema (es. 'Batterie Milwaukee M18 - Durata Reale')",
    "painPoint": "Il dolore specifico (es. 'Le batterie 5Ah durano meno del previsto su utensili ad alto consumo')",
    "frequency": 8,
    "avgEngagement": 45,
    "samplePosts": ["Citazione 1", "Citazione 2"],
    "articleAngle": "Angolo dell'articolo (es. 'Test reale: quante ore durano le batterie M18 su diversi utensili')",
    "targetAudience": "Elettricisti e installatori che usano Milwaukee quotidianamente",
    "tayaCategory": "problems"
  },
  "allTopics": [...altri temi identificati...],
  "reasoning": "Spiegazione del perché questo tema è il migliore per un articolo"
}`;

/**
 * Analyze search results to identify the best topic for an article
 */
export async function analyzeTopics(results: SearchResult[]): Promise<AnalysisResult> {
  console.log(`[Analysis] Analyzing ${results.length} search results...`);
  
  // Prepare posts summary for Claude
  const postsSummary = results.slice(0, 50).map((r, i) => {
    return `[${i + 1}] r/${r.subreddit || 'web'} | Score: ${r.score} | Comments: ${r.comments}
Titolo: ${r.title}
${r.content ? `Contenuto: ${r.content.slice(0, 300)}...` : ''}
URL: ${r.url}
---`;
  }).join('\n');

  const prompt = ANALYSIS_PROMPT.replace('{posts}', postsSummary);

  try {
    const anthropic = getAnthropicClient();
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const textBlock = message.content.find(block => block.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : null;
    
    if (!content) {
      throw new Error('Empty response from Claude');
    }

    // Clean and parse JSON
    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const analysis = JSON.parse(cleanedContent) as AnalysisResult;
    
    console.log(`[Analysis] Selected topic: ${analysis.selectedTopic.topic}`);
    console.log(`[Analysis] TAYA category: ${analysis.selectedTopic.tayaCategory}`);
    console.log(`[Analysis] Reasoning: ${analysis.reasoning}`);
    
    return analysis;
  } catch (error) {
    console.error('[Analysis] Error analyzing topics:', error);
    
    // Return fallback analysis
    return {
      selectedTopic: {
        topic: 'Confronto Batterie: Milwaukee vs Makita vs DeWalt',
        painPoint: 'I professionisti non sanno quale sistema batteria scegliere',
        frequency: 10,
        avgEngagement: 50,
        samplePosts: ['Quale batteria dura di più?', 'Meglio investire in Milwaukee o Makita?'],
        articleAngle: 'Test comparativo reale delle batterie dei 3 brand principali',
        targetAudience: 'Professionisti che devono scegliere un ecosistema di utensili',
        tayaCategory: 'comparisons',
      },
      allTopics: [],
      reasoning: 'Fallback topic - analysis failed',
    };
  }
}

/**
 * Score a topic based on TAYA criteria
 */
export function scoreTopic(topic: TopicAnalysis): number {
  let score = 0;
  
  // Frequency weight (0-30 points)
  score += Math.min(topic.frequency * 3, 30);
  
  // Engagement weight (0-30 points)
  score += Math.min(topic.avgEngagement / 2, 30);
  
  // TAYA category bonus (0-20 points)
  const categoryBonus: Record<string, number> = {
    'pricing': 20,      // Highest value - people search for prices
    'problems': 18,     // High value - honest problem discussion
    'comparisons': 15,  // Good value - comparison content
    'best': 12,         // Moderate value
    'reviews': 10,      // Lower value - many competitors
  };
  score += categoryBonus[topic.tayaCategory] || 10;
  
  // Sample posts quality (0-20 points)
  score += Math.min(topic.samplePosts.length * 5, 20);
  
  return score;
}
