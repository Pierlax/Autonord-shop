/**
 * Worker per generare un singolo articolo blog
 * Chiamato da QStash
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

interface ArticlePayload {
  id: number;
  category: string;
  title: string;
  topic: string;
  imageQuery: string;
  featured?: boolean;
  blogId: string;
}

const TAYA_SYSTEM_PROMPT = `Siete la Redazione Tecnica di Autonord Service a Genova, un team con oltre 40 anni di esperienza combinata nel settore. Scrivete articoli per il blog aziendale seguendo rigorosamente la filosofia TAYA (They Ask, You Answer), i principi di Steve Krug (Don't Make Me Think) e il framework JTBD (Jobs To Be Done). Usate il "noi" editoriale per rappresentare l'esperienza collettiva del team.

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
      const goodImages = data.images_results.filter((img: any) => 
        img.original && 
        !img.original.includes('placeholder') &&
        !img.original.includes('logo') &&
        img.original.match(/\.(jpg|jpeg|png|webp)/i)
      );
      
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

async function generateArticleContent(article: ArticlePayload): Promise<string> {
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

async function createArticle(
  title: string,
  content: string,
  category: string,
  imageUrl: string | null,
  featured: boolean = false
): Promise<any> {
  const tags = [category.toLowerCase().replace(/ /g, '-')];
  if (featured) tags.push('featured', 'in-evidenza');
  
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
  
  // Updated mutation with correct Shopify GraphQL syntax
  const mutation = `
    mutation CreateArticle($article: ArticleCreateInput!, $blog: ArticleBlogInput!) {
      articleCreate(article: $article, blog: $blog) {
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
    author: {
      name: "Marco - Autonord Service"
    },
    isPublished: true,
    publishDate: new Date().toISOString()
  };
  
  if (imageUrl) {
    articleInput.image = {
      url: imageUrl,
      altText: title
    };
  }
  
  const variables = {
    blog: {
      title: "News"
    },
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
  // Skip signature verification for now (same as enrich-product worker)
  
  try {
    const payload: ArticlePayload = await request.json();
    
    console.log(`📝 Generating article: ${payload.title}`);
    
    // Generate content with Claude
    console.log('   ⏳ Generating content with Claude...');
    const content = await generateArticleContent(payload);
    console.log('   ✅ Content generated');
    
    // Search for image
    console.log('   🔍 Searching for image...');
    const imageUrl = await searchForImage(payload.imageQuery);
    console.log(imageUrl ? '   ✅ Image found' : '   ⚠️ No image found');
    
    // Create article on Shopify
    console.log('   📤 Publishing to Shopify...');
    const result = await createArticle(
      payload.title,
      content,
      payload.category,
      imageUrl,
      payload.featured
    );
    
    if (result.data?.articleCreate?.article) {
      console.log(`   ✅ Published: ${result.data.articleCreate.article.handle}`);
      return NextResponse.json({
        success: true,
        article: result.data.articleCreate.article
      });
    } else {
      const errorMsg = JSON.stringify(result.data?.articleCreate?.userErrors || result.errors);
      console.log(`   ❌ Error: ${errorMsg}`);
      return NextResponse.json({
        success: false,
        error: errorMsg
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
