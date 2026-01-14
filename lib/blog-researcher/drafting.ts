/**
 * Blog Researcher - Article Drafting Module
 * Uses Claude to write TAYA-style blog articles
 */

import Anthropic from '@anthropic-ai/sdk';
import { TopicAnalysis } from './analysis';

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

export interface ArticleDraft {
  title: string;
  slug: string;
  metaDescription: string;
  content: string;
  excerpt: string;
  tags: string[];
  category: string;
  estimatedReadTime: number;
}

const DRAFTING_PROMPT = `Sei un esperto tecnico di elettroutensili con 20 anni di esperienza in cantiere, e anche un copywriter specializzato nel metodo "They Ask, You Answer" di Marcus Sheridan.

Scrivi un articolo blog per Autonord Service (rivenditore di elettroutensili professionali a Genova).

ARGOMENTO: {topic}
DOLORE DEL CLIENTE: {painPoint}
ANGOLO DELL'ARTICOLO: {articleAngle}
TARGET: {targetAudience}
CATEGORIA TAYA: {tayaCategory}

CITAZIONI DAI FORUM (da usare come spunto):
{samplePosts}

---

REGOLE DI SCRITTURA:

1. **TITOLO**: Onesto e diretto. Niente clickbait. Deve rispondere a una domanda reale.
   - Buono: "Quanto Durano Davvero le Batterie Milwaukee M18? Test sul Campo"
   - Cattivo: "Le INCREDIBILI Batterie Milwaukee che Cambieranno la Tua Vita!"

2. **INTRODUZIONE**: Inizia con il PROBLEMA, non con il prodotto.
   - Buono: "Se sei un elettricista che lavora 8 ore al giorno, sai quanto è frustrante..."
   - Cattivo: "Milwaukee è un brand leader nel settore..."

3. **CORPO**: 
   - Analisi tecnica onesta
   - Dati concreti quando possibile
   - Ammetti i difetti (questo costruisce fiducia)
   - Confronta alternative se rilevante

4. **VERDETTO**: Imparziale. Dì chiaramente per chi è adatto e per chi NO.

5. **TONO**: 
   - Professionale ma accessibile
   - Come un collega esperto che ti dà consigli
   - Mai da venditore o promotore
   - Usa "tu" per rivolgerti al lettore

6. **LUNGHEZZA**: 1500-2000 parole

7. **STRUTTURA HTML**:
   - Usa <h2> per sezioni principali
   - Usa <h3> per sottosezioni
   - Usa <ul>/<li> per elenchi
   - Usa <strong> per enfasi
   - Usa <blockquote> per citazioni dai forum

---

Rispondi in JSON:
{
  "title": "Titolo dell'articolo",
  "slug": "titolo-articolo-seo-friendly",
  "metaDescription": "Meta description SEO (max 160 caratteri)",
  "content": "<article>...HTML completo dell'articolo...</article>",
  "excerpt": "Riassunto di 2-3 frasi per l'anteprima",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "Categoria (es. Guide, Confronti, Recensioni)",
  "estimatedReadTime": 8
}`;

/**
 * Generate a TAYA-style article draft
 */
export async function generateArticleDraft(topic: TopicAnalysis): Promise<ArticleDraft> {
  console.log(`[Drafting] Generating article for topic: ${topic.topic}`);
  
  const prompt = DRAFTING_PROMPT
    .replace('{topic}', topic.topic)
    .replace('{painPoint}', topic.painPoint)
    .replace('{articleAngle}', topic.articleAngle)
    .replace('{targetAudience}', topic.targetAudience)
    .replace('{tayaCategory}', topic.tayaCategory)
    .replace('{samplePosts}', topic.samplePosts.map(p => `- "${p}"`).join('\n'));

  try {
    const anthropic = getAnthropicClient();
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
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

    const article = JSON.parse(cleanedContent) as ArticleDraft;
    
    console.log(`[Drafting] Generated article: ${article.title}`);
    console.log(`[Drafting] Word count: ~${article.content.split(/\s+/).length}`);
    console.log(`[Drafting] Read time: ${article.estimatedReadTime} min`);
    
    return article;
  } catch (error) {
    console.error('[Drafting] Error generating article:', error);
    
    // Return fallback article
    return {
      title: `${topic.topic} - Guida Completa`,
      slug: topic.topic.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      metaDescription: `Scopri tutto su ${topic.topic}. Analisi tecnica onesta per professionisti.`,
      content: `<article>
        <h2>Introduzione</h2>
        <p>${topic.painPoint}</p>
        <h2>Analisi</h2>
        <p>Articolo in fase di elaborazione. Argomento: ${topic.articleAngle}</p>
        <h2>Conclusioni</h2>
        <p>Target: ${topic.targetAudience}</p>
      </article>`,
      excerpt: topic.painPoint,
      tags: ['elettroutensili', topic.tayaCategory],
      category: 'Guide',
      estimatedReadTime: 5,
    };
  }
}

/**
 * Convert HTML content to Shopify-compatible format
 */
export function formatForShopify(article: ArticleDraft): string {
  // Add Autonord branding and CTA
  const shopifyContent = `
${article.content}

<div class="article-cta" style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-top: 30px;">
  <h3>Hai bisogno di consulenza?</h3>
  <p>Il team tecnico di Autonord Service è a tua disposizione per aiutarti a scegliere l'attrezzatura giusta per le tue esigenze.</p>
  <p><strong>📞 Chiamaci:</strong> <a href="tel:0107456076">010 7456076</a></p>
  <p><strong>📍 Vieni a trovarci:</strong> Lungobisagno d'Istria 34, Genova</p>
</div>

<p style="font-size: 12px; color: #666; margin-top: 20px;">
  <em>Questo articolo è stato scritto dal team di Autonord Service basandosi su domande reali dei professionisti. 
  Ultimo aggiornamento: ${new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}.</em>
</p>
  `.trim();

  return shopifyContent;
}
