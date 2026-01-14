/**
 * Blog Researcher - Article Drafting Module
 * Uses Claude Opus to write premium TAYA-style blog articles
 * 
 * Quality principles:
 * - Indistinguishable from human-written content
 * - Deep technical expertise with accessible language
 * - Honest, balanced, never promotional
 * - Natural Italian with personality
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

const DRAFTING_PROMPT = `Sei un giornalista tecnico freelance che scrive per Autonord Service, un rivenditore di elettroutensili professionali a Genova. Hai un background da artigiano (10 anni come installatore) e ora scrivi articoli tecnici per riviste di settore e blog aziendali.

## LA TUA MISSIONE

Scrivi un articolo che:
1. Risponda DAVVERO alla domanda/problema del lettore
2. Sia così utile che il lettore lo salvi nei preferiti
3. Costruisca fiducia attraverso l'onestà, non attraverso la promozione
4. Si posizioni bene su Google per le ricerche correlate

## IL METODO "THEY ASK, YOU ANSWER"

Marcus Sheridan ha costruito un'azienda da milioni di dollari rispondendo onestamente alle domande dei clienti. I principi:

1. **Parla di prezzi** - Anche se scomodo, la gente cerca prezzi. Sii trasparente.
2. **Ammetti i problemi** - Se un prodotto ha difetti noti, parlane. Costruisce fiducia.
3. **Confronta onestamente** - Non dire "siamo i migliori". Dì "siamo migliori PER questo tipo di cliente".
4. **Mostra i contro** - Ogni prodotto ha svantaggi. Chi li nasconde perde credibilità.
5. **Educa, non vendere** - L'obiettivo è che il lettore prenda la decisione giusta, anche se non compra da te.

## COME SCRIVI

### Struttura dell'articolo
- **Hook** (50-100 parole): Cattura l'attenzione partendo dal PROBLEMA, non dal prodotto
- **Contesto** (100-150 parole): Perché questo argomento è importante, chi dovrebbe leggere
- **Corpo** (800-1200 parole): Analisi approfondita, dati, confronti, esperienze
- **Verdetto** (150-200 parole): Conclusione chiara con raccomandazioni specifiche per profili diversi
- **CTA soft** (50 parole): Invito a contattare per consulenza, mai vendita aggressiva

### Stile di scrittura
- **Italiano naturale**: Scrivi come parli a un collega, non come un manuale
- **Frasi varie**: Alterna frasi brevi e incisive a spiegazioni più articolate
- **Esempi concreti**: "L'elettricista che fa 50 punti luce al giorno" > "l'utilizzatore professionale"
- **Numeri specifici**: "135 Nm di coppia" > "elevata coppia"
- **Opinioni chiare**: "Secondo me..." "Nella mia esperienza..." - non aver paura di prendere posizione

### Cosa EVITARE
- ❌ Iniziare con "In questo articolo parleremo di..."
- ❌ Frasi generiche tipo "La qualità è importante"
- ❌ Elenchi puntati infiniti senza contesto
- ❌ Tono da comunicato stampa aziendale
- ❌ Superlativi vuoti: "eccezionale", "straordinario", "leader di mercato"
- ❌ Conclusioni tipo "In conclusione, possiamo affermare che..."

### Cosa FARE
- ✅ Iniziare con una situazione concreta o una domanda
- ✅ Usare sottotitoli che siano mini-risposte (non solo "Caratteristiche")
- ✅ Includere almeno un'opinione personale controcorrente
- ✅ Citare esperienze reali (anche inventate ma plausibili)
- ✅ Dare consigli actionable che il lettore può usare subito

## FORMATTAZIONE HTML

Usa HTML semantico:
- <h2> per sezioni principali (4-6 per articolo)
- <h3> per sottosezioni
- <p> per paragrafi (mai troppo lunghi, max 4-5 righe)
- <ul>/<ol> per elenchi (ma con moderazione)
- <strong> per enfasi (1-2 per paragrafo max)
- <blockquote> per citazioni o punti chiave
- <table> se servono confronti strutturati

---

## ARGOMENTO DA TRATTARE

**Topic:** {topic}
**Dolore del cliente:** {painPoint}
**Angolo dell'articolo:** {articleAngle}
**Target audience:** {targetAudience}
**Categoria TAYA:** {tayaCategory}
**Hook emotivo:** {emotionalHook}
**Search intent:** {searchIntent}

**Citazioni dai forum (usa come spunto):**
{samplePosts}

---

Scrivi l'articolo completo. Rispondi SOLO con JSON valido:
{
  "title": "Titolo SEO-friendly (50-60 caratteri)",
  "slug": "url-slug-seo-friendly",
  "metaDescription": "Meta description (150-160 caratteri)",
  "content": "<article>...HTML completo...</article>",
  "excerpt": "Riassunto 2-3 frasi per anteprima",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "category": "Guide|Confronti|Recensioni|FAQ",
  "estimatedReadTime": 8
}`;

// Randomize some elements to avoid repetitive patterns
const OPENING_STYLES = [
  'question', // Start with a question
  'scenario', // Start with a concrete scenario
  'statistic', // Start with a surprising fact/number
  'confession', // Start with a personal admission
  'controversy', // Start with a contrarian take
];

function getRandomOpeningStyle(): string {
  return OPENING_STYLES[Math.floor(Math.random() * OPENING_STYLES.length)];
}

/**
 * Generate a TAYA-style article draft
 */
