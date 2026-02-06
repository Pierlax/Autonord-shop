/**
 * Script per generare 15 articoli blog con filosofia TAYA/Krug/JTBD
 * Eseguire con: npx tsx scripts/generate-blog-articles.ts
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

interface ArticlePlan {
  id: number;
  category: string;
  title: string;
  topic: string;
  searchQuery: string;
  imageQuery: string;
  featured?: boolean;
}

const ARTICLES_PLAN: ArticlePlan[] = [
  {
    id: 1,
    category: "Prezzi e Costi",
    title: "Quanto Costa Davvero Attrezzare un Furgone da Elettricista? Guida ai Prezzi 2026",
    topic: "Costi reali per allestire un furgone da elettricista professionista con tutti gli utensili necessari",
    searchQuery: "furgone elettricista attrezzato utensili costi",
    imageQuery: "electrician van tools equipment professional",
    featured: true
  },
  {
    id: 2,
    category: "Prezzi e Costi",
    title: "Milwaukee M18: Quanto Costa Costruire un Kit Completo? Analisi Prezzi 2026",
    topic: "Analisi dettagliata dei costi per costruire un kit Milwaukee M18 completo per diversi mestieri",
    searchQuery: "Milwaukee M18 kit completo prezzi Italia",
    imageQuery: "Milwaukee M18 power tools kit red"
  },
  {
    id: 3,
    category: "Prezzi e Costi",
    title: "Batterie Originali vs Compatibili: Vale la Pena Risparmiare?",
    topic: "Confronto onesto tra batterie originali e compatibili per utensili cordless, con test reali",
    searchQuery: "batterie compatibili Milwaukee Makita DeWalt recensioni durata",
    imageQuery: "power tool batteries comparison"
  },
  {
    id: 4,
    category: "Confronti",
    title: "Milwaukee vs Makita vs DeWalt: Il Confronto Definitivo per Professionisti 2026",
    topic: "Confronto imparziale dei tre giganti degli utensili cordless basato su test reali nei cantieri italiani",
    searchQuery: "Milwaukee vs Makita vs DeWalt confronto professionale Italia",
    imageQuery: "Milwaukee Makita DeWalt power tools comparison",
    featured: true
  },
  {
    id: 5,
    category: "Confronti",
    title: "Makita 40V XGT vs 18V LXT: Vale la Pena l'Upgrade?",
    topic: "Analisi per chi ha già utensili Makita 18V e valuta il passaggio al 40V - quando conviene e quando no",
    searchQuery: "Makita 40V XGT vs 18V LXT confronto upgrade",
    imageQuery: "Makita XGT 40V tools teal"
  },
  {
    id: 6,
    category: "Confronti",
    title: "Hilti vs Milwaukee: Chi Vince nel Cantiere Pesante?",
    topic: "Confronto tra Hilti e Milwaukee per lavori industriali e cantieri pesanti - prezzi, assistenza, durabilità",
    searchQuery: "Hilti vs Milwaukee confronto cantiere professionale",
    imageQuery: "Hilti Milwaukee construction tools"
  },
  {
    id: 7,
    category: "Confronti",
    title: "I 5 Migliori Tassellatori SDS-Plus per Muratori 2026",
    topic: "Guida all'acquisto dei migliori tassellatori per uso professionale con test reali",
    searchQuery: "migliori tassellatori SDS Plus muratori professionali 2024",
    imageQuery: "rotary hammer drill SDS Plus professional"
  },
  {
    id: 8,
    category: "Problemi e Soluzioni",
    title: "Batteria Milwaukee che Non Si Carica: 7 Cause e Soluzioni",
    topic: "Guida completa alla risoluzione dei problemi più comuni delle batterie Milwaukee M18 e M12",
    searchQuery: "batteria Milwaukee non carica problema soluzione reset",
    imageQuery: "Milwaukee battery charger red"
  },
  {
    id: 9,
    category: "Problemi e Soluzioni",
    title: "Perché il Tuo Avvitatore Perde Potenza? Diagnosi e Soluzioni",
    topic: "Cause comuni della perdita di potenza negli avvitatori a impulsi e come risolverle",
    searchQuery: "avvitatore perde potenza causa soluzione manutenzione",
    imageQuery: "impact driver repair maintenance"
  },
  {
    id: 10,
    category: "Problemi e Soluzioni",
    title: "Come Prolungare la Vita delle Batterie al Litio: Guida Completa",
    topic: "Best practices per massimizzare la durata delle batterie degli utensili cordless - cosa fare e cosa evitare",
    searchQuery: "durata batterie litio utensili consigli manutenzione",
    imageQuery: "lithium battery power tools care"
  },
  {
    id: 11,
    category: "Problemi e Soluzioni",
    title: "Tassellatore che Si Surriscalda: Cause e Prevenzione",
    topic: "Perché i tassellatori si surriscaldano e come evitarlo - guida pratica dal laboratorio",
    searchQuery: "tassellatore surriscalda causa soluzione manutenzione",
    imageQuery: "rotary hammer drill construction"
  },
  {
    id: 12,
    category: "Guide Pratiche",
    title: "Come Scegliere il Primo Kit di Utensili Cordless: Guida per Chi Inizia",
    topic: "Guida per chi inizia e deve scegliere il primo sistema di utensili a batteria - errori da evitare",
    searchQuery: "primo kit utensili cordless quale scegliere principiante",
    imageQuery: "cordless power tools starter kit"
  },
  {
    id: 13,
    category: "Guide Pratiche",
    title: "Milwaukee M12 vs M18: Quale Sistema Scegliere?",
    topic: "Guida alla scelta tra il sistema compatto M12 e il potente M18 - quando serve cosa",
    searchQuery: "Milwaukee M12 vs M18 quale scegliere differenze",
    imageQuery: "Milwaukee M12 M18 comparison"
  },
  {
    id: 14,
    category: "Recensioni",
    title: "I 5 Migliori Avvitatori a Impulsi per Meccanici e Gommisti 2026",
    topic: "Guida all'acquisto degli avvitatori a impulsi più potenti per officine meccaniche",
    searchQuery: "migliori avvitatori impulsi meccanici officina 1/2",
    imageQuery: "impact wrench mechanic automotive",
    featured: true
  },
  {
    id: 15,
    category: "Recensioni",
    title: "Smerigliatrici Angolari a Batteria: Le Migliori del 2026",
    topic: "Confronto delle migliori smerigliatrici angolari cordless per professionisti",
    searchQuery: "migliori smerigliatrici angolari batteria professionali",
    imageQuery: "cordless angle grinder professional"
  }
];

const TAYA_SYSTEM_PROMPT = `Siete la Redazione Tecnica di Autonord Service a Genova, un team con oltre 40 anni di esperienza combinata nel settore. Scrivete articoli per il blog aziendale seguendo rigorosamente la filosofia TAYA (They Ask, You Answer), i principi di Steve Krug (Don't Make Me Think) e il framework JTBD (Jobs To Be Done). Usate il "noi" editoriale per rappresentare l'esperienza collettiva del team.

## FILOSOFIA TAYA - REGOLE FONDAMENTALI:
1. **Onestà Radicale**: Ammetti sempre i difetti dei prodotti. Se un utensile ha problemi noti, dillo.
2. **Prezzi Trasparenti**: Includi sempre prezzi reali e aggiornati. Mai nascondere i costi.
3. **Confronti Imparziali**: Non favorire mai un brand. Se Milwaukee è meglio per X, dillo. Se Makita è meglio per Y, dillo.
4. **Rispondi alle Domande Scomode**: Le domande che i venditori evitano sono quelle a cui devi rispondere.

## STILE DI SCRITTURA (KRUG):
- Prima riga = problema che risolve o domanda provocatoria
- Paragrafi brevi (max 3-4 righe)
- Sottotitoli chiari e descrittivi
- Bullet points per liste
- Tabelle per confronti
- Grassetto per concetti chiave
- Niente fuffa, solo informazioni utili

## FRAMEWORK JTBD:
- Ogni prodotto/soluzione deve essere legato a un "job" specifico
- "Quando [situazione], voglio [motivazione], così posso [risultato atteso]"
- Identifica il vero problema che il lettore sta cercando di risolvere

## STRUTTURA ARTICOLO:
1. **Apertura provocatoria** (1-2 frasi che catturano l'attenzione con un dato o domanda)
2. **Il problema reale** (perché il lettore sta cercando questa informazione)
3. **Contenuto principale** (organizzato in sezioni con H2/H3)
4. **Tabelle comparative** (quando appropriato)
5. **Verdetto onesto** (con "Scegli X se..." / "Scegli Y se...")
6. **Call to action** (contattaci per consulenza, non vendita aggressiva)

## PAROLE BANNATE:
- "leader di settore"
- "eccellenza"
- "qualità superiore" (senza dati)
- "il migliore" (senza confronto)
- "innovativo" (senza spiegare cosa)

## FORMATO OUTPUT:
Restituisci SOLO il contenuto HTML dell'articolo (senza tag html/body).
Usa: <h2>, <h3>, <p>, <ul>, <li>, <table>, <strong>, <em>, <blockquote>
NON usare: <h1> (sarà il titolo), <script>, <style>

Lunghezza: 1500-2500 parole.`;

async function searchForImage(query: string): Promise<string | null> {
  if (!SERPAPI_API_KEY) {
    console.log('SERPAPI_API_KEY not set, skipping image search');
    return null;
  }
  
  try {
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=5&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      // Prefer images from reputable sources
      const preferredDomains = ['milwaukee', 'makita', 'dewalt', 'hilti', 'bosch'];
      const preferred = data.images_results.find((img: any) => 
        preferredDomains.some(d => img.original?.includes(d) || img.source?.includes(d))
      );
      return preferred?.original || data.images_results[0]?.original || null;
    }
    return null;
  } catch (error) {
    console.error('Error searching for image:', error);
    return null;
  }
}

async function generateArticleContent(article: ArticlePlan): Promise<string> {
  const userPrompt = `Scrivi un articolo completo per il blog di Autonord Service su:

**Titolo:** ${article.title}
**Categoria:** ${article.category}
**Argomento:** ${article.topic}

L'articolo deve essere completo, con dati reali (prezzi in Euro, modelli specifici, confronti concreti).
Se parli di prezzi, usa range realistici per il mercato italiano 2024-2026.
Se fai confronti, includi tabelle con specifiche tecniche.
Se parli di problemi, includi soluzioni pratiche step-by-step.

Ricorda: scrivi come se stessi parlando con un artigiano che entra in negozio e ti fa una domanda diretta.`;

  const result = await generateTextSafe({
    system: TAYA_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: 4000,
    temperature: 0.5,
  });

  if (!result.text) {
    throw new Error('Empty response from Gemini');
  }
  return result.text;
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
  return data.data.blogs.edges[0]?.node.id || 'gid://shopify/Blog/90210009430';
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
  if (category === 'Confronti') tags.push('confronto', 'comparazione');
  if (category === 'Prezzi e Costi') tags.push('prezzi', 'guida-prezzi');
  if (category === 'Problemi e Soluzioni') tags.push('risoluzione-problemi', 'guida');
  if (category === 'Guide Pratiche') tags.push('guida', 'tutorial');
  if (category === 'Recensioni') tags.push('recensione', 'migliori');
  
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
  
  const variables = {
    blogId,
    article: {
      title,
      body: content,
      tags,
      isPublished: true,
      publishDate: new Date().toISOString(),
      ...(imageUrl && {
        image: {
          src: imageUrl,
          altText: title
        }
      })
    }
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

async function main() {
  console.log('🚀 Starting blog article generation...\n');
  
  // Get blog ID
  const blogId = await getBlogId();
  console.log(`📚 Blog ID: ${blogId}\n`);
  
  const results: { success: string[]; failed: string[] } = { success: [], failed: [] };
  
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
        results.success.push(article.title);
      } else {
        console.log(`   ❌ Error: ${JSON.stringify(result.data?.articleCreate?.userErrors)}`);
        results.failed.push(article.title);
      }
      
      // Rate limiting - wait 2 seconds between articles
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      results.failed.push(article.title);
    }
  }
  
  console.log('\n\n📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed articles:');
    results.failed.forEach(t => console.log(`  - ${t}`));
  }
}

main().catch(console.error);
