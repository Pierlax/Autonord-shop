/**
 * Worker per riscrivere schede prodotto con Claude Opus
 * 
 * FLUSSO:
 * 1. Riceve i dati del prodotto esistente da Shopify
 * 2. Claude Opus cerca informazioni su siti produttori, forum, siti specializzati
 * 3. Claude scrive la scheda con filosofia TAYA/Krug/JTBD
 * 4. Include sezione "Opinione dell'Esperto"
 * 5. Cerca immagine ufficiale del prodotto
 * 6. Aggiorna il prodotto su Shopify
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

interface ProductPayload {
  productId: string;
  title: string;
  vendor: string;
  productType: string;
  sku: string | null;
  barcode: string | null;
  tags: string[];
}

// Funzione per sanitizzare gli handle - rimuove caratteri speciali
function sanitizeHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '') // Rimuovi simboli trademark
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '') // Rimuovi altri caratteri speciali
    .replace(/\s+/g, '-') // Spazi -> trattini
    .replace(/-+/g, '-') // Rimuovi trattini multipli
    .replace(/^-|-$/g, '') // Rimuovi trattini iniziali/finali
    .substring(0, 100); // Limita lunghezza
}

interface GeneratedContent {
  title: string;
  description: string;
  expertOpinion: string;
  metaTitle: string;
  metaDescription: string;
  features: string[];
  specifications: string[];
  useCases: string[];
  tags: string[];
  imageUrl: string | null;
  imageAlt: string;
}

// Funzione per chiamare Claude Opus con ricerca web
async function callClaudeWithWebSearch(prompt: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10,
      }
    ],
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Estrai il testo dalla risposta
  let result = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      result += block.text;
    }
  }
  
  return result;
}

// Funzione per generare la scheda prodotto con Claude Opus
async function generateProductContent(product: ProductPayload): Promise<GeneratedContent> {
  const searchTerms = [
    product.sku,
    product.barcode,
    product.title,
    `${product.vendor} ${product.title}`,
  ].filter(Boolean).join(' OR ');

  const prompt = `Sei un esperto di elettroutensili professionali che lavora per Autonord Service, rivenditore specializzato a Genova.

PRODOTTO DA ANALIZZARE:
- Titolo originale: ${product.title}
- Brand: ${product.vendor}
- SKU/Codice: ${product.sku || 'N/A'}
- Barcode/EAN: ${product.barcode || 'N/A'}
- Tipo: ${product.productType || 'Elettroutensile'}

COMPITO:
1. CERCA informazioni dettagliate su questo prodotto specifico sui seguenti tipi di siti:
   - Sito ufficiale del produttore (${product.vendor.toLowerCase()}.com, ${product.vendor.toLowerCase()}.eu, ${product.vendor.toLowerCase()}.it)
   - Forum di professionisti (edilportale, muratoriforum, elettricistaforum)
   - Siti di recensioni specializzate (toolstop, toolsreview)
   - Schede tecniche ufficiali

2. SCRIVI una scheda prodotto seguendo queste filosofie:
   - TAYA (They Ask, You Answer): Rispondi alle domande reali che un professionista farebbe
   - Krug (Don't Make Me Think): Informazioni chiare, immediate, senza gergo inutile
   - JTBD (Jobs To Be Done): Focus su cosa il prodotto permette di FARE, non solo cosa È

3. CREA una sezione "OPINIONE DELL'ESPERTO" che:
   - Sia scritta in prima persona come se fossi un tecnico esperto di Autonord Service
   - Spieghi PERCHÉ questo prodotto è valido per un professionista
   - Includa consigli pratici d'uso
   - Sia onesta su pregi e eventuali limitazioni
   - Rifletta la filosofia e il posizionamento del prodotto nel mercato

4. CERCA l'URL dell'immagine ufficiale del prodotto dal sito del produttore

FORMATO RISPOSTA (JSON valido):
{
  "title": "Titolo ottimizzato per SEO e chiarezza (max 80 caratteri)",
  "description": "Descrizione HTML completa con paragrafi, liste, formattazione. Deve includere: introduzione, caratteristiche principali, specifiche tecniche, applicazioni. Minimo 500 parole.",
  "expertOpinion": "Opinione dell'esperto in HTML (2-3 paragrafi, scritto in prima persona)",
  "metaTitle": "Meta title SEO (max 60 caratteri)",
  "metaDescription": "Meta description SEO (max 160 caratteri)",
  "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "specifications": ["Spec 1: valore", "Spec 2: valore"],
  "useCases": ["Caso d'uso 1", "Caso d'uso 2", "Caso d'uso 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "imageUrl": "URL immagine ufficiale dal sito del produttore o null se non trovata",
  "imageAlt": "Testo alternativo descrittivo per l'immagine"
}

IMPORTANTE:
- Usa SOLO informazioni verificate dalla ricerca, non inventare specifiche tecniche
- Se non trovi informazioni sufficienti, indica chiaramente cosa è basato sul nome del prodotto
- La descrizione deve essere in italiano
- L'opinione dell'esperto deve essere autentica e utile, non promozionale
- Rispondi SOLO con il JSON, senza altro testo`;

  const response = await callClaudeWithWebSearch(prompt);
  
  // Parse JSON dalla risposta
  try {
    // Trova il JSON nella risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Error parsing Claude response:', e);
  }

  // Fallback se il parsing fallisce
  return {
    title: product.title,
    description: `<p>Prodotto ${product.vendor} di alta qualità professionale.</p>`,
    expertOpinion: '<p>Prodotto affidabile per uso professionale.</p>',
    metaTitle: product.title.substring(0, 60),
    metaDescription: `${product.title} - Acquista da Autonord Service, rivenditore autorizzato ${product.vendor}`,
    features: [],
    specifications: [],
    useCases: [],
    tags: [product.vendor.toLowerCase()],
    imageUrl: null,
    imageAlt: product.title,
  };
}

// Funzione per aggiornare il prodotto su Shopify
async function updateProductOnShopify(
  productId: string,
  content: GeneratedContent
): Promise<{ success: boolean; error?: string }> {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`;

  // Costruisci la descrizione HTML completa
  const fullDescription = `
    <div class="product-description">
      ${content.description}
      
      ${content.features.length > 0 ? `
      <div class="product-features">
        <h3>Caratteristiche Principali</h3>
        <ul>
          ${content.features.map(f => `<li>${f}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      ${content.specifications.length > 0 ? `
      <div class="product-specs">
        <h3>Specifiche Tecniche</h3>
        <ul>
          ${content.specifications.map(s => `<li>${s}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      ${content.useCases.length > 0 ? `
      <div class="product-usecases">
        <h3>Applicazioni</h3>
        <ul>
          ${content.useCases.map(u => `<li>${u}</li>`).join('\n')}
        </ul>
      </div>
      ` : ''}
      
      <div class="expert-opinion">
        <h3>💡 Opinione dell'Esperto Autonord</h3>
        ${content.expertOpinion}
      </div>
    </div>
  `;

  // Aggiorna il prodotto
  const updateMutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const allTags = Array.from(new Set([...content.tags, 'AI-Enhanced', 'TAYA']));

  const updateResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: updateMutation,
      variables: {
        input: {
          id: productId,
          title: content.title,
          handle: sanitizeHandle(content.title), // Aggiungi handle sanitizzato
          descriptionHtml: fullDescription,
          tags: allTags,
          seo: {
            title: content.metaTitle,
            description: content.metaDescription,
          },
        },
      },
    }),
  });

  const updateResult = await updateResponse.json();
  
  if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
    return {
      success: false,
      error: updateResult.data.productUpdate.userErrors[0].message,
    };
  }

  // Se abbiamo un'immagine, aggiungila
  if (content.imageUrl) {
    try {
      const imageMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
              }
            }
            mediaUserErrors {
              field
              message
            }
          }
        }
      `;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query: imageMutation,
          variables: {
            productId: productId,
            media: [
              {
                originalSource: content.imageUrl,
                alt: content.imageAlt,
                mediaContentType: 'IMAGE',
              },
            ],
          },
        }),
      });
    } catch (e) {
      console.error('Error adding image:', e);
      // Non fallire se l'immagine non viene aggiunta
    }
  }

  return { success: true };
}

export async function POST(request: NextRequest) {
  try {
    // Verifica autorizzazione QStash
    const authHeader = request.headers.get('authorization');
    const upstashSignature = request.headers.get('upstash-signature');
    
    if (!upstashSignature && authHeader !== 'Bearer autonord-cron-2024-xK9mP2vL8nQ4') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: ProductPayload = await request.json();
    
    if (!payload.productId || !payload.title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Processing product: ${payload.title} (${payload.productId})`);

    // 1. Genera contenuto con Claude Opus + ricerca web
    const content = await generateProductContent(payload);

    // 2. Aggiorna il prodotto su Shopify
    const result = await updateProductOnShopify(payload.productId, content);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        product: payload.title,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product: payload.title,
      newTitle: content.title,
      hasImage: !!content.imageUrl,
      featuresCount: content.features.length,
      specsCount: content.specifications.length,
    });

  } catch (error) {
    console.error('Worker error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
