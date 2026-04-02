/**
 * Worker per generare un singolo articolo blog
 * Chiamato da QStash
 */

// Vercel Pro: Allow up to 300 seconds for AI pipeline
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { generateTextSafe } from '@/lib/shopify/ai-client';
import { env } from '@/lib/env';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

function isAuthorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

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


async function generateArticleContent(article: ArticlePayload): Promise<string> {
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

  const result = await generateTextSafe({
    system: TAYA_SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: 4500,
    temperature: 0.5,
  });

  if (!result.text) {
    throw new Error('Empty response from Gemini');
  }
  return result.text;
}

function titleToHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
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
    handle: titleToHandle(title),
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
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // Soft timeout: reject 15s before Vercel's hard limit so QStash can retry cleanly
  const SOFT_TIMEOUT_MS = 285_000;
  let softTimeoutHandle: ReturnType<typeof setTimeout>;
  const softTimeoutPromise = new Promise<never>((_, reject) => {
    softTimeoutHandle = setTimeout(
      () => reject(new Error('SOFT_TIMEOUT')),
      SOFT_TIMEOUT_MS
    );
  });

  try {
    const payload: ArticlePayload = await request.json();

    console.log(`📝 Generating article: ${payload.title}`);

    const result = await Promise.race([
      (async () => {
        // Generate content with Gemini
        console.log('   ⏳ Generating content with Gemini...');
        const content = await generateArticleContent(payload);
        console.log('   ✅ Content generated');

        // Create article on Shopify
        console.log('   📤 Publishing to Shopify...');
        return createArticle(
          payload.title,
          content,
          payload.category,
          null,
          payload.featured
        );
      })(),
      softTimeoutPromise,
    ]);

    clearTimeout(softTimeoutHandle!);

    if (result.data?.articleCreate?.article) {
      console.log(`   ✅ Published: ${result.data.articleCreate.article.handle} (${Date.now() - startTime}ms)`);
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
    clearTimeout(softTimeoutHandle!);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'SOFT_TIMEOUT') {
      console.error(`[generate-article] Soft timeout at ${Date.now() - startTime}ms — QStash will retry`);
      return NextResponse.json({ success: false, error: 'SOFT_TIMEOUT', retryable: true }, { status: 504 });
    }
    console.error('Error generating article:', error);
    return NextResponse.json({
      success: false,
      error: msg
    }, { status: 500 });
  }
}