export async function generateArticleDraft(topic: TopicAnalysis): Promise<ArticleDraft> {
  console.log(`[Drafting] Generating premium article for: ${topic.topic}`);
  
  const openingStyle = getRandomOpeningStyle();
  console.log(`[Drafting] Using opening style: ${openingStyle}`);
  
  const prompt = DRAFTING_PROMPT
    .replace('{topic}', topic.topic)
    .replace('{painPoint}', topic.painPoint)
    .replace('{articleAngle}', topic.articleAngle)
    .replace('{targetAudience}', topic.targetAudience)
    .replace('{tayaCategory}', topic.tayaCategory)
    .replace('{emotionalHook}', topic.emotionalHook || 'frustrazione e incertezza')
    .replace('{searchIntent}', topic.searchIntent || topic.topic)
    .replace('{samplePosts}', topic.samplePosts.map(p => `- "${p}"`).join('\n'));

  // Add opening style instruction
  const styleInstruction = `\n\nNOTA: Per questo articolo, usa uno stile di apertura "${openingStyle}". `;
  const styleExamples: Record<string, string> = {
    'question': 'Inizia con una domanda diretta al lettore.',
    'scenario': 'Inizia descrivendo una situazione concreta che il lettore riconoscerà.',
    'statistic': 'Inizia con un dato sorprendente o poco conosciuto.',
    'confession': 'Inizia con un\'ammissione personale o un errore che hai fatto.',
    'controversy': 'Inizia con un\'opinione controcorrente che catturi l\'attenzione.',
  };
  
  const finalPrompt = prompt + styleInstruction + styleExamples[openingStyle];

  try {
    const anthropic = getAnthropicClient();
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 5000,
      temperature: 0.8, // Higher temperature for more creative writing
      messages: [
        { role: 'user', content: finalPrompt },
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
    
    // Quality metrics
    const wordCount = article.content.replace(/<[^>]*>/g, '').split(/\s+/).length;
    const h2Count = (article.content.match(/<h2/g) || []).length;
    const paragraphCount = (article.content.match(/<p>/g) || []).length;
    
    console.log(`[Drafting] Generated: ${article.title}`);
    console.log(`[Drafting] Word count: ${wordCount}`);
    console.log(`[Drafting] Structure: ${h2Count} sections, ${paragraphCount} paragraphs`);
    console.log(`[Drafting] Read time: ${article.estimatedReadTime} min`);
    
    // Quality warnings
    if (wordCount < 1200) {
      console.warn(`[Drafting] Warning: Article may be too short (${wordCount} words)`);
    }
    if (h2Count < 4) {
      console.warn(`[Drafting] Warning: Article may need more sections (${h2Count} h2 tags)`);
    }
    
    return article;
  } catch (error) {
    console.error('[Drafting] Error generating article:', error);
    
    // Return a more detailed fallback
    return {
      title: `${topic.topic} - Guida Completa 2026`,
      slug: topic.topic.toLowerCase()
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 60),
      metaDescription: `${topic.painPoint}. Guida completa con analisi tecnica e consigli pratici per professionisti.`.slice(0, 160),
      content: `<article>
        <h2>Il Problema</h2>
        <p>${topic.painPoint}</p>
        <p>Questo è un argomento che genera molte discussioni tra i professionisti. Vediamo di fare chiarezza.</p>
        
        <h2>Analisi Tecnica</h2>
        <p>L'articolo è in fase di elaborazione manuale. Argomento: ${topic.articleAngle}</p>
        <p>Target: ${topic.targetAudience}</p>
        
        <h2>Il Nostro Verdetto</h2>
        <p>Contenuto in arrivo. Nel frattempo, contattaci per una consulenza personalizzata.</p>
        
        <h2>Hai Domande?</h2>
        <p>Il team tecnico di Autonord Service è a disposizione per aiutarti a scegliere.</p>
      </article>`,
      excerpt: topic.painPoint,
      tags: ['elettroutensili', topic.tayaCategory, 'guida'],
      category: 'Guide',
      estimatedReadTime: 5,
    };
  }
}

/**
 * Convert HTML content to Shopify-compatible format with branding
 */
export function formatForShopify(article: ArticleDraft): string {
  // Add Autonord branding and soft CTA
  const shopifyContent = `
${article.content}

<hr style="margin: 40px 0; border: none; border-top: 1px solid #e5e5e5;">

<div class="article-author" style="display: flex; gap: 20px; align-items: flex-start; padding: 20px; background: #f8f9fa; border-radius: 8px; margin-bottom: 30px;">
  <div>
    <p style="margin: 0 0 10px 0;"><strong>Autonord Service</strong></p>
    <p style="margin: 0; font-size: 14px; color: #666;">
      Dal 2006 siamo il punto di riferimento per l'edilizia professionale a Genova. 
      Vendita, noleggio e assistenza tecnica specializzata.
    </p>
  </div>
</div>

<div class="article-cta" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; border-radius: 8px; text-align: center;">
  <h3 style="margin: 0 0 15px 0; color: white;">Hai bisogno di una consulenza?</h3>
  <p style="margin: 0 0 20px 0; opacity: 0.9;">
    Il nostro team tecnico può aiutarti a scegliere l'attrezzatura giusta per le tue esigenze specifiche.
  </p>
  <p style="margin: 0;">
    <a href="tel:0107456076" style="color: #e63946; text-decoration: none; font-weight: bold; font-size: 18px;">📞 010 7456076</a>
    <span style="margin: 0 15px; opacity: 0.5;">|</span>
    <a href="/contact" style="color: #e63946; text-decoration: none; font-weight: bold;">Scrivici →</a>
  </p>
</div>

<p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">
  <em>Ultimo aggiornamento: ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</em>
</p>
  `.trim();

  return shopifyContent;
}
