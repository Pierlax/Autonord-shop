/**
 * Worker per rigenerare un singolo prodotto
 * Chiamato da QStash
 * 
 * 1. Ricerca informazioni tecniche online
 * 2. Genera scheda prodotto con Claude (filosofia TAYA)
 * 3. Cerca immagini con SerpAPI
 * 4. Crea il prodotto su Shopify
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

const PRODUCT_SYSTEM_PROMPT = `Sei Marco, il tecnico senior di Autonord Service a Genova con 25 anni di esperienza. Scrivi schede prodotto per l'e-commerce aziendale seguendo rigorosamente la filosofia TAYA (They Ask, You Answer).

## FILOSOFIA TAYA - REGOLE FONDAMENTALI:
1. **Onestà Radicale**: Ammetti sempre i difetti dei prodotti. Se un utensile ha problemi noti, dillo chiaramente.
2. **Prezzi Trasparenti**: Il prezzo è già nel sistema, tu devi spiegare se vale quei soldi.
3. **Per Chi È / Per Chi NON È**: Sii chiaro su chi dovrebbe comprarlo e chi no.
4. **Rispondi alle Domande Scomode**: Le domande che i venditori evitano sono quelle a cui devi rispondere per primo.

## STRUTTURA SCHEDA PRODOTTO (JSON):
Restituisci un JSON con questa struttura:

{
  "cleanTitle": "Titolo pulito e professionale del prodotto",
  "shortDescription": "Descrizione breve (max 160 caratteri) per SEO e anteprima",
  "bodyHtml": "Descrizione HTML completa (vedi formato sotto)",
  "metaTitle": "Titolo SEO (max 60 caratteri)",
  "metaDescription": "Meta description SEO (max 160 caratteri)",
  "tags": ["tag1", "tag2", "tag3"],
  "productType": "Categoria prodotto pulita"
}

## FORMATO bodyHtml:
La descrizione deve includere queste sezioni in HTML:

1. **Sintesi Rapida** (3-4 righe che rispondono: Cosa fa? Per chi? Perché sceglierlo?)
2. **Specifiche Tecniche** (tabella con dati reali se disponibili, altrimenti "Contattaci per specifiche")
3. **Per Chi È Questo Prodotto** (lista bullet: ideale per X, Y, Z)
4. **Per Chi NON È** (lista bullet: sconsigliato se X, Y)
5. **Domande Frequenti** (2-3 FAQ reali che un cliente farebbe)
6. **Il Nostro Consiglio** (opinione onesta del tecnico)

Usa questi tag HTML: <h2>, <h3>, <p>, <ul>, <li>, <table>, <tr>, <th>, <td>, <strong>, <em>

## REGOLE IMPORTANTI:
- Se non conosci le specifiche esatte, scrivi "Specifiche dettagliate disponibili su richiesta - Contattaci"
- NON inventare dati tecnici falsi
- Se il titolo originale è confuso (es. "ACCETTA 40 cm ACCETTA 40 cm"), puliscilo
- Identifica il brand dal vendor o dal codice SKU (MIL = Milwaukee, MAK = Makita, etc.)
- Scrivi in italiano professionale ma accessibile

## PAROLE BANNATE:
- "leader di settore", "eccellenza", "qualità superiore" (senza dati)
- "il migliore" (senza confronto), "innovativo", "rivoluzionario"
- "soluzione ideale", "perfetto per"

Restituisci SOLO il JSON valido, senza markdown o altro testo.`;

async function searchProductInfo(title: string, sku: string, vendor: string): Promise<string> {
  // Build search query
  const brandHints: Record<string, string> = {
    'MIL': 'Milwaukee',
    'MAK': 'Makita',
    'DEW': 'DeWalt',
    'BOS': 'Bosch',
    'HIL': 'Hilti',
    'HIK': 'HiKOKI',
    'HUS': 'Husqvarna',
    'YAN': 'Yanmar'
  };
  
  const skuPrefix = sku.substring(0, 3).toUpperCase();
  const brand = brandHints[skuPrefix] || vendor || '';
  
  const searchQuery = `${brand} ${title} specifiche tecniche scheda prodotto`;
  
  if (!SERPAPI_API_KEY) {
    return `Prodotto: ${title}\nBrand: ${brand}\nSKU: ${sku}\nNessuna informazione aggiuntiva disponibile (API key mancante)`;
  }
  
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&num=5&hl=it&gl=it&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    let info = `Prodotto: ${title}\nBrand: ${brand}\nSKU: ${sku}\n\nInformazioni trovate online:\n`;
    
    if (data.organic_results && data.organic_results.length > 0) {
      for (const result of data.organic_results.slice(0, 3)) {
        info += `\n- ${result.title}\n  ${result.snippet || ''}\n`;
      }
    }
    
    // Also get knowledge graph if available
    if (data.knowledge_graph) {
      info += `\nKnowledge Graph: ${JSON.stringify(data.knowledge_graph, null, 2)}`;
    }
    
    return info;
  } catch (error) {
    console.error('Error searching product info:', error);
    return `Prodotto: ${title}\nBrand: ${brand}\nSKU: ${sku}\nErrore nella ricerca informazioni`;
  }
}

async function searchProductImage(title: string, vendor: string): Promise<string | null> {
  if (!SERPAPI_API_KEY) {
    console.log('SERPAPI_API_KEY not set, skipping image search');
    return null;
  }
  
  try {
    const searchQuery = `${vendor} ${title} product official`;
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&num=10&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      // Filter good images
      const goodImages = data.images_results.filter((img: any) => 
        img.original && 
        !img.original.includes('placeholder') &&
        !img.original.includes('logo') &&
        img.original.match(/\.(jpg|jpeg|png|webp)/i)
      );
      
      // Prefer official brand domains
      const preferredDomains = ['milwaukeetool', 'makitatools', 'dewalt', 'hilti', 'bosch', 'hikoki', 'husqvarna', 'yanmar'];
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

async function generateProductContent(product: ProductPayload, additionalInfo: string): Promise<any> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  
  const userPrompt = `Genera una scheda prodotto professionale per:

**Titolo originale:** ${product.title}
**SKU:** ${product.sku}
**Vendor:** ${product.vendor}
**Categoria:** ${product.productType}
**Prezzo:** €${product.price}
**Disponibilità:** ${product.inventoryQuantity > 0 ? `${product.inventoryQuantity} disponibili` : 'Su ordinazione'}
${product.barcode ? `**Barcode:** ${product.barcode}` : ''}

**Informazioni aggiuntive trovate:**
${additionalInfo}

Ricorda:
- Pulisci il titolo se è duplicato o confuso
- Se non hai specifiche tecniche certe, indica "Contattaci per specifiche dettagliate"
- Sii onesto su pro e contro
- Identifica il brand corretto dal vendor o SKU`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [
      { role: 'user', content: userPrompt }
    ],
    system: PRODUCT_SYSTEM_PROMPT
  });
  
  const content = response.content[0];
  if (content.type === 'text') {
    try {
      // Try to parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse JSON from Claude response:', e);
    }
  }
  
  throw new Error('Failed to get valid JSON from Claude');
}

async function createShopifyProduct(
  product: ProductPayload,
  generatedContent: any,
  imageUrl: string | null
): Promise<any> {
  const productInput: any = {
    title: generatedContent.cleanTitle || product.title,
    descriptionHtml: generatedContent.bodyHtml || '',
    vendor: product.vendor,
    productType: generatedContent.productType || product.productType,
    tags: Array.from(new Set([...product.tags, ...(generatedContent.tags || []), 'AI-Enhanced'])),
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
    alt: generatedContent.cleanTitle || product.title
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
    // Now create the variant with price and inventory
    const productId = result.data.productCreate.product.id;
    await createProductVariant(productId, product);
    
    // Publish to Online Store
    await publishProduct(productId);
  }
  
  return result;
}

async function createProductVariant(productId: string, product: ProductPayload): Promise<void> {
  // First get the default variant
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
  const variantId = getData.data?.product?.variants?.edges[0]?.node?.id;
  
  if (!variantId) return;
  
  // Update the variant
  const updateMutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
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
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          sku: product.sku,
          barcode: product.barcode,
          inventoryManagement: 'SHOPIFY'
        }
      }
    })
  });
}

async function publishProduct(productId: string): Promise<void> {
  // Get Online Store publication ID
  const pubQuery = `query { publications(first: 10) { edges { node { id name } } } }`;
  
  const pubResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query: pubQuery })
  });
  
  const pubData = await pubResponse.json();
  const onlineStore = pubData.data?.publications?.edges?.find(
    (e: any) => e.node.name === 'Online Store'
  );
  
  if (!onlineStore) return;
  
  const publishMutation = `
    mutation Publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
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

export async function POST(request: NextRequest) {
  try {
    const payload: ProductPayload = await request.json();
    
    console.log(`🔧 Regenerating product: ${payload.title} (${payload.sku})`);
    
    // Step 1: Search for product information
    console.log('   🔍 Searching for product info...');
    const additionalInfo = await searchProductInfo(payload.title, payload.sku, payload.vendor);
    console.log('   ✅ Info gathered');
    
    // Step 2: Generate content with Claude
    console.log('   🤖 Generating content with Claude...');
    const generatedContent = await generateProductContent(payload, additionalInfo);
    console.log('   ✅ Content generated');
    
    // Step 3: Search for product image
    console.log('   🖼️ Searching for image...');
    const imageUrl = await searchProductImage(payload.title, payload.vendor);
    console.log(imageUrl ? '   ✅ Image found' : '   ⚠️ No image found');
    
    // Step 4: Create product on Shopify
    console.log('   📤 Creating product on Shopify...');
    const result = await createShopifyProduct(payload, generatedContent, imageUrl);
    
    if (result.data?.productCreate?.product) {
      console.log(`   ✅ Created: ${result.data.productCreate.product.handle}`);
      return NextResponse.json({
        success: true,
        product: result.data.productCreate.product,
        generatedTitle: generatedContent.cleanTitle
      });
    } else {
      const errorMsg = JSON.stringify(result.data?.productCreate?.userErrors || result.errors);
      console.log(`   ❌ Error: ${errorMsg}`);
      return NextResponse.json({
        success: false,
        error: errorMsg
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error regenerating product:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
