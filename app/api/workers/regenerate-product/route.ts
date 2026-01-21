/**
 * Worker per rigenerare un singolo prodotto
 * Chiamato da QStash
 * 
 * FLUSSO CORRETTO:
 * 1. Mantiene i dati originali (SKU, titolo, vendor, prezzo)
 * 2. Ricerca RAG con lo SKU esatto per trovare info tecniche
 * 3. Claude arricchisce la descrizione SENZA inventare
 * 4. Cerca immagine specifica con lo SKU
 * 5. Crea il prodotto su Shopify mantenendo i dati originali
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

interface ProductPayload {
  sku: string;
  title: string;
  vendor: string;
  productType: string;
  price: string;
  compareAtPrice: string | null;
  barcode: string | null;
  inventoryQuantity: number;
  tags: string[];
}

// ============================================
// STEP 1: RICERCA RAG CON SKU ESATTO
// ============================================

async function searchProductInfoRAG(sku: string, title: string, vendor: string): Promise<{
  foundInfo: string;
  officialSpecs: string | null;
  brand: string;
}> {
  // Determina il brand dallo SKU Milwaukee (inizia con 49)
  let brand = 'Milwaukee';
  if (vendor.toLowerCase().includes('makita')) brand = 'Makita';
  else if (vendor.toLowerCase().includes('dewalt')) brand = 'DeWalt';
  else if (vendor.toLowerCase().includes('bosch')) brand = 'Bosch';
  else if (vendor.toLowerCase().includes('hilti')) brand = 'Hilti';
  else if (vendor.toLowerCase().includes('autonord')) brand = 'Autonord Service';
  
  // Se lo SKU inizia con 49, è sicuramente Milwaukee
  if (sku.startsWith('49')) brand = 'Milwaukee';
  
  if (!SERPAPI_API_KEY) {
    return {
      foundInfo: `SKU: ${sku}\nTitolo originale: ${title}\nBrand: ${brand}\nNessuna ricerca effettuata (API key mancante)`,
      officialSpecs: null,
      brand
    };
  }
  
  try {
    // Ricerca 1: SKU esatto sul sito Milwaukee
    const skuSearchQuery = `Milwaukee ${sku} site:milwaukeetool.eu OR site:milwaukeetool.com`;
    console.log(`RAG Search 1: ${skuSearchQuery}`);
    
    const url1 = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(skuSearchQuery)}&num=5&hl=it&gl=it&api_key=${SERPAPI_API_KEY}`;
    const response1 = await fetch(url1);
    const data1 = await response1.json();
    
    let foundInfo = `SKU: ${sku}\nTitolo originale: ${title}\nBrand: ${brand}\n\n`;
    let officialSpecs: string | null = null;
    
    if (data1.organic_results && data1.organic_results.length > 0) {
      foundInfo += `=== RISULTATI RICERCA SKU ===\n`;
      for (const result of data1.organic_results.slice(0, 3)) {
        foundInfo += `\nFonte: ${result.link}\nTitolo: ${result.title}\nDescrizione: ${result.snippet || 'N/A'}\n`;
        
        // Se troviamo il sito ufficiale Milwaukee, salva le specifiche
        if (result.link?.includes('milwaukeetool')) {
          officialSpecs = result.snippet || null;
        }
      }
    }
    
    // Ricerca 2: Titolo prodotto per più contesto
    const titleSearchQuery = `${brand} "${title.replace(/"/g, '')}" scheda tecnica`;
    console.log(`RAG Search 2: ${titleSearchQuery}`);
    
    const url2 = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(titleSearchQuery)}&num=3&hl=it&gl=it&api_key=${SERPAPI_API_KEY}`;
    const response2 = await fetch(url2);
    const data2 = await response2.json();
    
    if (data2.organic_results && data2.organic_results.length > 0) {
      foundInfo += `\n=== RISULTATI RICERCA TITOLO ===\n`;
      for (const result of data2.organic_results.slice(0, 2)) {
        foundInfo += `\nFonte: ${result.link}\nTitolo: ${result.title}\nDescrizione: ${result.snippet || 'N/A'}\n`;
      }
    }
    
    return { foundInfo, officialSpecs, brand };
    
  } catch (error) {
    console.error('Error in RAG search:', error);
    return {
      foundInfo: `SKU: ${sku}\nTitolo originale: ${title}\nBrand: ${brand}\nErrore nella ricerca`,
      officialSpecs: null,
      brand
    };
  }
}

// ============================================
// STEP 2: RICERCA IMMAGINE CON SKU ESATTO
// ============================================

async function searchProductImageBySKU(sku: string, brand: string, title: string): Promise<string | null> {
  if (!SERPAPI_API_KEY) {
    console.log('SERPAPI_API_KEY not set, skipping image search');
    return null;
  }
  
  try {
    // Strategia 1: Ricerca immagine con SKU esatto
    const searchQueries = [
      `${brand} ${sku}`, // Milwaukee 4932498628
      `${sku} ${brand} product`, // 4932498628 Milwaukee product
      `${brand} ${title.split(' ').slice(0, 3).join(' ')}` // Milwaukee ACCETTA 40
    ];
    
    for (const query of searchQueries) {
      console.log(`Image search: ${query}`);
      
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=15&safe=active&api_key=${SERPAPI_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.images_results && data.images_results.length > 0) {
        // Filtra immagini valide
        const validImages = data.images_results.filter((img: any) => {
          if (!img.original) return false;
          const imgUrl = img.original.toLowerCase();
          
          // Escludi immagini non valide
          if (imgUrl.includes('placeholder')) return false;
          if (imgUrl.includes('logo')) return false;
          if (imgUrl.includes('icon')) return false;
          if (imgUrl.includes('banner')) return false;
          if (imgUrl.includes('avatar')) return false;
          
          // Deve essere un formato immagine valido
          if (!imgUrl.match(/\.(jpg|jpeg|png|webp)/i)) return false;
          
          // Escludi immagini troppo larghe o alte (banner)
          if (img.original_width && img.original_height) {
            const ratio = img.original_width / img.original_height;
            if (ratio > 2.5 || ratio < 0.4) return false;
          }
          
          return true;
        });
        
        // Priorità ai domini ufficiali
        const priorityDomains = [
          'milwaukeetool.eu',
          'milwaukeetool.com',
          'milwaukee',
          'cdn.shopify.com',
          'media.wurth',
          'ferramenta',
          'bricoman',
          'leroymerlin',
          'amazon'
        ];
        
        // Cerca prima nei domini prioritari
        for (const domain of priorityDomains) {
          const found = validImages.find((img: any) => 
            img.original?.toLowerCase().includes(domain)
          );
          if (found?.original) {
            console.log(`Found priority image from ${domain}: ${found.original}`);
            return found.original;
          }
        }
        
        // Altrimenti prendi la prima immagine valida
        if (validImages.length > 0) {
          console.log(`Found image: ${validImages[0].original}`);
          return validImages[0].original;
        }
      }
    }
    
    console.log('No suitable image found');
    return null;
    
  } catch (error) {
    console.error('Error searching for image:', error);
    return null;
  }
}

// ============================================
// STEP 3: GENERAZIONE SCHEDA CON CLAUDE
// ============================================

const PRODUCT_SYSTEM_PROMPT = `Sei Marco, il tecnico senior di Autonord Service a Genova. Scrivi schede prodotto per l'e-commerce.

## REGOLE FONDAMENTALI:
1. **MANTIENI IL TITOLO ORIGINALE** - Puliscilo solo se duplicato (es. "ACCETTA 40 CM ACCETTA 40 CM" → "Accetta 40 cm")
2. **NON INVENTARE** - Usa SOLO le informazioni fornite dalla ricerca RAG
3. **SE NON SAI, SCRIVI "Contattaci"** - Mai inventare specifiche tecniche
4. **MANTIENI LO SKU** - È il codice identificativo, non cambiarlo

## STRUTTURA JSON DA RESTITUIRE:
{
  "cleanTitle": "Titolo pulito (rimuovi duplicati, mantieni sostanza)",
  "shortDescription": "Max 160 caratteri per SEO",
  "bodyHtml": "Descrizione HTML (vedi sotto)",
  "metaTitle": "Max 60 caratteri",
  "metaDescription": "Max 160 caratteri",
  "tags": ["tag1", "tag2"],
  "productType": "Categoria (es. Adattatori, Accessori, Utensili)"
}

## FORMATO bodyHtml:
<h2>Descrizione</h2>
<p>[2-3 frasi basate SOLO sulle info trovate. Se non ci sono info, scrivi "Prodotto professionale [brand]. Contattaci per specifiche dettagliate."]</p>

<h3>Specifiche Tecniche</h3>
<p>[Se hai info dalla ricerca, elencale. Altrimenti: "Specifiche disponibili su richiesta - Chiama 010 7456076"]</p>

<h3>Codice Prodotto</h3>
<p>SKU: [sku] | Brand: [brand]</p>

## IMPORTANTE:
- Il titolo deve essere LEGGIBILE ma fedele all'originale
- NON aggiungere "Milwaukee" se non è nel titolo originale
- NON inventare funzionalità o specifiche
- Se il titolo è un codice (es. "0411"), lascialo così: "Prodotto Codice 0411"

Restituisci SOLO il JSON valido.`;

async function generateProductContent(
  sku: string,
  originalTitle: string,
  brand: string,
  ragInfo: string,
  price: string
): Promise<any> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  
  const userPrompt = `Genera la scheda prodotto per:

**SKU:** ${sku}
**Titolo originale:** ${originalTitle}
**Brand:** ${brand}
**Prezzo:** €${price}

**Informazioni trovate dalla ricerca RAG:**
${ragInfo}

RICORDA: 
- Pulisci il titolo SOLO se duplicato, altrimenti mantienilo fedele
- Usa SOLO le informazioni dalla ricerca RAG
- Se non ci sono info, scrivi "Contattaci per specifiche"`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userPrompt }],
    system: PRODUCT_SYSTEM_PROMPT
  });
  
  const content = response.content[0];
  if (content.type === 'text') {
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  }
  
  // Fallback: genera contenuto minimale
  return {
    cleanTitle: cleanTitle(originalTitle),
    shortDescription: `${brand} ${cleanTitle(originalTitle)} - SKU ${sku}`,
    bodyHtml: `<h2>Descrizione</h2><p>Prodotto professionale ${brand}. Contattaci per specifiche dettagliate al 010 7456076.</p><h3>Codice Prodotto</h3><p>SKU: ${sku} | Brand: ${brand}</p>`,
    metaTitle: `${cleanTitle(originalTitle)} | ${brand}`,
    metaDescription: `${brand} ${cleanTitle(originalTitle)}. SKU ${sku}. Disponibile presso Autonord Service Genova.`,
    tags: [brand, 'Utensili'],
    productType: 'Accessori'
  };
}

function cleanTitle(title: string): string {
  // Rimuovi duplicati (es. "ACCETTA 40 CM ACCETTA 40 CM" → "Accetta 40 Cm")
  const words = title.split(' ');
  const halfLength = Math.floor(words.length / 2);
  
  // Controlla se la seconda metà è uguale alla prima
  const firstHalf = words.slice(0, halfLength).join(' ').toLowerCase();
  const secondHalf = words.slice(halfLength).join(' ').toLowerCase();
  
  let cleanedTitle = title;
  if (firstHalf === secondHalf && halfLength > 0) {
    cleanedTitle = words.slice(0, halfLength).join(' ');
  }
  
  // Capitalizza correttamente
  return cleanedTitle
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// STEP 4: CREAZIONE PRODOTTO SU SHOPIFY
// ============================================

async function createShopifyProduct(
  product: ProductPayload,
  generatedContent: any,
  imageUrl: string | null,
  brand: string
): Promise<any> {
  // Usa il titolo pulito ma mantieni i dati originali
  const productInput: any = {
    title: generatedContent.cleanTitle,
    descriptionHtml: generatedContent.bodyHtml || '',
    vendor: brand, // Usa il brand identificato, non il vendor legale
    productType: generatedContent.productType || 'Accessori',
    tags: Array.from(new Set([brand, ...(generatedContent.tags || []), 'AI-Enhanced'])),
    status: 'ACTIVE',
    seo: {
      title: generatedContent.metaTitle,
      description: generatedContent.metaDescription
    }
  };
  
  const mutation = `
    mutation CreateProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
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
  
  const media = imageUrl ? [{
    originalSource: imageUrl,
    mediaContentType: 'IMAGE',
    alt: generatedContent.cleanTitle
  }] : [];
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: mutation,
      variables: { input: productInput, media }
    })
  });
  
  const result = await response.json();
  
  if (result.data?.productCreate?.product) {
    const productId = result.data.productCreate.product.id;
    
    // Crea variante con SKU e prezzo originali
    await createProductVariant(productId, product);
    
    // Pubblica su Online Store
    await publishProduct(productId);
  }
  
  return result;
}

async function createProductVariant(productId: string, product: ProductPayload): Promise<void> {
  // Prima ottieni la variante di default
  const getVariantQuery = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;
  
  const getResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: getVariantQuery,
      variables: { id: productId }
    })
  });
  
  const getData = await getResponse.json();
  const variantId = getData.data?.product?.variants?.edges?.[0]?.node?.id;
  
  if (!variantId) return;
  
  // Aggiorna la variante con SKU e prezzo ORIGINALI
  const updateMutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          sku
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: updateMutation,
      variables: {
        input: {
          id: variantId,
          sku: product.sku, // SKU ORIGINALE
          price: product.price, // PREZZO ORIGINALE
          barcode: product.barcode,
          inventoryPolicy: 'CONTINUE' // Permetti ordini anche senza stock
        }
      }
    })
  });
}

async function publishProduct(productId: string): Promise<void> {
  // Ottieni l'ID della pubblicazione Online Store
  const getPublicationsQuery = `
    query {
      publications(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  
  const pubResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query: getPublicationsQuery })
  });
  
  const pubData = await pubResponse.json();
  const onlineStore = pubData.data?.publications?.edges?.find(
    (e: any) => e.node.name === 'Online Store'
  );
  
  if (!onlineStore) return;
  
  // Pubblica il prodotto
  const publishMutation = `
    mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: publishMutation,
      variables: {
        id: productId,
        input: [{ publicationId: onlineStore.node.id }]
      }
    })
  });
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const payload: ProductPayload = await request.json();
    
    console.log(`\n🔄 Processing: ${payload.sku} - ${payload.title}`);
    
    // STEP 1: Ricerca RAG con SKU
    console.log('   📚 RAG Search...');
    const { foundInfo, brand } = await searchProductInfoRAG(
      payload.sku,
      payload.title,
      payload.vendor
    );
    console.log(`   ✅ Brand identified: ${brand}`);
    
    // STEP 2: Genera contenuto con Claude
    console.log('   🤖 Generating content...');
    const generatedContent = await generateProductContent(
      payload.sku,
      payload.title,
      brand,
      foundInfo,
      payload.price
    );
    console.log(`   ✅ Title: ${generatedContent.cleanTitle}`);
    
    // STEP 3: Cerca immagine con SKU
    console.log('   🖼️ Searching image...');
    const imageUrl = await searchProductImageBySKU(payload.sku, brand, payload.title);
    console.log(imageUrl ? `   ✅ Image found` : '   ⚠️ No image');
    
    // STEP 4: Crea prodotto su Shopify
    console.log('   📤 Creating on Shopify...');
    const result = await createShopifyProduct(payload, generatedContent, imageUrl, brand);
    
    if (result.data?.productCreate?.product) {
      console.log(`   ✅ Created: ${result.data.productCreate.product.handle}`);
      return NextResponse.json({
        success: true,
        product: result.data.productCreate.product,
        sku: payload.sku
      });
    } else {
      console.error('   ❌ Shopify errors:', result.data?.productCreate?.userErrors);
      return NextResponse.json({
        success: false,
        error: 'Failed to create product',
        details: result.data?.productCreate?.userErrors
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Worker error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Product regeneration worker',
    description: 'POST with product payload to regenerate a single product'
  });
}
