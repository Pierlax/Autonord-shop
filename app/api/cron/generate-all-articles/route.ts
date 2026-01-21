/**
 * Endpoint per generare 15 articoli blog con filosofia TAYA/Krug/JTBD
 * POST /api/cron/generate-all-articles
 * Header: Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

interface ArticlePlan {
  id: number;
  category: string;
  title: string;
  topic: string;
  imageQuery: string;
  featured?: boolean;
}

const ARTICLES_PLAN: ArticlePlan[] = [
  {
    id: 1,
    category: "Prezzi e Costi",
    title: "Quanto Costa Davvero Attrezzare un Furgone da Elettricista? Guida ai Prezzi 2026",
    topic: "Costi reali per allestire un furgone da elettricista professionista con tutti gli utensili necessari. Includi: lista completa utensili, prezzi per fascia (entry-level, medio, professionale), costi nascosti, come risparmiare senza compromettere la qualità.",
    imageQuery: "electrician van tools equipment professional",
    featured: true
  },
  {
    id: 2,
    category: "Prezzi e Costi",
    title: "Milwaukee M18: Quanto Costa Costruire un Kit Completo? Analisi Prezzi 2026",
    topic: "Analisi dettagliata dei costi per costruire un kit Milwaukee M18 completo. Confronta: kit base vs kit professionale, prezzi singoli utensili vs combo kit, quando conviene comprare separatamente, strategie per costruire il kit gradualmente.",
    imageQuery: "Milwaukee M18 FUEL power tools kit red"
  },
  {
    id: 3,
    category: "Prezzi e Costi",
    title: "Batterie Originali vs Compatibili: Vale la Pena Risparmiare?",
    topic: "Confronto onesto tra batterie originali e compatibili per Milwaukee, Makita, DeWalt. Test reali: durata cicli, capacità effettiva, sicurezza, garanzia. Quando le compatibili sono ok e quando è meglio evitarle.",
    imageQuery: "power tool batteries Milwaukee Makita comparison"
  },
  {
    id: 4,
    category: "Confronti",
    title: "Milwaukee vs Makita vs DeWalt: Il Confronto Definitivo per Professionisti 2026",
    topic: "Confronto imparziale dei tre giganti. Analizza: ecosistema batterie, assistenza in Italia, prezzi medi, punti di forza e debolezza di ciascuno, quale scegliere per ogni mestiere (elettricista, idraulico, carpentiere, meccanico).",
    imageQuery: "Milwaukee Makita DeWalt power tools comparison",
    featured: true
  },
  {
    id: 5,
    category: "Confronti",
    title: "Makita 40V XGT vs 18V LXT: Vale la Pena l'Upgrade?",
    topic: "Guida per chi ha già Makita 18V LXT e valuta il 40V XGT. Quando conviene: potenza necessaria, compatibilità, costi di transizione, utensili disponibili. Casi d'uso specifici dove il 40V fa davvero la differenza.",
    imageQuery: "Makita XGT 40V vs LXT 18V tools"
  },
  {
    id: 6,
    category: "Confronti",
    title: "Hilti vs Milwaukee: Chi Vince nel Cantiere Pesante?",
    topic: "Confronto per lavori industriali pesanti. Analizza: tassellatori, demolitore, sistemi di ancoraggio, assistenza e noleggio, costo totale di proprietà. Quando Hilti vale il premium e quando Milwaukee basta.",
    imageQuery: "Hilti Milwaukee construction heavy duty tools"
  },
  {
    id: 7,
    category: "Confronti",
    title: "I 5 Migliori Tassellatori SDS-Plus per Muratori 2026",
    topic: "Classifica dei migliori tassellatori SDS-Plus. Per ogni modello: specifiche, prezzo, pro e contro reali, per chi è adatto. Include: Bosch GBH, Milwaukee M18 CHX, Makita HR2470, DeWalt DCH273, Hilti TE 4-A22.",
    imageQuery: "SDS Plus rotary hammer drill professional"
  },
  {
    id: 8,
    category: "Problemi e Soluzioni",
    title: "Batteria Milwaukee che Non Si Carica: 7 Cause e Soluzioni",
    topic: "Guida troubleshooting completa. Cause: temperatura, celle danneggiate, contatti sporchi, caricatore difettoso, firmware. Soluzioni step-by-step, quando è riparabile e quando va sostituita, come prevenire.",
    imageQuery: "Milwaukee M18 battery charger troubleshooting"
  },
  {
    id: 9,
    category: "Problemi e Soluzioni",
    title: "Perché il Tuo Avvitatore Perde Potenza? Diagnosi e Soluzioni",
    topic: "Diagnosi perdita potenza avvitatori. Cause: batteria degradata, carboncini consumati, ingranaggi usurati, elettronica. Test da fare, manutenzione preventiva, quando riparare vs sostituire.",
    imageQuery: "impact driver repair maintenance power tools"
  },
  {
    id: 10,
    category: "Problemi e Soluzioni",
    title: "Come Prolungare la Vita delle Batterie al Litio: Guida Completa",
    topic: "Best practices per batterie Li-Ion. Cosa fare: cicli di carica ottimali, temperatura di stoccaggio, quando ricaricare. Cosa evitare: scarica completa, caldo/freddo estremo, carica notturna. Miti da sfatare.",
    imageQuery: "lithium battery power tools care maintenance"
  },
  {
    id: 11,
    category: "Problemi e Soluzioni",
    title: "Tassellatore che Si Surriscalda: Cause e Prevenzione",
    topic: "Perché i tassellatori si surriscaldano. Cause: punte spuntate, pressione eccessiva, mancanza lubrificazione, ventilazione bloccata. Prevenzione, manutenzione SDS, quando fermarsi, danni da evitare.",
    imageQuery: "rotary hammer drill overheating maintenance"
  },
  {
    id: 12,
    category: "Guide Pratiche",
    title: "Come Scegliere il Primo Kit di Utensili Cordless: Guida per Chi Inizia",
    topic: "Guida per principianti. Errori comuni da evitare, quale brand scegliere, utensili essenziali vs nice-to-have, budget realistici per fascia, come costruire il kit gradualmente, combo kit vs acquisti singoli.",
    imageQuery: "cordless power tools starter kit beginner"
  },
  {
    id: 13,
    category: "Guide Pratiche",
    title: "Milwaukee M12 vs M18: Quale Sistema Scegliere?",
    topic: "Guida alla scelta tra M12 compatto e M18 potente. Casi d'uso: M12 per elettricisti e spazi stretti, M18 per potenza. Utensili disponibili solo in un sistema, strategia dual-system, costi comparati.",
    imageQuery: "Milwaukee M12 M18 tools comparison compact"
  },
  {
    id: 14,
    category: "Recensioni",
    title: "I 5 Migliori Avvitatori a Impulsi per Meccanici e Gommisti 2026",
    topic: "Classifica avvitatori a impulsi 1/2 pollice per officine. Modelli: Milwaukee M18 FHIWF12, Makita DTW1002, DeWalt DCF899, Ingersoll Rand W7152. Per ogni modello: coppia, velocità, ergonomia, prezzo, verdetto.",
    imageQuery: "impact wrench mechanic automotive 1/2 inch",
    featured: true
  },
  {
    id: 15,
    category: "Recensioni",
    title: "Smerigliatrici Angolari a Batteria: Le Migliori del 2026",
    topic: "Confronto smerigliatrici 115/125mm cordless. Modelli: Milwaukee M18 CAG125X, Makita DGA504, DeWalt DCG405, Bosch GWS 18V-10. Analisi: potenza vs cablate, autonomia, sicurezza, per quale uso.",
    imageQuery: "cordless angle grinder 125mm professional"
  }
];

const TAYA_SYSTEM_PROMPT = `Sei Marco, il tecnico senior di Autonord Service a Genova con 25 anni di esperienza. Scrivi articoli per il blog aziendale seguendo rigorosamente la filosofia TAYA (They Ask, You Answer), i principi di Steve Krug (Don't Make Me Think) e il framework JTBD (Jobs To Be Done).

## FILOSOFIA TAYA - REGOLE FONDAMENTALI:
1. **Onestà Radicale**: Ammetti sempre i difetti dei prodotti. Se un utensile ha problemi noti, dillo chiaramente.
2. **Prezzi Trasparenti**: Includi sempre prezzi reali in Euro per il mercato italiano. Mai nascondere i costi.
3. **Confronti Imparziali**: Non favorire mai un brand. Se Milwaukee è meglio per X, dillo. Se Makita è meglio per Y, dillo.
4. **Rispondi alle Domande Scomode**: Le domande che i venditori evitano sono quelle a cui devi rispondere per primo.

## STILE DI SCRITTURA (KRUG):
- Prima riga = problema che risolve o dato provocatorio che cattura l'attenzione
- Paragrafi brevi (max 3-4 righe)
- Sottotitoli chiari e descrittivi (usa H2 per sezioni principali, H3 per sottosezioni)
- Bullet points per liste
- Tabelle per confronti di specifiche e prezzi
- **Grassetto** per concetti chiave
- Niente fuffa, solo informazioni utili e actionable

## FRAMEWORK JTBD:
- Ogni prodotto/soluzione deve essere legato a un "job" specifico che il lettore vuole completare
- Identifica il vero problema che il lettore sta cercando di risolvere
- Scrivi per l'artigiano che deve prendere una decisione domani mattina

## STRUTTURA ARTICOLO:
1. **Apertura provocatoria** (1-2 frasi con dato concreto o domanda che il lettore si sta facendo)
2. **Il problema reale** (perché il lettore sta cercando questa informazione, cosa rischia se sbaglia)
3. **Contenuto principale** (organizzato in sezioni logiche con H2/H3)
4. **Tabelle comparative** (quando appropriato - prezzi, specifiche, pro/contro)
5. **Verdetto onesto** (con "Scegli X se..." / "Scegli Y se..." / "Evita se...")
6. **Call to action** (invito a contattare per consulenza personalizzata, non vendita aggressiva)

## PAROLE BANNATE (mai usare):
- "leader di settore", "eccellenza", "qualità superiore" (senza dati)
- "il migliore" (senza confronto specifico), "innovativo" (senza spiegare cosa)
- "soluzione ideale", "perfetto per", "rivoluzionario"

## DATI E PREZZI:
- Usa prezzi realistici per il mercato italiano 2024-2026
- Cita modelli specifici con codici prodotto quando possibile
- Includi range di prezzo (es. "450-550€" non "circa 500€")

## FORMATO OUTPUT:
Restituisci SOLO il contenuto HTML dell'articolo, pronto per essere inserito nel body.
Usa questi tag: <h2>, <h3>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>, <em>, <blockquote>
NON usare: <h1> (sarà il titolo separato), <html>, <body>, <head>, <script>, <style>

Lunghezza target: 1800-2500 parole.
Scrivi in italiano.`;

async function searchForImage(query: string): Promise<string | null> {
  if (!SERPAPI_API_KEY) {
    console.log('SERPAPI_API_KEY not set, skipping image search');
    return null;
  }
  
  try {
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query + ' product')}&num=10&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      // Filter for high-quality images
      const goodImages = data.images_results.filter((img: any) => 
        img.original && 
        !img.original.includes('placeholder') &&
        !img.original.includes('logo') &&
        img.original.match(/\.(jpg|jpeg|png|webp)/i)
      );
      
      // Prefer images from manufacturer sites
      const preferredDomains = ['milwaukeetool', 'makitatools', 'dewalt', 'hilti', 'bosch'];
      const preferred = goodImages.find((img: any) => 
        preferredDomains.some(d => img.original?.toLowerCase().includes(d))
      );
      
      return preferred?.original || goodImages[0]?.original || null;
    }
    return null;
  } catch (error) {
    console.error('Error searching for image:', error);
    return null;
  }
}

async function generateArticleContent(article: ArticlePlan): Promise<string> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  
  const userPrompt = `Scrivi un articolo completo e approfondito per il blog di Autonord Service su:

**Titolo:** ${article.title}
**Categoria:** ${article.category}
**Argomento da trattare:** ${article.topic}

Ricorda:
- Scrivi come se stessi parlando con un artigiano che entra in negozio e ti fa una domanda diretta
- Includi prezzi reali in Euro per il mercato italiano
- Se fai confronti, usa tabelle con dati concreti
- Sii onesto sui difetti e limiti dei prodotti
- Concludi con consigli pratici e actionable`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4500,
    messages: [
      { role: 'user', content: userPrompt }
    ],
    system: TAYA_SYSTEM_PROMPT
  });
  
  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }
  throw new Error('Unexpected response type from Claude');
}

async function getBlogId(): Promise<string> {
  const query = `query { blogs(first: 1) { edges { node { id handle } } } }`;
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query })
  });
  
  const data = await response.json();
  return data.data?.blogs?.edges[0]?.node?.id || 'gid://shopify/Blog/90210009430';
}

async function createArticle(
  blogId: string,
  title: string,
  content: string,
  category: string,
  imageUrl: string | null,
  featured: boolean = false
): Promise<any> {
  const tags = [category.toLowerCase().replace(/ /g, '-')];
  if (featured) tags.push('featured', 'in-evidenza');
  
  // Add category-specific tags
  const categoryTags: Record<string, string[]> = {
    'Confronti': ['confronto', 'comparazione', 'versus'],
    'Prezzi e Costi': ['prezzi', 'guida-prezzi', 'costi', 'budget'],
    'Problemi e Soluzioni': ['risoluzione-problemi', 'troubleshooting', 'manutenzione'],
    'Guide Pratiche': ['guida', 'tutorial', 'come-fare'],
    'Recensioni': ['recensione', 'migliori', 'top-5', 'classifica']
  };
  
  if (categoryTags[category]) {
    tags.push(...categoryTags[category]);
  }
  
  const mutation = `
    mutation CreateArticle($blogId: ID!, $article: ArticleCreateInput!) {
      articleCreate(blogId: $blogId, article: $article) {
        article {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const articleInput: any = {
    title,
    body: content,
    tags,
    isPublished: true,
    publishDate: new Date().toISOString()
  };
  
  // Add image if available
  if (imageUrl) {
    articleInput.image = {
      src: imageUrl,
      altText: title
    };
  }
  
  const variables = {
    blogId,
    article: articleInput
  };
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query: mutation, variables })
  });
  
  return response.json();
}

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('🚀 Starting blog article generation...');
  
  try {
    // Get blog ID
    const blogId = await getBlogId();
    console.log(`📚 Blog ID: ${blogId}`);
    
    const results: { 
      success: Array<{ title: string; handle: string }>;
      failed: Array<{ title: string; error: string }>;
    } = { success: [], failed: [] };
    
    for (const article of ARTICLES_PLAN) {
      console.log(`\n📝 [${article.id}/15] Generating: ${article.title}`);
      
      try {
        // Generate content with Claude
        console.log('   ⏳ Generating content with Claude...');
        const content = await generateArticleContent(article);
        console.log('   ✅ Content generated');
        
        // Search for image
        console.log('   🔍 Searching for image...');
        const imageUrl = await searchForImage(article.imageQuery);
        console.log(imageUrl ? '   ✅ Image found' : '   ⚠️ No image found');
        
        // Create article on Shopify
        console.log('   📤 Publishing to Shopify...');
        const result = await createArticle(
          blogId,
          article.title,
          content,
          article.category,
          imageUrl,
          article.featured
        );
        
        if (result.data?.articleCreate?.article) {
          console.log(`   ✅ Published: ${result.data.articleCreate.article.handle}`);
          results.success.push({
            title: article.title,
            handle: result.data.articleCreate.article.handle
          });
        } else {
          const errorMsg = JSON.stringify(result.data?.articleCreate?.userErrors || result.errors);
          console.log(`   ❌ Error: ${errorMsg}`);
          results.failed.push({ title: article.title, error: errorMsg });
        }
        
        // Rate limiting - wait 3 seconds between articles to avoid API limits
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`   ❌ Error: ${errorMsg}`);
        results.failed.push({ title: article.title, error: errorMsg });
      }
    }
    
    console.log('\n\n📊 SUMMARY');
    console.log(`✅ Success: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    
    return NextResponse.json({
      success: true,
      message: `Generated ${results.success.length} articles, ${results.failed.length} failed`,
      results
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to generate articles',
    articlesPlanned: ARTICLES_PLAN.length
  });
}
